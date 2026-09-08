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
const shop = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const doc = act.document;
  const items = [...doc.querySelectorAll('table.item, .item, table')].map((t, i) => {
    const txt = (t.innerText || '').replace(/\s+/g, ' ').trim();
    const buy = [...t.querySelectorAll('input,button')].filter((b) =>
      /купить/i.test(b.value || '')
    );
    return {
      i,
      txt: txt.slice(0, 180),
      buy: buy.map((b) => b.getAttribute('onclick') || b.value).slice(0, 3),
      len: txt.length,
    };
  });
  return items.filter((x) => /кирк|грабл|топор/i.test(x.txt)).slice(0, 20);
});
log('ITEMS', shop);

const pick = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const doc = act.document;
  // smallest table/block that mentions кирка
  let best = null;
  let bestLen = 1e9;
  for (const t of [...doc.querySelectorAll('table, tr, div')]) {
    const txt = (t.innerText || '').replace(/\s+/g, ' ');
    if (!/кирка\s+рудокопа/i.test(txt)) continue;
    if (txt.length < 40 || txt.length > 500) continue;
    if (txt.length < bestLen) {
      best = t;
      bestLen = txt.length;
    }
  }
  if (!best) return { ok: false };
  const btn = [...best.querySelectorAll('input,button')].find((b) => /купить/i.test(b.value || ''));
  if (!btn) return { ok: false, txt: best.innerText.slice(0, 200) };
  btn.click();
  return { ok: true, txt: (best.innerText || '').replace(/\s+/g, ' ').slice(0, 200), oc: btn.getAttribute('onclick') };
});
log('PICK BUY', pick);
await sleep(2500);

// Confirm if needed
await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const btn = [...(act?.document.querySelectorAll('input,button') || [])].find((b) =>
    /купить|да\b|ок\b|подтверд/i.test(b.value || b.textContent || '')
  );
  if (btn && /подтверд|да\b/i.test(btn.value || btn.textContent || '')) btn.click();
});
await sleep(1500);

await go(page, 'bag_type_17_mode_0.html');
const bagHtml = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.body.innerHTML
);
fs.writeFileSync('_tmp_bag17_now.html', bagHtml.slice(0, 50000));
const bagText = await page.evaluate(() =>
  (document.getElementById('d_act').contentWindow.document.body.innerText || '').replace(/\s+/g, ' ')
);
log('BAG17', bagText.slice(0, 700));

// Wear pickaxe if present
const worn = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  for (const el of [...act.document.querySelectorAll('a,input,button,*[onclick]')]) {
    const s = `${el.value || ''} ${el.textContent || ''} ${el.getAttribute('onclick') || ''} ${el.getAttribute('href') || ''}`;
    if (/Wear|одеть/i.test(s) && /кирк|17|tool/i.test(s + (el.closest('tr')?.innerText || ''))) {
      el.click();
      return s.slice(0, 160);
    }
  }
  const any = [...act.document.querySelectorAll('a,input,*[onclick]')].find((el) =>
    /actUser-Wear/i.test(`${el.getAttribute('onclick') || ''}${el.getAttribute('href') || ''}`)
  );
  if (any) {
    any.click();
    return 'first-wear ' + (any.getAttribute('onclick') || any.getAttribute('href') || '');
  }
  return null;
});
log('WEAR', worn);

// Forest HTML dump
await go(page, 'place_street_4.html');
await go(page, 'forest.html');
await sleep(2500);
const fhtml = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.documentElement.innerHTML
);
fs.writeFileSync('_tmp_forest_now2.html', fhtml.slice(0, 80000));
log('FOREST HTML len', fhtml.length);
const hints = [];
for (const n of ['войти', 'вход', 'начать', 'медь', 'руд', 'кирк', 'goRC', 'StartCraft', 'confirm']) {
  if (fhtml.toLowerCase().includes(n.toLowerCase())) hints.push(n);
}
log('FOREST hints', hints);

await saveState(context);
await browser.close();
