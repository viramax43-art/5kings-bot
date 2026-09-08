/**
 * Buy Кирка рудокопа from shop_type_17, wear it, enter city forest as us.
 */
import 'dotenv/config';
import fs from 'fs';
import {
  ensureLoggedIn,
  getActFrame,
  launchBrowser,
  log,
  saveState,
  sleep,
} from './src/browser.js';

async function go(page, url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(1800);
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);

await go(page, 'shop_type_17.html');

const bought = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const doc = act.document;
  const rows = [...doc.querySelectorAll('tr')];
  for (const row of rows) {
    const txt = (row.innerText || '').replace(/\s+/g, ' ');
    if (!/кирка\s+рудокопа/i.test(txt)) continue;
    const btn = [...row.querySelectorAll('input,button')].find((b) =>
      /купить/i.test(b.value || b.textContent || '')
    );
    if (btn) {
      btn.click();
      return { ok: true, via: 'row-btn', txt: txt.slice(0, 160), oc: btn.getAttribute('onclick') };
    }
  }
  // fallback: any butact near text
  const html = doc.body.innerHTML;
  const m = html.match(/Кирка рудокопа[\s\S]{0,800}?butact\('([^']+)'\)/i);
  if (m && typeof act.butact === 'function') {
    act.butact(m[1]);
    return { ok: true, via: 'butact', id: m[1] };
  }
  return { ok: false, sample: (doc.body.innerText || '').slice(0, 200) };
});
log('BUY', bought);
await sleep(2500);

await go(page, 'bag_type_17_mode_0.html');
const bag = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const text = (act.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800);
  const rows = [...act.document.querySelectorAll('tr')];
  for (const row of rows) {
    const txt = row.innerText || '';
    if (!/кирк/i.test(txt)) continue;
    const btn = [...row.querySelectorAll('input,a,button')].find((b) =>
      /одеть|wear/i.test(`${b.value || ''} ${b.textContent || ''} ${b.getAttribute('onclick') || ''} ${b.getAttribute('href') || ''}`)
    );
    if (btn) {
      btn.click();
      return { worn: true, txt: txt.replace(/\s+/g, ' ').slice(0, 160) };
    }
  }
  return { worn: false, text };
});
log('BAG', bag);
await sleep(1500);

// Enter from central square
await go(page, 'place_street_4.html');
const square = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  return {
    href: act?.location?.href,
    text: (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    elng: !!act?.document?.getElementById('elng'),
  };
});
log('SQUARE', square);

await go(page, 'forest.html');
await sleep(3000);

const forest = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (!w) return { err: 'no act' };
  const btns = [...(w.document.querySelectorAll('input,button,a') || [])]
    .map((el) => ({
      v: (el.value || '').trim(),
      t: (el.textContent || '').trim().slice(0, 60),
      o: (el.getAttribute('onclick') || '').slice(0, 120),
    }))
    .filter((x) => x.v || x.t)
    .slice(0, 40);
  const bots = w.gd?.bots;
  const arr = bots
    ? (Array.isArray(bots) ? bots : Object.values(bots)).filter(Boolean).map((b) => ({
        id: b.bot_id || b.id,
        lvl: b.lvl,
        name: b.n || b.name || b.N || b.nick,
        uid: b.uid || b.UserID,
      }))
    : [];
  return {
    href: w.location.href,
    cuUser: w.cu?.UserID,
    text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
    btns,
    bots: arr,
    canvas: !!w.document.getElementById('canvas'),
  };
});
log('FOREST', forest);
fs.writeFileSync('_tmp_forest_enter.json', JSON.stringify(forest, null, 2));

// If we are not in bots, try clicking enter-like controls / elng / gates
if (!forest.bots?.some((b) => String(b.uid) === String(forest.cuUser) || String(b.id) === String(forest.cuUser))) {
  log('Not on map — try gates / elng');
  await go(page, 'place_street_4.html');
  await page.evaluate(() => {
    const act = document.getElementById('d_act').contentWindow;
    const el = act.document.getElementById('elng');
    if (el) el.click();
  });
  await sleep(2500);
  log(
    'ELNG',
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        href: w?.location?.href,
        text: (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
        cu: !!w?.cu,
        bots: w?.gd?.bots ? Object.keys(w.gd.bots).length : 0,
      };
    })
  );

  await go(page, 'gates.html');
  const gates = await page.evaluate(() => {
    const w = document.getElementById('d_act').contentWindow;
    return {
      href: w.location.href,
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
      btns: [...w.document.querySelectorAll('input,button,a')].map((el) => ({
        v: el.value || '',
        t: (el.textContent || '').trim().slice(0, 50),
        o: (el.getAttribute('onclick') || '').slice(0, 140),
      })),
    };
  });
  log('GATES', gates);
  fs.writeFileSync('_tmp_gates.json', JSON.stringify(gates, null, 2));
}

await saveState(context);
await browser.close();
