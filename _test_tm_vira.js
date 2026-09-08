/**
 * Test Tampermonkey inside a clone of VIRA MAX Chrome profile (Profile 5).
 * Requires closing Chrome briefly to unlock profile files.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SRC_PROFILE = path.join(
  process.env.LOCALAPPDATA,
  'Google/Chrome/User Data/Profile 5'
);
const DEST = path.join(ROOT, '.chrome-vira');
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const PORT = 9222;
const STATIC = 8765;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ps(cmd) {
  execSync(`powershell -NoProfile -Command "${cmd.replace(/"/g, '\\"')}"`, {
    stdio: 'inherit',
  });
}

function killViraClone() {
  console.log('Closing previous .chrome-vira if any…');
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -match 'chrome-vira' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }"`,
      { stdio: 'ignore' }
    );
  } catch (_) {}
}

function cloneProfile({ force = false } = {}) {
  const tmPath = path.join(DEST, 'Default', 'Extensions', TM_ID);
  if (!force && fs.existsSync(tmPath) && fs.existsSync(path.join(DEST, 'Default', 'Preferences'))) {
    console.log('Using existing .chrome-vira clone');
    return;
  }
  console.log('Cloning Profile 5 → .chrome-vira …');
  if (fs.existsSync(DEST)) {
    try {
      execSync(
        `powershell -NoProfile -Command "Remove-Item -LiteralPath '${DEST}' -Recurse -Force"`,
        { stdio: 'ignore' }
      );
    } catch (_) {}
  }
  fs.mkdirSync(path.join(DEST, 'Default'), { recursive: true });

  // Exclude heavy/cache dirs
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
  ]
    .map((d) => `/XD "${d}"`)
    .join(' ');

  try {
    execSync(
      `robocopy "${SRC_PROFILE}" "${path.join(DEST, 'Default')}" /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS ${xd}`,
      { stdio: 'inherit' }
    );
  } catch (e) {
    // robocopy: exit codes 0–7 mean success
    if ((e.status ?? 1) > 7) throw e;
  }

  const localState = {
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
  };
  fs.writeFileSync(path.join(DEST, 'Local State'), JSON.stringify(localState));
  console.log('Clone done. TM ext exists:', fs.existsSync(path.join(DEST, 'Default', 'Extensions', TM_ID)));
}

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('CDP timeout');
}

function startServer() {
  const body = fs.readFileSync(USER_JS);
  const server = http.createServer((req, res) => {
    if ((req.url || '').startsWith('/5kings-bot.user.js')) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end(body);
    }
    res.end(
      '<a id="inst" href="/5kings-bot.user.js">Install 5Kings Bot v1.0.4</a>'
    );
  });
  return new Promise((r) => server.listen(STATIC, '127.0.0.1', () => r(server)));
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
    const dAct = document.getElementById('d_act');
    let actHref = null,
      cu = false,
      bots = 0,
      meName = null,
      uid = null;
    try {
      if (dAct && dAct.contentWindow) {
        const w = dAct.contentWindow;
        actHref = String(w.location.href || '');
        cu = !!w.cu;
        uid = w.cu && w.cu.UserID;
        if (cu && w.cu.bots) {
          bots = Object.keys(w.cu.bots).length;
          const me = w.cu.bots[uid];
          if (me) meName = me.n || me.name || me.N || null;
        }
      }
    } catch (e) {
      actHref = 'ERR ' + e.message;
    }
    return {
      url: location.href,
      hasBeacon: !!beacon,
      beaconText: beacon ? beacon.textContent : null,
      hasPanel: !!panel,
      panelHead: panel ? panel.innerText.replace(/\s+/g, ' ').slice(0, 240) : null,
      hasDact: !!dAct,
      iframes: document.querySelectorAll('iframe').length,
      actHref,
      cu,
      bots,
      meName,
      uid,
      snip: ((topDoc.body && topDoc.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 280),
    };
  });
}

killViraClone();
await sleep(1500);
cloneProfile({ force: false });

const server = await startServer();

console.log('Launching VIRA MAX clone with debugging…');
spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${DEST}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--profile-directory=Default',
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
  if (/5k|k5-|Tamper|ReferenceError|SyntaxError/i.test(t)) console.log('CON:', t.slice(0, 240));
});

// Check TM present
const dash = await context.newPage();
try {
  await dash.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await sleep(2500);
  const text = await dash.evaluate(() =>
    ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 1200)
  );
  console.log('TM DASHBOARD:', text);
  await dash.screenshot({ path: path.join(ROOT, '_tmp_tm_dashboard.png'), fullPage: true });
} catch (e) {
  console.log('TM dashboard failed:', e.message);
  await dash.goto('chrome://extensions');
  await sleep(2000);
  await dash.screenshot({ path: path.join(ROOT, '_tmp_extensions.png'), fullPage: true });
}

// Install/update bot
console.log('Installing userscript…');
try {
  await dash.goto(`http://127.0.0.1:${STATIC}/`, { waitUntil: 'domcontentloaded' });
  await sleep(500);
  const [maybePopup] = await Promise.all([
    context.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    dash.click('#inst'),
  ]);
  await sleep(3000);
  const inst = maybePopup || dash;
  console.log('install url', inst.url());
  const ui = await inst.evaluate(() => ({
    title: document.title,
    text: ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 1000),
  }));
  console.log('install UI', ui);
  await inst.screenshot({ path: path.join(ROOT, '_tmp_tm_install.png'), fullPage: true });
  await inst.evaluate(() => {
    const els = [...document.querySelectorAll('input, button, a')];
    const b = els.find((el) =>
      /install|update|reinstall|установ|обнов/i.test(`${el.textContent || ''} ${el.value || ''}`)
    );
    if (b) b.click();
  });
  await sleep(2000);
} catch (e) {
  console.log('install err', e.message);
}

// Focus game
page = context.pages().find((p) => /5kings\.ru\/game/i.test(p.url())) || page;
await page.bringToFront();
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await sleep(6000);

let g = await probe(page);
console.log('PROBE1', JSON.stringify(g, null, 2));
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_vira_game.png') });

if (!g.hasDact) {
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
  await sleep(7000);
  g = await probe(page);
  console.log('PROBE2', JSON.stringify(g, null, 2));
}

await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
g = await probe(page);
console.log('FINAL', JSON.stringify(g, null, 2));
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_vira_final.png') });

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      beacon: g.hasBeacon,
      beaconText: g.beaconText,
      panel: g.hasPanel,
      dact: g.hasDact,
      cu: g.cu,
      me: g.meName,
      uid: g.uid,
      forest: g.actHref,
    },
    null,
    2
  )
);

server.close();
process.exit(0);
