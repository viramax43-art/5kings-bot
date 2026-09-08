/**
 * Sync unpacked extension + launch Chrome with 5Kings Bot (no Tampermonkey needed).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const EXT_DIR = path.join(ROOT, 'tampermonkey', 'chrome-ext');
const DEST = path.join(ROOT, '.chrome-vira');
const PORT = 9222;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

fs.copyFileSync(SRC_JS, path.join(EXT_DIR, 'content.js'));
console.log('synced content.js', fs.statSync(path.join(EXT_DIR, 'content.js')).size);

try {
  execSync(
    `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'chrome-vira' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"`,
    { stdio: 'ignore' }
  );
} catch (_) {}

await sleep(800);

if (!fs.existsSync(path.join(DEST, 'Default'))) {
  fs.mkdirSync(path.join(DEST, 'Default'), { recursive: true });
}

spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${DEST}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--load-extension=${EXT_DIR}`,
    '--disable-extensions-except=' + EXT_DIR,
    '--no-first-run',
    '--no-default-browser-check',
    '--profile-directory=Default',
    'https://5kings.ru/game.html',
  ],
  { detached: true, stdio: 'ignore' }
).unref();

for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) {
      console.log('CDP up', await r.json());
      break;
    }
  } catch (_) {}
  if (i === 39) throw new Error('CDP timeout');
  await sleep(400);
}

await sleep(4000);
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
let page = context.pages().find((p) => /5kings/i.test(p.url())) || context.pages()[0];

async function probe(p) {
  return p.evaluate(() => {
    const topDoc = (() => {
      try {
        return window.top.document;
      } catch (e) {
        return document;
      }
    })();
    const beacon = topDoc.getElementById('k5-beacon');
    const panel = topDoc.getElementById('k5-panel');
    return {
      url: location.href,
      hasBeacon: !!beacon,
      beaconText: beacon ? beacon.textContent : null,
      hasPanel: !!panel,
      hasDact: !!document.getElementById('d_act'),
      snip: ((topDoc.body && topDoc.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
}

let g = await probe(page).catch((e) => ({ error: e.message }));
console.log('PROBE1', g);

if (!g.hasDact || /login|войд|парол/i.test(g.snip || '')) {
  await page.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
  const needLogin = await page.$('#loginform input[name="login"]');
  if (needLogin && process.env.LOGIN) {
    await page.fill('#loginform input[name="login"]', process.env.LOGIN);
    await page.fill('#loginform input[name="pwd"]', process.env.PASSWORD);
    await page.click('#input_button');
    await sleep(4000);
  }
  const can = await page.evaluate(() => {
    const btn = document.querySelector('#input_button');
    return !!(btn && /game\.html/i.test(btn.getAttribute('onclick') || ''));
  });
  if (can) {
    await Promise.all([
      page.waitForURL(/game\.html/i, { timeout: 60000 }).catch(() => null),
      page.click('#input_button'),
    ]);
  } else {
    await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await sleep(6000);
  g = await probe(page);
  console.log('PROBE2', g);
}

await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(5000);
g = await probe(page);
console.log('FINAL', JSON.stringify(g, null, 2));
await page.screenshot({ path: path.join(ROOT, '_tmp_bot_ext_final.png') });

console.log('SUMMARY', {
  beacon: g.hasBeacon,
  beaconText: g.beaconText,
  panel: g.hasPanel,
  dact: g.hasDact,
});

process.exit(0);
