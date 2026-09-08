/**
 * Inject v1.0.3 into whatever 5kings tab is open via CDP, open game+forest, start bot.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');

function stripHeader(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => /5kings\.ru/i.test(p.url()));
if (!page) page = await ctx.newPage();

page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot/i.test(t)) console.log(t);
});

console.log('page', page.url());

// Login + game if needed
async function ensure() {
  if (!/game\.html/i.test(page.url())) {
    await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
  }
  // redirected to index?
  if (!/game\.html/i.test(page.url())) {
    console.log('not in game, try login…', page.url());
    await page.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const login = process.env.LOGIN;
    const password = process.env.PASSWORD;
    if (await page.locator('input[name="pwd"]').count()) {
      await page.locator('input[name="login"]').fill(login);
      await page.locator('input[name="pwd"]').fill(password);
      await page.locator('#input_button').click().catch(() => page.keyboard.press('Enter'));
      await page.waitForTimeout(3000);
    }
    // captcha?
    const needCap = await page.locator('input[name="code"]').isVisible().catch(() => false);
    if (needCap) {
      console.log('WAIT CAPTCHA 90s — введите код в окне Chrome');
      await page.waitForFunction(
        () => {
          const b = document.querySelector('#input_button');
          return b && /game\.html/i.test(b.getAttribute('onclick') || '');
        },
        null,
        { timeout: 90000 }
      ).catch(() => null);
    }
    await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }
  console.log('now', page.url());
}

await ensure();

// wait d_act
for (let i = 0; i < 20; i++) {
  const ok = await page.evaluate(() => !!document.getElementById('d_act'));
  if (ok) break;
  await page.waitForTimeout(500);
}

await page.evaluate(() => {
  const el = document.getElementById('d_act');
  if (!el || !el.contentWindow) return;
  const w = el.contentWindow;
  if (/forest/i.test(w.location.href)) return;
  if (typeof w.goR === 'function') w.goR('forest.html');
  else w.location.href = 'forest.html';
});
await page.waitForTimeout(4000);

for (let i = 0; i < 20; i++) {
  const st = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return w ? { cu: !!(w.cu && w.cu.send), href: w.location.href } : null;
  });
  console.log('cu', i, st);
  if (st && st.cu) break;
  await page.waitForTimeout(1000);
}

const code = stripHeader(fs.readFileSync(USER_JS, 'utf8'));
// Remove old panel
await page.evaluate(() => {
  try {
    const p = window.top.document.getElementById('k5-panel');
    if (p) p.remove();
    const s = window.top.document.getElementById('k5-style');
    if (s) s.remove();
    window.top.__k5_bot_runner = null;
  } catch (e) {}
});

const inj = await page.evaluate((src) => {
  try {
    eval(src);
    return {
      ok: true,
      panel: !!document.getElementById('k5-panel'),
      ver: document.querySelector('#k5-panel strong')?.textContent,
      diag: document.getElementById('k5-diag')?.textContent,
    };
  } catch (e) {
    return { ok: false, err: String(e.stack || e) };
  }
}, code);
console.log('inject', inj);

await page.waitForTimeout(500);
const click = await page.evaluate(() => {
  const b = document.getElementById('k5-forest-start');
  if (!b) return false;
  b.click();
  return true;
});
console.log('start clicked', click);
await page.waitForTimeout(10000);
console.log(
  'after',
  await page.evaluate(() => ({
    url: location.href,
    status: document.getElementById('k5-status')?.textContent,
    diag: document.getElementById('k5-diag')?.textContent,
    F: document.getElementById('k5-forest-start')?.classList.contains('on'),
  }))
);

console.log('Оставьте окно открытым — панель должна быть справа сверху.');
await browser.close();
