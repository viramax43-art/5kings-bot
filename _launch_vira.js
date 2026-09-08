/**
 * Launch Chrome on a clone of VIRA MAX (Profile 5) and inject 5Kings Bot.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC_PROFILE = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Profile 5');
const DEST = path.join(ROOT, '.chrome-vira');
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const EXT_DIR = path.join(ROOT, 'tampermonkey', 'chrome-ext');
const PORT = 9222;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killViraClone() {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'chrome-vira' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"`,
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

function cloneProfile() {
  fs.mkdirSync(path.join(DEST, 'Default'), { recursive: true });
  const xd = [
    'Cache',
    'Code Cache',
    'GPUCache',
    'GrShaderCache',
    'ShaderCache',
    'Service Worker\\CacheStorage',
    'OptimizationGuidePredictionModels',
    'DawnWebGPUCache',
    'DawnGraphiteCache',
    'Sessions',
    'Session Storage',
  ]
    .map((d) => `/XD "${d}"`)
    .join(' ');
  try {
    execSync(
      `robocopy "${SRC_PROFILE}" "${path.join(DEST, 'Default')}" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS /XO ${xd}`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    // 0–7 success; 8–15 = some locked files (Cookies still usually copied)
    if ((e.status ?? 1) >= 16) throw e;
    console.log('robocopy partial (locked files ok), code', e.status);
  }
  fs.writeFileSync(
    path.join(DEST, 'Local State'),
    JSON.stringify({
      profile: {
        info_cache: {
          Default: {
            active_time: Date.now() / 1000,
            is_using_default_name: false,
            name: 'VIRA MAX',
          },
        },
        last_used: 'Default',
        last_active_profiles: ['Default'],
      },
    })
  );
}

function stripHeader(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('CDP timeout');
}

async function injectBot(page) {
  const code = stripHeader(fs.readFileSync(USER_JS, 'utf8'));
  await page.addInitScript(code);
  const results = [];
  for (const f of page.frames()) {
    try {
      results.push(
        await f.evaluate((src) => {
          try {
            eval(src);
            const topDoc = (() => {
              try {
                return window.top.document;
              } catch (e) {
                return document;
              }
            })();
            return {
              ok: true,
              href: location.href,
              beacon: !!topDoc.getElementById('k5-beacon'),
              panel: !!topDoc.getElementById('k5-panel'),
            };
          } catch (e) {
            return { ok: false, err: String(e && e.message ? e.message : e), href: location.href };
          }
        }, code)
      );
    } catch (e) {
      results.push({ ok: false, err: String(e.message || e), href: f.url() });
    }
  }
  return results;
}

async function probe(page) {
  return page.evaluate(() => {
    const topDoc = (() => {
      try {
        return window.top.document;
      } catch (e) {
        return document;
      }
    })();
    const beacon = topDoc.getElementById('k5-beacon');
    const panel = topDoc.getElementById('k5-panel');
    let me = null,
      uid = null,
      actHref = null;
    try {
      const w = document.getElementById('d_act')?.contentWindow;
      if (w) {
        actHref = String(w.location.href || '');
        uid = w.cu && w.cu.UserID;
        const bot = w.cu && w.cu.bots && w.cu.bots[uid];
        if (bot) me = bot.n || bot.name || bot.N || null;
      }
    } catch (e) {
      actHref = 'ERR ' + e.message;
    }
    return {
      url: location.href,
      hasBeacon: !!beacon,
      beaconText: beacon ? beacon.textContent : null,
      hasPanel: !!panel,
      hasDact: !!document.getElementById('d_act'),
      actHref,
      uid,
      me,
    };
  });
}

console.log('Stopping previous VIRA clone…');
killViraClone();
await sleep(1200);

console.log('Syncing Profile 5 (VIRA MAX) → .chrome-vira …');
cloneProfile();
fs.copyFileSync(USER_JS, path.join(EXT_DIR, 'content.js'));

console.log('Launching Chrome (VIRA MAX clone)…');
spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${DEST}`,
    '--disable-features=DisableLoadExtensionCommandLineSwitch',
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--profile-directory=Default',
    '--disable-blink-features=AutomationControlled',
    'https://5kings.ru/game.html',
  ],
  { detached: true, stdio: 'ignore' }
).unref();

console.log(await waitCdp());
await sleep(4000);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
let page = context.pages().find((p) => /5kings/i.test(p.url())) || context.pages()[0];
page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|k5-|ReferenceError|SyntaxError/i.test(t)) console.log('CON:', t.slice(0, 240));
});

if (!/game\.html/i.test(page.url())) {
  await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
}
await sleep(4000);

let g = await probe(page);
console.log('BEFORE INJECT', g);

if (!g.hasBeacon || !g.hasPanel) {
  const inj = await injectBot(page);
  console.log('INJECT', JSON.stringify(inj, null, 2));
  await sleep(2000);
  g = await probe(page);
}

if (!g.hasDact) {
  await page.goto('https://5kings.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2000);
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
  await sleep(5000);
  await injectBot(page);
  g = await probe(page);
}

await page.bringToFront();
await page.screenshot({ path: path.join(ROOT, '_tmp_vira_live.png') });
console.log('FINAL', JSON.stringify(g, null, 2));
console.log('Chrome с сессией VIRA MAX оставлен открытым.');
process.exit(0);
