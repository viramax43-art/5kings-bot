/**
 * Find and buy Кирка рудокопа, dump forest identity.
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
  await sleep(1600);
}

async function dump(page, tag) {
  const frame = await getActFrame(page);
  const info = await frame.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500);
    const buttons = [...document.querySelectorAll('input,button,a')]
      .map((el) => ({
        v: (el.value || '').trim(),
        t: (el.textContent || '').trim().slice(0, 80),
        o: (el.getAttribute('onclick') || '').slice(0, 160),
        h: el.getAttribute('href') || '',
        n: el.name || '',
      }))
      .filter((x) => x.v || x.t || x.o || x.h)
      .slice(0, 80);
    return { href: location.href, text, buttons };
  });
  log(tag, info.href);
  log('TEXT', info.text.slice(0, 500));
  const interesting = info.buttons.filter((b) =>
    /кирк|топор|инструмент|оруж|купить|тип|уров|shop|аукц|лот/i.test(JSON.stringify(b))
  );
  log('BTNS', interesting.slice(0, 25));
  fs.writeFileSync(`_tmp_pick_${tag}.json`, JSON.stringify(info, null, 2));
  return info;
}

async function clickRe(page, re) {
  const frame = await getActFrame(page);
  return frame.evaluate((src) => {
    const r = new RegExp(src, 'i');
    for (const el of [...document.querySelectorAll('input,button,a')]) {
      const s = `${el.value || ''} ${el.textContent || ''} ${el.getAttribute('onclick') || ''} ${el.getAttribute('href') || ''}`;
      if (r.test(s)) {
        el.click();
        return s.trim().slice(0, 160);
      }
    }
    return null;
  }, re.source);
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);

await go(page, 'shop.html');
const shop = await dump(page, 'shop');

// Click level 0 / 3 / 8 and weapon / tools categories
for (const re of [/оруж/i, /инструмент/i, /разное/i, /тип.*7\b/, /для уровня:\s*0|value="0"/i]) {
  const c = await clickRe(page, re);
  if (c) {
    log('clicked', c);
    await sleep(1500);
    await dump(page, 'shop2');
    if (/кирк/i.test((await dump(page, 'shop2b')).text)) break;
  }
}

// Try common shop type urls
const urls = [
  'shop_type_7.html',
  'shop_type_17.html',
  'shop.html?type=7',
  'shop_mode_1.html',
  'shop_kind_7.html',
  'auk.html',
  'auction.html',
  'exchange.html',
];
for (const u of urls) {
  await go(page, u);
  const info = await dump(page, u.replace(/\W/g, '_'));
  if (/кирк/i.test(info.text)) {
    log('FOUND in', u);
    const buy = (await clickRe(page, /кирк/i)) || (await clickRe(page, /купить/i));
    log('buy click', buy);
    await sleep(1500);
    await clickRe(page, /купить|приобрести|да\b|ок\b/i);
    await sleep(2000);
    await dump(page, 'after_buy');
  }
}

// Search all bag types
for (const n of [0, 1, 7, 8, 17, 18, 20]) {
  await go(page, `bag_type_${n}_mode_0.html`);
  const t = (await dump(page, `bag${n}`)).text;
  if (/кирк|топор|инструмент/i.test(t)) log('BAG HIT', n);
}

// Forest identity
await go(page, 'forest.html');
await sleep(2500);
const ident = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (!w) return { err: 'no act' };
  const bots = w.gd?.bots;
  let list = [];
  if (bots) {
    const arr = Array.isArray(bots) ? bots.filter(Boolean) : Object.values(bots).filter(Boolean);
    list = arr.map((b) => ({
      id: b.bot_id || b.id,
      uid: b.uid || b.UserID || b.user_id,
      n: b.n || b.name || b.N,
      lvl: b.lvl,
      x: b.pos_x,
      y: b.pos_y,
    }));
  }
  return {
    href: w.location.href,
    cuUser: w.cu?.UserID,
    cuKey: !!w.cu?.UserKey,
    me: list,
  };
});
log('IDENT', ident);
fs.writeFileSync('_tmp_forest_ident.json', JSON.stringify(ident, null, 2));

await saveState(context);
await browser.close();
