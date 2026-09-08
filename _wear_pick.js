import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, getActFrame, launchBrowser, log, saveState, sleep } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
await ensureLoggedIn(page, context);
const frame = await getActFrame(page);
await frame.evaluate(() => (typeof goR === 'function' ? goR('bag_type_17_mode_0.html') : (location.href = 'bag_type_17_mode_0.html')));
await sleep(2000);
const html = await frame.evaluate(() => document.body.innerHTML);
fs.writeFileSync('_tmp_bag17_pick.html', html);
const info = await frame.evaluate(() => {
  const els = [...document.querySelectorAll('a,input,button,[onclick]')].map((el) => ({
    tag: el.tagName,
    v: el.value || '',
    t: (el.textContent || '').trim().slice(0, 40),
    o: (el.getAttribute('onclick') || '').slice(0, 160),
    h: el.getAttribute('href') || '',
  }));
  return {
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
    els: els.filter((x) => /одеть|wear|кирк|использовать|взять/i.test(JSON.stringify(x))),
    all: els.slice(0, 40),
  };
});
log(info);
await browser.close();
