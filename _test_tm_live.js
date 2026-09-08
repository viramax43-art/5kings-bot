/**
 * Live test of 5kings-bot.user.js against saved browser session.
 * Emulates Tampermonkey GM_* APIs and injects the userscript into the page.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const STATE = path.join(ROOT, '.auth', 'storage-state.json');

function stripUserscriptHeader(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const gmBootstrap = `
window.__GM_STORE = window.__GM_STORE || {};
function GM_getValue(k, def) {
  try {
    const v = localStorage.getItem('TM_GM_' + k);
    if (v == null) return def;
    return JSON.parse(v);
  } catch (e) { return def; }
}
function GM_setValue(k, v) {
  try { localStorage.setItem('TM_GM_' + k, JSON.stringify(v)); } catch (e) {}
}
function GM_addStyle(css) {
  const s = document.createElement('style');
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
}
const unsafeWindow = window;
`;

async function findGamePage(context) {
  for (const p of context.pages()) {
    const u = p.url();
    if (/5kings\.ru/i.test(u) && !/about:blank/.test(u)) return p;
  }
  return null;
}

async function ensureGame(page) {
  await page.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);
  // login if needed
  const needLogin = await page.evaluate(() => {
    const t = document.body ? document.body.innerText : '';
    return /вход|логин|password|пароль/i.test(t) && !document.getElementById('d_act');
  });
  if (needLogin && process.env.LOGIN && process.env.PASSWORD) {
    console.log('Login form detected — logging in…');
    const loginSel = 'input[name="login"], input[name="Login"], input#login, input[type="text"]';
    const passSel = 'input[name="password"], input[name="Password"], input#password, input[type="password"]';
    if (await page.$(passSel)) {
      await page.fill(loginSel, process.env.LOGIN).catch(() => {});
      await page.fill(passSel, process.env.PASSWORD);
      await page.click('input[type="submit"], button[type="submit"]').catch(() =>
        page.keyboard.press('Enter')
      );
      await page.waitForTimeout(4000);
    }
  }
  // open main game shell if link exists
  const href = page.url();
  if (!/d_act|m\.html|game\.html|main/i.test(href)) {
    const opened = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((x) =>
        /войти в игру|в игру|играть|game|m\.html/i.test(x.textContent + ' ' + x.href)
      );
      if (a) {
        a.click();
        return a.href;
      }
      return null;
    });
    if (opened) {
      console.log('Clicked enter game:', opened);
      await page.waitForTimeout(3000);
    } else {
      // try common URLs
      for (const u of ['https://5kings.ru/m.html', 'https://5kings.ru/game.html', 'https://5kings.ru/main.html']) {
        const r = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        if (r && r.ok()) {
          console.log('Opened', u);
          break;
        }
      }
    }
  }
  await page.waitForTimeout(2000);
}

async function injectBot(page) {
  const raw = fs.readFileSync(USER_JS, 'utf8');
  const body = stripUserscriptHeader(raw);
  // Inject into main frame + all child frames
  const code = gmBootstrap + '\n' + body;

  await page.addInitScript(code);
  // Also run now in existing documents
  const frames = page.frames();
  const results = [];
  for (const f of frames) {
    try {
      const r = await f.evaluate((src) => {
        try {
          // eslint-disable-next-line no-eval
          eval(src);
          return {
            ok: true,
            href: location.href,
            name: window.name || '',
            hasPanel: !!document.getElementById('k5-panel'),
            topPanel: !!(window.top && window.top.document.getElementById('k5-panel')),
          };
        } catch (e) {
          return { ok: false, err: String(e && e.message ? e.message : e), href: location.href };
        }
      }, code);
      results.push(r);
    } catch (e) {
      results.push({ ok: false, err: String(e.message || e), href: f.url() });
    }
  }
  return results;
}

async function diag(page) {
  return page.evaluate(() => {
    function scan(win, label) {
      const row = { label, href: '', name: '', cu: false, gd: false, panel: false, err: null };
      try {
        row.href = win.location.href;
        row.name = win.name || '';
        row.cu = !!(win.cu && win.cu.send);
        row.gd = !!win.gd;
        row.panel = !!win.document.getElementById('k5-panel');
      } catch (e) {
        row.err = String(e.message || e);
      }
      return row;
    }
    const out = [scan(window, 'main')];
    try {
      out.push(scan(window.top, 'top'));
    } catch (e) {}
    try {
      if (window.frames.d_act) out.push(scan(window.frames.d_act, 'd_act'));
    } catch (e) {
      out.push({ label: 'd_act', err: String(e.message || e) });
    }
    for (let i = 0; i < window.frames.length; i++) {
      try {
        out.push(scan(window.frames[i], 'frame' + i));
      } catch (e) {}
    }
    const panel = (window.top || window).document.getElementById('k5-panel');
    const diagEl = (window.top || window).document.getElementById('k5-diag');
    const statusEl = (window.top || window).document.getElementById('k5-status');
    return {
      url: location.href,
      frames: out,
      panelInTop: !!panel,
      diag: diagEl ? diagEl.textContent : null,
      status: statusEl ? statusEl.textContent : null,
      panelHtml: panel ? panel.innerText.slice(0, 400) : null,
    };
  });
}

async function clickStartForest(page) {
  return page.evaluate(() => {
    const doc = (window.top || window).document;
    const btn = doc.getElementById('k5-forest-start');
    if (!btn) return { ok: false, why: 'no-button' };
    btn.click();
    return { ok: true };
  });
}

async function openForest(page) {
  return page.evaluate(() => {
    try {
      const act = window.frames.d_act || document.getElementById('d_act')?.contentWindow;
      if (!act) return { ok: false, why: 'no-d_act' };
      if (typeof act.goR === 'function') act.goR('forest.html');
      else if (typeof act.goRC === 'function') act.goRC('forest.html');
      else act.location.href = 'forest.html';
      return { ok: true };
    } catch (e) {
      return { ok: false, why: String(e.message || e) };
    }
  });
}

async function main() {
  if (!fs.existsSync(USER_JS)) throw new Error('missing userscript');
  console.log('Userscript bytes:', fs.statSync(USER_JS).size);
  console.log('Storage state:', fs.existsSync(STATE) ? 'yes' : 'no');

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    storageState: fs.existsSync(STATE) ? STATE : undefined,
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.text();
    if (/5k-bot|k5-|ReferenceError|TypeError|GM_/i.test(t)) console.log('PAGE:', t);
  });
  page.on('pageerror', (err) => console.log('PAGEERR:', err.message));

  await ensureGame(page);
  console.log('URL after ensure:', page.url());

  // wait for d_act
  for (let i = 0; i < 20; i++) {
    const has = await page.evaluate(() => !!(document.getElementById('d_act') || (window.frames && window.frames.d_act)));
    if (has) break;
    await page.waitForTimeout(500);
  }

  let inj = await injectBot(page);
  console.log('Inject results:', JSON.stringify(inj, null, 2));

  await openForest(page);
  await page.waitForTimeout(3500);
  // re-inject into forest frame after navigation
  inj = await injectBot(page);
  console.log('Re-inject after forest:', JSON.stringify(inj, null, 2));

  await page.waitForTimeout(1500);
  let d = await diag(page);
  console.log('DIAG1:', JSON.stringify(d, null, 2));

  // if no panel — dump why
  if (!d.panelInTop) {
    console.log('NO PANEL — trying inject only into top via addScriptTag style');
    const raw = fs.readFileSync(USER_JS, 'utf8');
    const body = stripUserscriptHeader(raw);
    await page.evaluate((src) => {
      const s = document.createElement('script');
      s.textContent = src;
      document.documentElement.appendChild(s);
    }, gmBootstrap + '\n' + body);
    await page.waitForTimeout(1000);
    d = await diag(page);
    console.log('DIAG2:', JSON.stringify(d, null, 2));
  }

  if (d.panelInTop) {
    const click = await clickStartForest(page);
    console.log('Click start:', click);
    await page.waitForTimeout(5000);
    d = await diag(page);
    console.log('DIAG after start:', JSON.stringify(d, null, 2));
  }

  await context.storageState({ path: STATE }).catch(() => {});
  console.log('Keeping browser open 60s for visual check…');
  await page.waitForTimeout(60000);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
