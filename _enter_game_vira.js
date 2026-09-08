import { chromium } from 'playwright';
import 'dotenv/config';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
let page = context.pages().find((p) => /5kings/i.test(p.url())) || context.pages()[0];

const cookies = await context.cookies('https://5kings.ru');
console.log(
  'cookies',
  cookies.map((c) => `${c.name}=${String(c.value).slice(0, 24)}`)
);

await page.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
await page.screenshot({ path: '_tmp_vira_index.png', fullPage: true });

const idx = await page.evaluate(() => {
  const t = (document.body && document.body.innerText) || '';
  return {
    url: location.href,
    title: document.title,
    login: !!document.querySelector('#loginform input[name="login"]'),
    pwd: !!document.querySelector('#loginform input[name="pwd"]'),
    play: document.querySelector('#input_button')
      ? {
          val: document.querySelector('#input_button').value,
          onclick: document.querySelector('#input_button').getAttribute('onclick'),
        }
      : null,
    exit: !!document.querySelector('#exit_button, #logoutform, img#exitimg_1'),
    snip: t.replace(/\s+/g, ' ').slice(0, 400),
  };
});
console.log('INDEX', JSON.stringify(idx, null, 2));

if (idx.login && process.env.LOGIN) {
  console.log('logging in as', process.env.LOGIN);
  await page.fill('#loginform input[name="login"]', process.env.LOGIN);
  await page.fill('#loginform input[name="pwd"]', process.env.PASSWORD);
  await page.click('#input_button');
  await sleep(4000);
}

const can = await page.evaluate(() => {
  const btn = document.querySelector('#input_button');
  return !!(btn && /game\.html/i.test(btn.getAttribute('onclick') || ''));
});
console.log('canPlay', can);

if (can) {
  await Promise.all([
    page.waitForURL(/game\.html/i, { timeout: 60000 }).catch(() => null),
    page.click('#input_button'),
  ]);
} else {
  await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
}

await sleep(6000);
const game = await page.evaluate(() => ({
  url: location.href,
  dact: !!document.getElementById('d_act'),
  iframes: [...document.querySelectorAll('iframe')].map((f) => f.id || f.name || f.src),
  htmlLen: (document.documentElement.innerHTML || '').length,
  snip: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 300),
}));
console.log('GAME', game);
await page.screenshot({ path: '_tmp_vira_game2.png' });
process.exit(0);
