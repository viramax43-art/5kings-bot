/**
 * Clean Chrome + official TM unpacked + paste userscript in TM editor + verify.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TM_DIR = path.join(ROOT, 'tampermonkey', '_tm55');
const USER_JS = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');
const DEST = path.join(ROOT, '.chrome-tm-clean');
const PORT = 9333;
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitCdp() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('CDP timeout ' + PORT);
}

fs.mkdirSync(DEST, { recursive: true });

spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${DEST}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--load-extension=${TM_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    'chrome://extensions',
  ],
  { detached: true, stdio: 'ignore' }
).unref();

console.log(await waitCdp());
await sleep(4000);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
const page = context.pages()[0] || (await context.newPage());

await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
await sleep(2000);
await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const toolbar = mgr?.shadowRoot?.querySelector('extensions-toolbar');
  const dev = toolbar?.shadowRoot?.querySelector('#devMode');
  if (dev && !dev.checked) dev.click();
});
await sleep(800);

await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);
await page.screenshot({ path: path.join(ROOT, '_tmp_clean_tm.png'), fullPage: true });

const toggle = await page.evaluate(() => {
  const out = { clicked: false };
  const mgr = document.querySelector('extensions-manager');
  const detail = mgr?.shadowRoot?.querySelector('extensions-detail-view');
  if (!detail?.shadowRoot) return { error: 'no detail', text: mgr?.shadowRoot?.textContent?.slice(0, 400) };
  out.text = (detail.shadowRoot.textContent || '').replace(/\s+/g, ' ').slice(0, 700);
  const row = detail.shadowRoot.querySelector('#allow-user-scripts');
  if (row) {
    const cr = row.shadowRoot?.querySelector('cr-toggle') || row.querySelector('cr-toggle');
    if (cr) {
      out.checkedBefore = !!cr.checked;
      if (!cr.checked) {
        cr.click();
        out.clicked = true;
      }
    } else row.click();
  }
  const enable =
    detail.shadowRoot.querySelector('#enableToggle') ||
    detail.shadowRoot.querySelector('#enable-toggle');
  if (enable && !enable.checked) {
    enable.click();
    out.enabled = true;
  }
  return out;
});
console.log('TOGGLE', toggle);
await sleep(1500);

// Open TM new script editor
const editor = await context.newPage();
await editor.goto(`chrome-extension://${TM_ID}/options.html#nav=new-user-script+editor`, {
  waitUntil: 'domcontentloaded',
  timeout: 20000,
});
await sleep(3500);
await editor.screenshot({ path: path.join(ROOT, '_tmp_tm_editor.png'), fullPage: true });
const edUi = await editor.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 500)
);
console.log('EDITOR UI', edUi);

const pasted = await editor.evaluate((src) => {
  const cmEl = document.querySelector('.CodeMirror');
  if (cmEl && cmEl.CodeMirror) {
    cmEl.CodeMirror.setValue(src);
    return { ok: true, via: 'CodeMirror', len: src.length };
  }
  const ta = document.querySelector('textarea');
  if (ta) {
    ta.value = src;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, via: 'textarea', len: src.length };
  }
  return {
    ok: false,
    html: (document.body && document.body.innerHTML || '').slice(0, 400),
  };
}, USER_JS);
console.log('PASTE', pasted);
await sleep(500);

const saved = await editor.evaluate(() => {
  const els = [...document.querySelectorAll('input, button, a, [role="button"], div')];
  const b = els.find((el) => {
    const t = `${el.textContent || ''} ${el.title || ''} ${el.getAttribute('aria-label') || ''}`;
    return /save|сохран/i.test(t) && t.length < 40;
  });
  if (b) {
    b.click();
    return (b.textContent || b.title || 'clicked').trim().slice(0, 40);
  }
  // Ctrl+S
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  return 'ctrl+s';
});
console.log('SAVE', saved);
await editor.keyboard.press('Control+s');
await sleep(2000);
await editor.screenshot({ path: path.join(ROOT, '_tmp_tm_editor_saved.png'), fullPage: true });

// Dashboard
await editor.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
  waitUntil: 'domcontentloaded',
});
await sleep(2500);
const dash = await editor.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 800)
);
console.log('DASH', dash);
await editor.screenshot({ path: path.join(ROOT, '_tmp_tm_clean_dash.png'), fullPage: true });

// Fresh 5kings tab — no inject
const game = await context.newPage();
const cons = [];
game.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|Tamper|ReferenceError|SyntaxError/i.test(t)) cons.push(t.slice(0, 220));
});
await game.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(3000);
const needLogin = await game.$('#loginform input[name="login"]');
if (needLogin && process.env.LOGIN) {
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
await sleep(7000);
const g = await game.evaluate(() => ({
  url: location.href,
  beacon: !!document.getElementById('k5-beacon'),
  beaconText: document.getElementById('k5-beacon')?.textContent || null,
  panel: !!document.getElementById('k5-panel'),
  dact: !!document.getElementById('d_act'),
}));
console.log('GAME', g);
console.log('CONS', cons);
await game.screenshot({ path: path.join(ROOT, '_tmp_tm_editor_game.png') });

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      pasted: pasted.ok,
      installed: /5Kings Bot/i.test(dash),
      warning: /пользовательск|user scripts/i.test(dash),
      beacon: g.beacon,
      panel: g.panel,
    },
    null,
    2
  )
);

process.exit(0);
