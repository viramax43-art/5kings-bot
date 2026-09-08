/**
 * Load official TM 5.5 as unpacked, enable Allow User Scripts,
 * paste 5kings-bot into TM editor, verify on a fresh 5kings tab.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TM_SRC = path.join(
  process.env.LOCALAPPDATA,
  'Google/Chrome/User Data/Profile 5/Extensions/dhdgffkkebhmkfjojejmpbldmpobfkfo/5.5.0_0'
);
const TM_DST = path.join(ROOT, 'tampermonkey', '_tm55');
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const STORE_TM = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!fs.existsSync(path.join(TM_DST, 'manifest.json'))) {
  fs.mkdirSync(TM_DST, { recursive: true });
  try {
    execSync(`robocopy "${TM_SRC}" "${TM_DST}" /E /NFL /NDL /NJH /NJS`, { stdio: 'inherit' });
  } catch (e) {
    if ((e.status ?? 1) >= 8) throw e;
  }
}

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
await sleep(2000);

// Enable developer mode
await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const toolbar = mgr?.shadowRoot?.querySelector('extensions-toolbar');
  const dev = toolbar?.shadowRoot?.querySelector('#devMode');
  if (dev && !dev.checked) dev.click();
});
await sleep(800);

// Try load unpacked via chrome.developerPrivate if exposed — usually not.
// Fallback: drag-drop is hard. Use chrome://extensions load via keyboard? 
// We'll try Web Store first.

await page.goto(
  `https://chromewebstore.google.com/detail/tampermonkey/${STORE_TM}`,
  { waitUntil: 'domcontentloaded', timeout: 60000 }
);
await sleep(4000);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_store.png'), fullPage: true });
const store = await page.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 800)
);
console.log('STORE', store);

const clickedInstall = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, div[role="button"], span')];
  const b = btns.find((el) =>
    /установить|install|добавить в chrome|add to chrome/i.test((el.textContent || '').trim())
  );
  if (!b) return null;
  b.click();
  return (b.textContent || '').trim().slice(0, 80);
});
console.log('store click', clickedInstall);
await sleep(4000);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_store2.png') });

// Chrome install dialog is native — may need to press Tab+Enter via CDP
try {
  await page.keyboard.press('Tab');
  await sleep(300);
  await page.keyboard.press('Enter');
} catch (_) {}
await sleep(5000);

await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.screenshot({ path: path.join(ROOT, '_tmp_exts_after_store.png'), fullPage: true });
const extText = await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  return (mgr?.shadowRoot?.textContent || '').replace(/\s+/g, ' ').slice(0, 1200);
});
console.log('EXTS', extText);

process.exit(0);
