import 'dotenv/config';
import { ensureLoggedIn, launchBrowser, sleep, log, saveState } from './src/browser.js';
import fs from 'fs';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);

await page.goto('https://5kings.ru/forum_fid_12_tema_467_mpg_933.shtml', { waitUntil: 'domcontentloaded' });
await sleep(2000);
const t933 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
log('933 has us?', /Игрок121323323/.test(t933), /Рудокоп/.test(t933));
log('933 tail', t933.slice(-800));
fs.writeFileSync('_tmp_forum_933.txt', t933.slice(-1500));

await page.goto('https://5kings.ru/forum_fid_12_tema_467_mpg_932.shtml', { waitUntil: 'domcontentloaded' });
await sleep(1500);

// Find submit button with jQuery submit
const btnInfo = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[onclick]')].filter((el) =>
    /maketem.*submit|#maketem/i.test(el.getAttribute('onclick') || '')
  );
  return nodes.map((el) => ({
    tag: el.tagName,
    id: el.id,
    className: el.className,
    onclick: el.getAttribute('onclick'),
    html: el.outerHTML.slice(0, 300),
  }));
});
log('submit btns', btnInfo);

// captcha elements
const cap = await page.evaluate(() => {
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ');
  const imgs = [...document.querySelectorAll('img')].filter((i) =>
    /capcha|captcha|code/i.test((i.src || '') + (i.id || '') + (i.className || ''))
  );
  return {
    hasHuman: /человек|капч|код/i.test(text),
    snip: text.includes('Подтвердите') ? text.slice(text.indexOf('Подтвердите') - 20, text.indexOf('Подтвердите') + 200) : null,
    imgs: imgs.map((i) => i.src).slice(0, 10),
    inputs: [...document.querySelectorAll('input')].map((i) => ({ name: i.name, id: i.id, type: i.type })).filter((x) => /code|cap|human/i.test(JSON.stringify(x))),
  };
});
log('captcha', cap);

await page.screenshot({ path: '_tmp_forum_captcha.png', fullPage: true });
await saveState(context);
await browser.close();
