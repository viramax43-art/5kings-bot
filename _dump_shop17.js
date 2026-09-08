import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, getActFrame, launchBrowser, log, sleep } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
await ensureLoggedIn(page, context);
const frame = await getActFrame(page);
await frame.evaluate(() => {
  if (typeof goR === 'function') goR('shop_type_17.html');
  else location.href = 'shop_type_17.html';
});
await sleep(2000);
const html = await frame.evaluate(() => document.documentElement.innerHTML);
fs.writeFileSync('_tmp_shop17.html', html);
const pairs = await frame.evaluate(() => {
  const html = document.body.innerHTML;
  // split by item-ish headers
  const names = [...html.matchAll(/>(Грабли|Инструмент [^<]+|Кирка [^<]+|Топор [^<]+|Пила [^<]+|Плавильная [^<]+|Клубок [^<]+|Корзина [^<]+|Пустая [^<]+|Средство [^<]+)</g)].map((m) => m[1]);
  const ids = [...html.matchAll(/butact\('0-([^']+)'\)/g)].map((m) => m[1]);
  return { names, ids };
});
log(pairs);
await browser.close();
