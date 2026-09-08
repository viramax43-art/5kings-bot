/**
 * Submit purity application via form POST.
 */
import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, launchBrowser, log, saveState, sleep } from './src/browser.js';

const LAST = 'https://5kings.ru/forum_fid_12_tema_467_mpg_932.shtml';
const MSG = 'Рудокоп I ступени';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);
await page.goto(LAST, { waitUntil: 'domcontentloaded' });
await sleep(1500);

// Inspect all clickable near form
const ui = await page.evaluate(() => {
  const near = [];
  const form = document.querySelector('form');
  const root = form?.parentElement || document.body;
  for (const el of root.querySelectorAll('input,button,img,a')) {
    near.push({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      value: String(el.value || '').slice(0, 80),
      src: el.getAttribute('src') || '',
      onclick: (el.getAttribute('onclick') || '').slice(0, 120),
      alt: el.getAttribute('alt') || '',
      text: (el.textContent || '').trim().slice(0, 60),
    });
  }
  return near.slice(0, 80);
});
fs.writeFileSync('_tmp_forum_ui.json', JSON.stringify(ui, null, 2));
log('UI', ui.filter((x) => /submit|button|img|отправ|сообщ|ok|post|send/i.test(JSON.stringify(x))));

await page.fill('#opisanie, textarea[name=opisanie]', MSG);

const submit = await page.evaluate(() => {
  const form = document.querySelector('form');
  // try common patterns
  const candidates = [
    ...document.querySelectorAll('input[type=submit],input[type=image],button[type=submit],button'),
    ...document.querySelectorAll('img[onclick],a[onclick],input[onclick]'),
  ];
  for (const el of candidates) {
    const s = `${el.type || ''} ${el.value || ''} ${el.name || ''} ${el.getAttribute('onclick') || ''} ${el.alt || ''} ${el.textContent || ''}`;
    if (/submit|отправ|сообщ|ответить|добавить|send|post|ok|подтверд/i.test(s) || el.type === 'image' || el.type === 'submit') {
      el.click();
      return { clicked: s.trim().slice(0, 160), tag: el.tagName };
    }
  }
  if (form) {
    form.submit();
    return { clicked: 'form.submit()', tag: 'FORM' };
  }
  return { clicked: null };
});
log('SUBMIT', submit);
await sleep(4000);

const after = await page.evaluate(() => ({
  href: location.href,
  text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(-900),
}));
log('AFTER', after);
fs.writeFileSync('_tmp_forum_posted.json', JSON.stringify(after, null, 2));

const ok = /Игрок121323323/i.test(after.text) && /Рудокоп/i.test(after.text);
log('SUCCESS?', ok);

await saveState(context);
await browser.close();
