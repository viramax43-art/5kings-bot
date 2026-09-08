/**
 * Longer single-session forest observation (no re-inject mid-run).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124g_forest.json');

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
  await sleep(2500);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    const items = w?.abs_poses ? Object.keys(w.abs_poses).length : 0;
    return {
      href: (w?.location?.href || '').split('/').pop(),
      ready: !!(w?.Client && g),
      my: g ? { x: g.posx, y: g.posy, stay: g.stay, napr: g.napr } : null,
      we: w?.global_data?.wait_event,
      items,
      hasCu: !!(w?.cu && w?.gd),
    };
  });
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 60) : [];
  });
}

const report = { at: new Date().toISOString(), samples: [] };
const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  // prefer newforest2 / gates with client
  await go(page, 'gates.html');
  let s = await snap(page);
  if (!s.ready) {
    await go(page, 'newforest2.html');
    s = await snap(page);
  }
  report.enter = s;
  log('enter', s);
  if (!s.ready) throw new Error('not in big forest');

  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        forest: {
          collectTrees: true,
          collectOre: false,
          collectHerbs: false,
          collectMushrooms: false,
          autoSearch: true,
          searchEverySteps: 5,
          searchRadius: 5,
          equipTool: false,
          delayMin: 400,
          delayMax: 700,
        },
        chaos: { ensureKit: false, autoJoin: false, autoCreate: false, fight: false },
        license: { enabled: false },
      })
    );
    localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
    localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
  });
  // inject ONLY into top (panel) — act frame accessed via getActWin
  await page.evaluate((src) => {
    try {
      eval(src);
    } catch (e) {}
  }, code);
  await sleep(1000);

  // also inject into d_act once (needed if top-only misses some APIs — bot uses getActWin)
  const act = page.frames().find((f) => /d_act|newforest|gates/i.test(f.url()) || f.name() === 'd_act');
  if (act) {
    try {
      await act.evaluate((src) => {
        try {
          eval(src);
        } catch (e) {}
      }, code);
    } catch (e) {}
  }
  await sleep(500);

  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());

  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const sn = await snap(page);
    const lines = await botLines(page);
    const recent = lines.filter((l) => /Большой лес|Событие wait|Жду|бан|поиск|добыч|шаг/i.test(l)).slice(0, 8);
    report.samples.push({ i, sn, recent });
    if (i % 3 === 0) log('t', i, sn.my, sn.we, sn.ready, recent[0] || '');
  }

  const lines = await botLines(page);
  const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
  const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
  const waitCu = lines.filter((l) => /Жду cu\/gd/.test(l));
  const bans = lines.filter((l) => /бан клетки|бан /.test(l));
  report.forest = {
    steps: steps.length,
    searches: searches.length,
    dobycha: dobycha.length,
    waitCu: waitCu.length,
    bans: bans.length,
    stepSamples: steps.slice(0, 15),
    searchSamples: searches.slice(0, 8),
    dobychaSamples: dobycha.slice(0, 8),
    posTrail: report.samples.map((x) => x.sn.my).filter(Boolean),
    okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
    okSearchRare: searches.length <= Math.ceil(Math.max(steps.length, 1) / 4) + 2,
    moved: (() => {
      const pts = report.samples.map((x) => x.sn.my).filter(Boolean);
      if (pts.length < 2) return false;
      const a = pts[0];
      return pts.some((p) => p.x !== a.x || p.y !== a.y);
    })(),
    lines: lines.slice(0, 25),
  };
  log('FOREST', report.forest);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());

  // herbs mode: change cfg via panel storage + restart without full reinject
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
    cfg.forest = Object.assign({}, cfg.forest, {
      collectTrees: false,
      collectOre: false,
      collectHerbs: true,
      collectMushrooms: false,
    });
    localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
  });
  // reload cfg by clicking stop/start and forcing panel inputs if possible
  await page.evaluate(() => {
    const doc = window.top.document;
    const trees = doc.querySelector('[data-cfg="forest.collectTrees"]');
    const herbs = doc.querySelector('[data-cfg="forest.collectHerbs"]');
    if (trees && trees.checked) trees.click();
    if (herbs && !herbs.checked) herbs.click();
  });
  await sleep(500);
  // ensure still in forest
  s = await snap(page);
  if (!s.ready) {
    await go(page, 'newforest2.html');
    s = await snap(page);
  }
  report.herbsEnter = s;
  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
  await sleep(35000);
  const hlines = await botLines(page);
  const hSteps = hlines.filter((l) => /Большой лес: шаг/.test(l));
  const hSearch = hlines.filter((l) => /Большой лес: поиск/.test(l));
  const hDob = hlines.filter((l) => /Большой лес: добыча/.test(l));
  report.herbs = {
    steps: hSteps.length,
    searches: hSearch.length,
    dobycha: hDob.length,
    lines: hlines.slice(0, 20),
  };
  log('HERBS', report.herbs);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    forestEntered: !!report.enter?.ready,
    treesMovedOrStepped: !!(report.forest?.moved || (report.forest?.steps || 0) >= 3),
    treesNoBlindDobycha: report.forest?.okNoBlind ?? null,
    treesSearchNotEveryStep: report.forest?.okSearchRare ?? null,
    treesNotStuckWaitCu: (report.forest?.waitCu || 0) < (report.forest?.steps || 0) + 5,
    herbsNoSearch: report.herbs ? report.herbs.searches === 0 : null,
    herbsNoDobycha: report.herbs ? report.herbs.dobycha === 0 : null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
