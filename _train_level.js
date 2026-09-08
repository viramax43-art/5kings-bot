import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = browser.contexts().flatMap((c) => c.pages());
console.log(pages.map((p) => p.url().slice(0, 100)));

let page = pages.find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
if (!page) {
  page = await browser.contexts()[0].newPage();
  await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);
}
await page.bringToFront();

async function go(u) {
  await page.evaluate((url) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) throw new Error('no d_act');
    if (typeof act.goRC === 'function') act.goRC(url);
    else if (typeof act.goR === 'function') act.goR(url);
    else act.location.href = url;
  }, u);
  await sleep(2200);
}
async function text() {
  return page.evaluate(() =>
    (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 1800)
  );
}

const shell = await page.evaluate(() => ({
  url: location.href,
  iframes: [...document.querySelectorAll('iframe')].map((f) => f.id || f.name),
  snip: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
}));
console.log('SHELL', shell);

// Level info
await go('info.html?user=960792');
const info = await text();
console.log('INFO', info.slice(0, 900));
fs.writeFileSync(
  '_tmp_info_now.html',
  await page.evaluate(() => document.getElementById('d_act').contentWindow.document.body.innerHTML)
);

// Try beginner fights / house of fighters for XP
await go('room.chtml');
console.log('ROOM', await text());
await go('arenax.html');
console.log('ARENAX', await text());

// Look for beginner rooms
const arenaHtml = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.body.innerHTML
);
const rooms = [...arenaHtml.matchAll(/arena_room[^"']+/g)].map((m) => m[0]);
console.log('rooms', [...new Set(rooms)].slice(0, 30));

for (const r of [...new Set(rooms)].slice(0, 8)) {
  await go(r.endsWith('.html') ? r : r + '.html');
  const t = await text();
  console.log(r, t.slice(0, 250));
}

process.exit(0);
