/**
 * Repair corrupted Tampermonkey, install 5kings-bot, verify on a fresh tab.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const STATIC = 8766;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const body = fs.readFileSync(USER_JS);
const server = http.createServer((req, res) => {
  if ((req.url || '').includes('5kings-bot.user.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return void res.end(body);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<a id="inst" href="/5kings-bot.user.js">Install 5Kings Bot</a>');
});
await new Promise((r) => server.listen(STATIC, '127.0.0.1', r));

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);

const repair = await page.evaluate(() => {
  const out = { clicks: [] };
  const mgr = document.querySelector('extensions-manager');
  const detail = mgr?.shadowRoot?.querySelector('extensions-detail-view');
  if (!detail?.shadowRoot) return { error: 'no detail' };

  const walk = (root, depth) => {
    if (!root || depth > 8) return;
    const els = root.querySelectorAll ? [...root.querySelectorAll('*')] : [];
    for (const el of els) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^Восстановить$|^Repair$|^Restore$/i.test(t) && t.length < 20) {
        el.click();
        out.clicks.push('repair:' + el.tagName + '#' + el.id);
      }
      if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
    }
  };
  walk(detail.shadowRoot, 0);

  // also enable main toggle if present
  const enable =
    detail.shadowRoot.querySelector('#enableToggle') ||
    detail.shadowRoot.querySelector('cr-toggle#enable-toggle') ||
    detail.shadowRoot.querySelector('#enable-toggle');
  if (enable && !enable.checked) {
    enable.click();
    out.clicks.push('enableToggle');
  }
  out.text = (detail.shadowRoot.textContent || '').replace(/\s+/g, ' ').slice(0, 400);
  return out;
});
console.log('REPAIR', repair);
await sleep(4000);
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_after_repair.png'), fullPage: true });

const after = await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const detail = mgr?.shadowRoot?.querySelector('extensions-detail-view');
  const t = (detail?.shadowRoot?.textContent || '').replace(/\s+/g, ' ').slice(0, 700);
  return t;
});
console.log('AFTER', after);

// Try install
await page.goto(`http://127.0.0.1:${STATIC}/`, { waitUntil: 'domcontentloaded' });
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 12000 }).catch(() => null),
  page.click('#inst'),
]);
await sleep(3000);
const inst = popup || page;
console.log('install url', inst.url());
const ui = await inst.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 600)
);
console.log('UI', ui);
await inst.screenshot({ path: path.join(ROOT, '_tmp_tm_install2.png'), fullPage: true });
await inst.evaluate(() => {
  const els = [...document.querySelectorAll('input, button, a')];
  const b = els.find((el) =>
    /install|update|установ|обнов/i.test(`${el.textContent || ''} ${el.value || ''}`)
  );
  if (b) b.click();
});
await sleep(2500);

// Fresh game tab
const game = await context.newPage();
const cons = [];
game.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|Tamper|ReferenceError|SyntaxError/i.test(t)) cons.push(t.slice(0, 200));
});
await game.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(7000);
const g = await game.evaluate(() => {
  const d = document;
  return {
    url: location.href,
    beacon: !!d.getElementById('k5-beacon'),
    beaconText: d.getElementById('k5-beacon')?.textContent || null,
    panel: !!d.getElementById('k5-panel'),
    dact: !!d.getElementById('d_act'),
  };
});
console.log('FRESH', g);
console.log('CONS', cons);
await game.screenshot({ path: path.join(ROOT, '_tmp_tm_fresh2.png') });

server.close();
process.exit(0);
