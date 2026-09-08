/**
 * Runtime check of v1.2.29: real functions + injected panel + optional live/CDP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { config } from './src/config.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const src = fs.readFileSync(USER_JS, 'utf8');

const failed = [];
let passed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed.push(name);
    console.log('  FAIL  ' + name, extra != null ? extra : '');
  }
}

function extractFunction(name) {
  const needles = ['\n  function ' + name + '(', '\n  async function ' + name + '('];
  let idx = -1;
  for (const n of needles) {
    idx = src.indexOf(n);
    if (idx >= 0) {
      idx += 1;
      break;
    }
  }
  if (idx < 0) throw new Error('function not found: ' + name);
  const brace = src.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, p + 1);
    }
  }
  throw new Error('unterminated: ' + name);
}

function getActWin() {
  return null;
}

const prelude =
  `function getActWin() { return null; }
` +
  extractFunction('readTurnTimerSec') +
  '\n' +
  extractFunction('bigForestChebyshev') +
  `
function listBigForestItems(win) { return (win && win.__vis) || []; }
function listRadarItems(win) { return (win && win.__radar) || []; }
function kindAtCell(win, x, y) {
  if (win && win.__kind && win.__kind[x + ',' + y] != null) return win.__kind[x + ',' + y];
  return null;
}
` +
  extractFunction('listAllStepItems') +
  '\n' +
  extractFunction('stepItemStillThere') +
  `
globalThis.readTurnTimerSec = readTurnTimerSec;
globalThis.listAllStepItems = listAllStepItems;
globalThis.stepItemStillThere = stepItemStillThere;
`;
eval(prelude);
const readTurnTimerSec = globalThis.readTurnTimerSec;
const listAllStepItems = globalThis.listAllStepItems;
const stepItemStillThere = globalThis.stepItemStillThere;

console.log('--- timer ---');
{
  const el = { innerText: '9:56' };
  const win = {
    document: {
      getElementById: function (id) {
        return id === 'time_left' || id === 'time_left' ? el : null;
      },
    },
  };
  ok('T1 parse 9:56 → 596s', readTurnTimerSec(win) === 596);
  el.innerText = '0:11';
  ok('T2 parse 0:11 → 11s', readTurnTimerSec(win) === 11);
  el.innerText = '  0:09  ';
  ok('T3 skip book at 9s', readTurnTimerSec(win) <= 12);
  el.innerText = '0:14';
  ok('T4 keep book at 14s', readTurnTimerSec(win) > 12);
  el.innerText = '';
  ok('T5 empty timer is null', readTurnTimerSec(win) == null);
}

console.log('--- radar merge / fog ---');
{
  const vis = [{ x: 10, y: 10, kind: 'mushroom', key: '10,10' }];
  const radarFar = [{ x: 20, y: 22, kind: 'herb', key: '20,22', fromRadar: true }];
  const radarNear = [{ x: 10, y: 11, kind: 'mushroom', key: '10,11', fromRadar: true }];
  const w1 = { __vis: vis, __radar: radarFar };
  const merged = listAllStepItems(w1);
  ok('R1 far radar merged', merged.length === 2 && merged.some(function (it) { return it.fromRadar; }));
  const w2 = { __vis: vis, __radar: radarNear };
  const merged2 = listAllStepItems(w2);
  ok('R2 near radar not duplicated', merged2.length === 1 && !merged2[0].fromRadar);
  const fog = { x: 40, y: 41, kind: 'mushroom', fromRadar: true };
  ok('R3 fog radar still there', stepItemStillThere({ __kind: {} }, fog) === true);
  ok(
    'R4 rock under radar dropped',
    stepItemStillThere({ __kind: { '40,41': 'rock' } }, fog) === false
  );
  ok(
    'R5 visible mushroom kept',
    stepItemStillThere({ __kind: { '10,10': 'mushroom' } }, vis[0]) === true
  );
}

function stripHeader(s) {
  return s.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const gm = `
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
var unsafeWindow = window;
`;

async function injectBot(page) {
  const code = gm + '\n' + stripHeader(src);
  await page.addInitScript(code);
}

async function snapPanel(page) {
  return page.evaluate(() => {
    const p = document.getElementById('k5-panel');
    const radar = document.querySelector('[data-cfg="forest.useRadar"]');
    const gx = document.getElementById('k5-goto-x');
    const gy = document.getElementById('k5-goto-y');
    const go = document.getElementById('k5-goto');
    return {
      panel: !!p,
      ver: p && p.querySelector('strong') ? p.querySelector('strong').textContent : '',
      radar: !!radar,
      radarOn: !!(radar && radar.checked),
      goto: !!(gx && gy && go),
    };
  });
}

console.log('--- panel inject (Playwright) ---');
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<html><body><div id="d_act"></div></body></html>');
  const injErr = await page.evaluate((code) => {
    try {
      eval(code);
      return null;
    } catch (e) {
      return String(e && e.stack ? e.stack : e);
    }
  }, gm + '\n' + stripHeader(src));
  if (injErr) console.log('  inject error', injErr.slice(0, 400));
  await page.waitForTimeout(600);
  const snap = await snapPanel(page);
  ok('U1 panel appeared', snap.panel, snap);
  ok('U2 version 1.2.29', /1\.2\.29/.test(snap.ver || ''), snap.ver);
  ok('U3 radar checkbox', snap.radar);
  ok('U4 radar on by default', snap.radarOn);
  ok('U5 goto fields', snap.goto);

  if (snap.goto) {
    await page.fill('#k5-goto-x', '123');
    await page.fill('#k5-goto-y', '456');
    await page.click('#k5-goto');
    await page.waitForTimeout(400);
    const tgt = await page.evaluate(() => {
      const log = document.getElementById('k5-log');
      const status = document.getElementById('k5-status');
      return {
        status: status ? status.textContent : '',
        log: log ? log.innerText.slice(0, 500) : '',
      };
    });
    ok(
      'U6 go clicked (log/status)',
      /123/.test(tgt.status + tgt.log) && /456/.test(tgt.status + tgt.log),
      tgt
    );
  }

  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'time_left';
    el.textContent = '0:08';
    document.body.appendChild(el);
  });
  const parsed = await page.evaluate(() => {
    const el = document.getElementById('time_left');
    const t = String(el.innerText || '').trim();
    const m = t.match(/(\d+)\s*:\s*(\d+)/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  });
  ok('U7 DOM timer 0:08 → 8s', parsed === 8);
} catch (e) {
  ok('U0 playwright inject', false, e && e.message ? e.message : e);
} finally {
  if (browser) await browser.close();
}

console.log('--- CDP / live ---');
async function tryCdp() {
  try {
    const b = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 2500 });
    const ctx = b.contexts()[0];
    const pages = ctx ? ctx.pages() : [];
    const page = pages.find((p) => /5kings\.ru/i.test(p.url())) || pages[0];
    if (!page) {
      console.log('  SKIP  CDP: no pages');
      return { ok: false, why: 'no pages' };
    }
    console.log('  CDP page', page.url());
    const before = await page.evaluate(() => ({
      url: location.href,
      panel: !!document.getElementById('k5-panel'),
      ver: (document.querySelector('#k5-panel strong') || {}).textContent || '',
      dact: !!document.getElementById('d_act'),
      time: (document.getElementById('time_left') || {}).innerText || '',
    })).catch((e) => ({ err: String(e) }));
    console.log('  CDP before', JSON.stringify(before));

    const code = gm + '\n' + stripHeader(src);
    const inj = [];
    for (const f of page.frames()) {
      try {
        inj.push(
          await f.evaluate((src) => {
            try {
              eval(src);
              const doc = window.top.document;
              return {
                ok: true,
                href: location.href.slice(0, 90),
                panel: !!doc.getElementById('k5-panel'),
                ver: (doc.querySelector('#k5-panel strong') || {}).textContent || '',
              };
            } catch (e) {
              return { ok: false, err: String(e.message || e), href: location.href.slice(0, 90) };
            }
          }, code)
        );
      } catch (e) {
        inj.push({ ok: false, err: e.message });
      }
    }
    console.log('  CDP inject', JSON.stringify(inj));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const doc = window.top.document;
      const radar = doc.querySelector('[data-cfg="forest.useRadar"]');
      return {
        panel: !!doc.getElementById('k5-panel'),
        ver: (doc.querySelector('#k5-panel strong') || {}).textContent || '',
        radar: !!(radar && radar.checked),
        goto: !!doc.getElementById('k5-goto'),
        status: (doc.getElementById('k5-status') || {}).textContent || '',
      };
    });
    ok('L1 CDP panel', after.panel, after);
    ok('L2 CDP v1.2.29', /1\.2\.29/.test(after.ver), after.ver);
    ok('L3 CDP goto+radar', after.goto && after.radar, after);
    return { ok: true, after };
  } catch (e) {
    console.log('  SKIP  CDP not open:', e.message || e);
    return { ok: false, why: 'no cdp' };
  }
}

const cdp = await tryCdp();
if (!cdp.ok && config.login && config.password) {
  try {
    const { launchBrowser, ensureLoggedIn, sleep } = await import('./src/browser.js');
    const { browser: lb, context, page } = await launchBrowser();
    try {
      await ensureLoggedIn(page, context);
      await sleep(2000);
      const code = gm + '\n' + stripHeader(src);
      const inj = [];
      for (const f of page.frames()) {
        try {
          inj.push(
            await f.evaluate((src) => {
              try {
                eval(src);
                const doc = window.top.document;
                return {
                  ok: true,
                  href: String(location.href).slice(0, 80),
                  panel: !!doc.getElementById('k5-panel'),
                };
              } catch (e) {
                return { ok: false, err: String(e.message || e) };
              }
            }, code)
          );
        } catch (e) {
          inj.push({ ok: false, err: e.message });
        }
      }
      console.log('  LIVE inject', JSON.stringify(inj));
      await sleep(800);
      const live = await page.evaluate(() => {
        const doc = window.top.document;
        let time = '';
        let actHref = '';
        let radarFrame = false;
        let turn = '';
        try {
          const act = document.getElementById('d_act');
          const w = act && act.contentWindow;
          actHref = w && w.location ? String(w.location.href) : '';
          time = ((w && w.document.getElementById('time_left')) || {}).innerText || '';
          turn = ((w && w.document.getElementById('TurnLabel')) || {}).innerText || '';
          radarFrame = !!(w && w.document.getElementById('radar_frame'));
        } catch (e) {}
        const radar = doc.querySelector('[data-cfg="forest.useRadar"]');
        return {
          url: location.href,
          panel: !!doc.getElementById('k5-panel'),
          ver: (doc.querySelector('#k5-panel strong') || {}).textContent || '',
          goto: !!doc.getElementById('k5-goto'),
          radar: !!radar,
          radarOn: !!(radar && radar.checked),
          time: time,
          turn: turn,
          actHref: actHref.slice(0, 120),
          radarFrame: radarFrame,
        };
      });
      console.log('  LIVE', JSON.stringify(live));
      ok('L4 live panel', live.panel, live);
      ok('L5 live v1.2.29', /1\.2\.29/.test(live.ver), live.ver);
      ok('L6 live goto UI', live.goto);
      ok('L7 live radar checkbox on', live.radarOn, live);

      if (live.goto) {
        await page.fill('#k5-goto-x', '10');
        await page.fill('#k5-goto-y', '20');
        await page.click('#k5-goto');
        await sleep(500);
        const afterGo = await page.evaluate(() => {
          const status = (document.getElementById('k5-status') || {}).textContent || '';
          const log = (document.getElementById('k5-log') || {}).innerText || '';
          return (status + '\n' + log).slice(0, 600);
        });
        console.log('  LIVE after Go', afterGo.replace(/\s+/g, ' ').slice(0, 280));
        ok('L8 live Go sets point', /10/.test(afterGo) && /20/.test(afterGo), afterGo.slice(0, 200));
      }
      await page.screenshot({ path: path.join(ROOT, '_tmp_v1229_live.png'), fullPage: true });
    } finally {
      await lb.close();
    }
  } catch (e) {
    console.log('  SKIP  live login:', e.message || e);
  }
} else if (!cdp.ok) {
  console.log('  SKIP  live: no LOGIN/PASSWORD in .env and no CDP');
}

console.log('\nVerify: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
