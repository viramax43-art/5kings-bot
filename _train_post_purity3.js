import 'dotenv/config';
import { ensureLoggedIn, launchBrowser, sleep, log, saveState } from './src/browser.js';
import fs from 'fs';

const { browser, context, page } = await launchBrowser();
await ensureLoggedIn(page, context);
await page.goto('https://5kings.ru/forum_fid_12_tema_467_mpg_932.shtml', { waitUntil: 'domcontentloaded' });
await sleep(1500);

const formHtml = await page.evaluate(() => document.querySelector('#maketem')?.outerHTML || '');
fs.writeFileSync('_tmp_maketem.html', formHtml);
const ids = [...formHtml.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const onclicks = [...formHtml.matchAll(/onclick="([^"]+)"/g)].map((m) => m[1]);
console.log('ids', ids);
console.log('onclicks', onclicks);

await page.fill('#opisanie', 'Рудокоп I ступени');

// Prefer explicit submit controls
const result = await page.evaluate(() => {
  const form = document.getElementById('maketem');
  const el =
    document.getElementById('send_button') ||
    document.getElementById('add_button') ||
    document.getElementById('ok_button') ||
    document.querySelector('#maketem [id*=send], #maketem [id*=add], #maketem [id*=ok], #maketem [id*=post]');
  if (el) {
    el.click();
    return { via: el.id || el.className, tag: el.tagName };
  }
  // look for div with background submit
  const divs = [...(form?.querySelectorAll('div') || [])];
  for (const d of divs) {
    const id = d.id || '';
    const st = d.getAttribute('style') || '';
    const oc = d.getAttribute('onclick') || '';
    if (/send|отправ|add_comment|submit|ok_but/i.test(id + st + oc)) {
      d.click();
      return { via: id || st.slice(0, 80), tag: 'DIV' };
    }
  }
  form.submit();
  return { via: 'form.submit' };
});
log('submit', result);
await sleep(4000);

const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const ok = /Игрок121323323/i.test(text) && /Рудокоп/i.test(text);
log('url', page.url());
log('tail', text.slice(-700));
log('ok', ok);
fs.writeFileSync('_tmp_forum_verify.txt', text.slice(-1200));
await saveState(context);
await browser.close();
