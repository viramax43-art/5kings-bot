/**
 * Post purity application for Рудокоп I on forum tema 467.
 */
import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, launchBrowser, log, saveState, sleep } from './src/browser.js';

const TOPIC = 'https://5kings.ru/forum_fid_12_tema_467.shtml';
const MSG = 'Рудокоп I ступени';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);

// Open topic (desktop forum with session cookies)
await page.goto(TOPIC, { waitUntil: 'domcontentloaded' });
await sleep(2000);
log('TOPIC', page.url());

// Go to last page if pagination exists
const last = await page.evaluate(() => {
  const links = [...document.querySelectorAll('a')].filter((a) =>
    /mpg_\d+|последн|>>|»/i.test((a.textContent || '') + (a.getAttribute('href') || ''))
  );
  const mpg = links
    .map((a) => ({ h: a.href, t: (a.textContent || '').trim(), n: Number((a.href.match(/mpg_(\d+)/) || [])[1] || 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  return mpg[0] || null;
});
if (last) {
  log('LAST PAGE', last);
  await page.goto(last.h, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
}

// Dump reply form
const formInfo = await page.evaluate(() => {
  const forms = [...document.forms].map((f) => ({
    action: f.getAttribute('action') || '',
    method: f.method,
    inputs: [...f.elements].map((el) => ({
      tag: el.tagName,
      name: el.name,
      type: el.type,
      id: el.id,
      value: String(el.value || '').slice(0, 60),
    })),
  }));
  const textareas = [...document.querySelectorAll('textarea')].map((t) => ({
    name: t.name,
    id: t.id,
  }));
  const snip = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(-800);
  return { forms, textareas, snip, href: location.href };
});
fs.writeFileSync('_tmp_forum_reply_form.json', JSON.stringify(formInfo, null, 2));
log('FORM', JSON.stringify(formInfo, null, 2).slice(0, 2000));

// Fill and submit if possible
const posted = await page.evaluate((msg) => {
  const ta =
    document.querySelector('textarea[name="message"]') ||
    document.querySelector('textarea[name="text"]') ||
    document.querySelector('textarea[name="msg"]') ||
    document.querySelector('#message') ||
    document.querySelector('textarea');
  if (!ta) return { ok: false, why: 'no textarea' };
  ta.value = msg;
  ta.dispatchEvent(new Event('input', { bubbles: true }));

  const btn =
    [...document.querySelectorAll('input[type=submit],button,input[type=button]')].find((b) =>
      /отправ|сообщ|ответить|добавить|send|post/i.test(b.value || b.textContent || '')
    ) || document.querySelector('input[type=submit]');
  if (!btn) return { ok: false, why: 'no submit', hasTa: true };
  btn.click();
  return { ok: true, btn: (btn.value || btn.textContent || '').trim() };
}, MSG);

log('POST CLICK', posted);
await sleep(4000);
log('AFTER', page.url(), (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(-600));
fs.writeFileSync('_tmp_forum_after_post.html', await page.content());

// Verify our nick appears near end
const body = await page.locator('body').innerText();
const hasUs = /Игрок121323323/i.test(body) && /Рудокоп/i.test(body);
log('VERIFY mention', hasUs);

await saveState(context);
await browser.close();
