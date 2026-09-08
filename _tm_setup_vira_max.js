/**
 * Real VIRA MAX (Profile 5): enable Allow User Scripts, paste bot into TM editor,
 * verify it runs on game.html without Playwright inject.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data');
const USER_JS = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');
const PORT = 9223;
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitCdp() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('CDP timeout');
}

console.log('Closing Chrome to unlock VIRA MAX profile…');
try {
  execSync('taskkill /IM chrome.exe /F', { stdio: 'ignore' });
} catch (_) {}
await sleep(2500);

console.log('Launching VIRA MAX (Profile 5) with debugging…');
spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${USER_DATA}`,
    '--profile-directory=Profile 5',
    '--no-first-run',
    '--no-default-browser-check',
    `chrome://extensions/?id=${TM_ID}`,
  ],
  { detached: true, stdio: 'ignore' }
).unref();

console.log(await waitCdp());
await sleep(5000);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
let page = context.pages().find((p) => /chrome:\/\/extensions/i.test(p.url())) || context.pages()[0];

await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);

await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const toolbar = mgr?.shadowRoot?.querySelector('extensions-toolbar');
  const dev = toolbar?.shadowRoot?.querySelector('#devMode');
  if (dev && !dev.checked) dev.click();
});
await sleep(1000);
await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.screenshot({ path: path.join(ROOT, '_tmp_vira_tm_details.png'), fullPage: true });

const toggle = await page.evaluate(() => {
  const out = { clicked: false, already: false };
  const mgr = document.querySelector('extensions-manager');
  const detail = mgr?.shadowRoot?.querySelector('extensions-detail-view');
  if (!detail?.shadowRoot) {
    return { error: 'no detail', text: (mgr?.shadowRoot?.textContent || '').replace(/\s+/g, ' ').slice(0, 500) };
  }
  out.text = (detail.shadowRoot.textContent || '').replace(/\s+/g, ' ').slice(0, 800);

  const enable =
    detail.shadowRoot.querySelector('#enableToggle') ||
    detail.shadowRoot.querySelector('#enable-toggle');
  if (enable && !enable.checked) {
    enable.click();
    out.enabledExt = true;
  }

  const row = detail.shadowRoot.querySelector('#allow-user-scripts');
  if (row) {
    const cr = row.shadowRoot?.querySelector('cr-toggle') || row.querySelector('cr-toggle');
    if (cr) {
      out.checkedBefore = !!cr.checked;
      if (!cr.checked) {
        cr.click();
        out.clicked = true;
      } else {
        out.already = true;
      }
    }
  }
  return out;
});
console.log('TOGGLE', toggle);
await sleep(1500);
await page.screenshot({ path: path.join(ROOT, '_tmp_vira_tm_details2.png'), fullPage: true });

// TM editor: try existing script or new
const editor = await context.newPage();
let editorOk = false;
for (const url of [
  `chrome-extension://${TM_ID}/options.html#nav=new-user-script+editor`,
  `chrome-extension://${TM_ID}/options.html#nav=dashboard`,
]) {
  try {
    await editor.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    editorOk = true;
    console.log('opened', url);
    break;
  } catch (e) {
    console.log('editor nav fail', url, e.message);
  }
}
if (!editorOk) throw new Error('Cannot open Tampermonkey UI — extension off or blocked');
await sleep(3000);
await editor.screenshot({ path: path.join(ROOT, '_tmp_vira_tm_editor.png'), fullPage: true });

const ui = await editor.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 900)
);
console.log('TM UI', ui);

// If dashboard — click 5Kings Bot or «Create new script»
const openedExisting = await editor.evaluate(() => {
  const els = [...document.querySelectorAll('a, span, div, td')];
  const hit = els.find((el) => /5Kings Bot/i.test(el.textContent || '') && (el.textContent || '').length < 40);
  if (hit) {
    hit.click();
    return 'existing';
  }
  const add = els.find((el) =>
    /create a new script|создать.*скрипт|new script|\+/i.test((el.textContent || '').trim()) &&
    (el.textContent || '').length < 40
  );
  if (add) {
    add.click();
    return 'new';
  }
  return null;
});
console.log('open script', openedExisting);
await sleep(2500);

const pasted = await editor.evaluate((src) => {
  const cmEl = document.querySelector('.CodeMirror');
  if (cmEl && cmEl.CodeMirror) {
    cmEl.CodeMirror.setValue(src);
    cmEl.CodeMirror.save?.();
    return { ok: true, via: 'CodeMirror', len: src.length };
  }
  const ta = document.querySelector('textarea');
  if (ta) {
    const proto = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    proto.set.call(ta, src);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, via: 'textarea', len: src.length };
  }
  return { ok: false, text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300) };
}, USER_JS);
console.log('PASTE', pasted);

await editor.keyboard.press('Control+s');
await sleep(800);
const saveClick = await editor.evaluate(() => {
  const els = [...document.querySelectorAll('input, button, a, [title], [aria-label]')];
  const b = els.find((el) =>
    /save|сохран/i.test(`${el.textContent || ''} ${el.title || ''} ${el.getAttribute('aria-label') || ''}`) &&
    `${el.textContent || ''}`.length < 30
  );
  if (b) {
    b.click();
    return (b.textContent || b.title || 'save').trim();
  }
  return null;
});
console.log('SAVE', saveClick);
await sleep(2000);

await editor.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
  waitUntil: 'domcontentloaded',
});
await sleep(2500);
const dash = await editor.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 1000)
);
console.log('DASH', dash);
await editor.screenshot({ path: path.join(ROOT, '_tmp_vira_tm_dash.png'), fullPage: true });

// Fresh game tab — NO inject
const game = await context.newPage();
const cons = [];
game.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|Tamper|ReferenceError|SyntaxError/i.test(t)) cons.push(t.slice(0, 220));
});
await game.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
if (await game.$('#loginform input[name="login"]') && process.env.LOGIN) {
  await game.fill('#loginform input[name="login"]', process.env.LOGIN);
  await game.fill('#loginform input[name="pwd"]', process.env.PASSWORD);
  await game.click('#input_button');
  await sleep(4000);
}
const can = await game.evaluate(() => {
  const btn = document.querySelector('#input_button');
  return !!(btn && /game\.html/i.test(btn.getAttribute('onclick') || ''));
});
if (can) {
  await Promise.all([
    game.waitForURL(/game\.html/i, { timeout: 60000 }).catch(() => null),
    game.click('#input_button'),
  ]);
} else {
  await game.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
}
await sleep(8000);
const g = await game.evaluate(() => ({
  url: location.href,
  beacon: !!document.getElementById('k5-beacon'),
  beaconText: document.getElementById('k5-beacon')?.textContent || null,
  panel: !!document.getElementById('k5-panel'),
  dact: !!document.getElementById('d_act'),
}));
console.log('GAME', g);
console.log('CONS', cons);
await game.bringToFront();
await game.screenshot({ path: path.join(ROOT, '_tmp_vira_tm_game.png') });

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      allowUserScripts: toggle.already || toggle.clicked,
      pasted: pasted.ok,
      installed: /5Kings Bot/i.test(dash),
      tmWarning: /пользовательск|user scripts|Developer mode/i.test(dash),
      beacon: g.beacon,
      panel: g.panel,
    },
    null,
    2
  )
);

process.exit(0);
