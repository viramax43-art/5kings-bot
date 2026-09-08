/**
 * After Dragons grant «Чист перед законом»:
 * buy Рудокоп I → equip pickaxe → open forest for copper mining.
 *
 * Usage: node _train_rudokop_after_purity.js
 */
import 'dotenv/config';
import fs from 'fs';
import {
  ensureLoggedIn,
  getActFrame,
  launchBrowser,
  log,
  openForest,
  saveState,
  sleep,
} from './src/browser.js';

const UID = process.env.USER_ID || '960792';

async function go(page, url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(1800);
}

async function actText(page) {
  const frame = await getActFrame(page);
  return frame.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000));
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});

await ensureLoggedIn(page, context);

await go(page, `info.html?user=${UID}`);
const info = await actText(page);
const hasPurity = /чист\s+перед\s+законом|чист перед законом/i.test(info);
const hasRudokop = /рудокоп/i.test(info);
log('INFO', info.slice(0, 900));
log({ hasPurity, hasRudokop });

if (!hasRudokop) {
  if (!hasPurity) {
    log('Нет чистоты — смотри форум tema 467 #9321. Жди отметку «Чист» от Дракона (до 3 суток).');
    log('Тема: https://5kings.ru/forum_fid_12_tema_467_mpg_933.shtml');
    await browser.close();
    process.exit(2);
  }
  await go(page, 'lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
  await sleep(2500);
  log('BUY', await actText(page));
  await go(page, `info.html?user=${UID}`);
  log('INFO2', (await actText(page)).slice(0, 900));
}

// Equip pickaxe
await go(page, 'bag_type_17.html');
log('BAG', (await actText(page)).slice(0, 700));
await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  if (!act) return;
  const el = [...act.document.querySelectorAll('input,button,a')].find((b) =>
    /кирк|надеть|взять|экипир/i.test(`${b.value || ''} ${b.textContent || ''} ${b.getAttribute('onclick') || ''}`)
  );
  if (el) el.click();
});
await sleep(1500);

try {
  await openForest(page);
} catch {
  await go(page, 'forest.html');
}
await sleep(2500);
const fr = await getActFrame(page);
const snap = await fr.evaluate(() => ({
  href: location.href,
  cu: !!(window.cu && window.gd),
  text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
}));
log('FOREST', snap);
fs.writeFileSync('_tmp_rudokop_ready.json', JSON.stringify({ info, snap, at: new Date().toISOString() }, null, 2));

log('Готово к прокачке: в TM включи медь + инструмент + Старт лес (или npm run forest).');
await saveState(context);
await browser.close();
