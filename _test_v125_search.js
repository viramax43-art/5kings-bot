/**
 * Verify forest search every 5 steps after v1.2.5 priority fix.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v125_search.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('K5BOT_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('K5BOT_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function go(page, url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2000);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      href: (w?.location?.href || '').split('/').pop(),
      ready: !!(w?.Client && g),
      my: g ? { x: Number(g.posx), y: Number(g.posy), stay: Number(g.stay) } : null,
    };
  });
}

async function ensureForest(page) {
  await go(page, 'gates.html');
  for (let i = 0; i < 15; i++) {
    const s = await snap(page);
    if (s.ready) return s;
    await sleep(1500);
  }
  // rebuild group via POST if needed
  const created = await page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (w?.Client && w?.global_data?.my_group) return { already: true };
    const fd = new FormData();
    fd.append('actNewMaps-CreateGroup', '1');
    fd.append('ulimit', '1');
    fd.append('minlvl', '3');
    fd.append('maxlvl', '50');
    await fetch('gates_mode_1.html', { method: 'POST', body: fd, credentials: 'include' });
    const f = w.document.createElement('form');
    f.method = 'POST';
    f.action = 'gates_mode_1.html';
    for (const [n, v] of [
      ['actNewMaps-CreateGroup', '1'],
      ['ulimit', '1'],
      ['minlvl', '3'],
      ['maxlvl', '50'],
    ]) {
      const i = w.document.createElement('input');
      i.type = 'hidden';
      i.name = n;
      i.value = v;
      f.appendChild(i);
    }
    w.document.body.appendChild(f);
    f.submit();
    return { submitted: true };
  });
  log('create', created);
  await sleep(4000);
  for (let i = 0; i < 25; i++) {
    const s = await snap(page);
    if (s.ready) return s;
    await sleep(1500);
  }
  return snap(page);
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 80) : [];
  });
}

const report = { at: new Date().toISOString() };
const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  report.enter = await ensureForest(page);
  log('enter', report.enter);
  if (!report.enter?.ready) throw new Error('no forest');

  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        forest: {
          collectTrees: true,
          collectHerbs: false,
          collectMushrooms: false,
          collectCopper: false,
          collectIron: false,
          collectGold: false,
          autoSearch: true,
          searchEverySteps: 5,
          searchRadius: 5,
          equipTool: false,
          delayMin: 350,
          delayMax: 550,
        },
        chaos: { ensureKit: false, autoJoin: false, autoCreate: false, fight: false },
        license: { enabled: false },
      })
    );
    localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
    localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
  });
  await page.mainFrame().evaluate((src) => {
    try {
      eval(src);
    } catch (e) {}
  }, code);
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      await f.evaluate((src) => {
        try {
          eval(src);
        } catch (e) {}
      }, code);
    } catch (e) {}
  }
  await sleep(800);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());

  await sleep(55000);
  const lines = await botLines(page);
  const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
  const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
  const counters = steps.map((l) => {
    const m = /шаг \((\d+)\/(\d+)\)/.exec(l);
    return m ? Number(m[1]) : null;
  }).filter((n) => n != null);
  const maxCounter = counters.length ? Math.max(...counters) : 0;
  report.forest = {
    steps: steps.length,
    searches: searches.length,
    dobycha: dobycha.length,
    maxStepCounter: maxCounter,
    stepSamples: steps.slice(0, 15),
    searchSamples: searches.slice(0, 8),
    dobychaSamples: dobycha.slice(0, 5),
    // after fix: counter should reset; expect searches >= 1 if steps >= 5
    searchOk: steps.length >= 5 ? searches.length >= 1 : true,
    counterResetOk: maxCounter <= 6, // allow 5 or brief 6
    noBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
    lines: lines.slice(0, 25),
  };
  log('RESULT', report.forest);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    entered: !!report.enter?.ready,
    searchEvery5: report.forest?.searchOk ?? false,
    counterResets: report.forest?.counterResetOk ?? false,
    noBlindDobycha: report.forest?.noBlind ?? null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
