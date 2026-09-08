/**
 * Forest live: wait for Client+my_group, then observe trees mode ~2min.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124h_forest.json');

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
      ready: !!(w?.Client && typeof w.Client.send === 'function' && g),
      my: g ? { x: Number(g.posx), y: Number(g.posy), stay: Number(g.stay), napr: Number(g.napr) } : null,
      we: w?.global_data?.wait_event,
      canvas: !!w?.document?.getElementById('canvas'),
      startDobycha: typeof w?.StartDobycha,
    };
  });
}

async function waitReady(page, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const s = await snap(page);
    if (s.ready) return s;
    if (i % 5 === 0) log('waitReady', i, s.href, s.canvas, s.startDobycha);
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

  await go(page, 'gates.html');
  let s = await waitReady(page, 20);
  if (!s.ready) {
    await go(page, 'newforest2.html');
    s = await waitReady(page, 30);
  }
  report.enter = s;
  log('enter', s);
  if (!s.ready) throw new Error('not in big forest after wait');

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

  // inject top + d_act once
  await page.mainFrame().evaluate((src) => {
    try {
      eval(src);
    } catch (e) {}
  }, code);
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      const u = f.url();
      if (/gates|newforest|about:blank/i.test(u) || /d_act/i.test(String(f.name() || ''))) {
        await f.evaluate((src) => {
          try {
            eval(src);
          } catch (e) {}
        }, code);
      }
    } catch (e) {}
  }
  await sleep(1000);

  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
  await sleep(1500);
  const startLines = await botLines(page);
  report.startLines = startLines.slice(0, 5);
  log('start', startLines[0]);

  for (let i = 0; i < 20; i++) {
    await sleep(6000);
    const sn = await snap(page);
    const lines = await botLines(page);
    const recent = lines
      .filter((l) => /Большой лес|Событие wait|Жду|бан|поиск|добыч|шаг|СТАРТ|СТОП/i.test(l))
      .slice(0, 10);
    report.samples.push({ i, sn, recent: recent.slice(0, 5) });
    log('t', i, sn.ready, sn.my, sn.we, recent[0] || '');
    if (!sn.ready && i > 2) {
      await go(page, 'newforest2.html');
      await waitReady(page, 10);
    }
  }

  const lines = await botLines(page);
  const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
  const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
  const waitCu = lines.filter((l) => /Жду cu\/gd/.test(l));
  const pts = report.samples.map((x) => x.sn.my).filter(Boolean);
  report.forest = {
    steps: steps.length,
    searches: searches.length,
    dobycha: dobycha.length,
    waitCu: waitCu.length,
    stepSamples: steps.slice(0, 20),
    searchSamples: searches.slice(0, 10),
    dobychaSamples: dobycha.slice(0, 10),
    posTrail: pts,
    moved: pts.length >= 2 && pts.some((p) => p.x !== pts[0].x || p.y !== pts[0].y),
    okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
    okSearchRare: searches.length <= Math.ceil(Math.max(steps.length, 1) / 4) + 2,
    lines: lines.slice(0, 30),
  };
  log('FOREST', {
    steps: report.forest.steps,
    searches: report.forest.searches,
    dobycha: report.forest.dobycha,
    waitCu: report.forest.waitCu,
    moved: report.forest.moved,
  });
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());

  // herbs: toggle checkboxes, restart
  await page.evaluate(() => {
    const doc = window.top.document;
    const set = (sel, on) => {
      const el = doc.querySelector(sel);
      if (!el) return;
      if (el.checked !== on) el.click();
    };
    set('[data-cfg="forest.collectTrees"]', false);
    set('[data-cfg="forest.collectOre"]', false);
    set('[data-cfg="forest.collectHerbs"]', true);
    set('[data-cfg="forest.collectMushrooms"]', false);
  });
  s = await snap(page);
  if (!s.ready) {
    await go(page, 'gates.html');
    s = await waitReady(page, 20);
  }
  report.herbsEnter = s;
  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
  await sleep(40000);
  const hlines = await botLines(page);
  report.herbs = {
    steps: hlines.filter((l) => /Большой лес: шаг/.test(l)).length,
    searches: hlines.filter((l) => /Большой лес: поиск/.test(l)).length,
    dobycha: hlines.filter((l) => /Большой лес: добыча/.test(l)).length,
    lines: hlines.slice(0, 25),
  };
  log('HERBS', report.herbs);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    forestEntered: !!report.enter?.ready,
    treesStepped: (report.forest?.steps || 0) >= 3,
    treesMoved: !!report.forest?.moved,
    treesNoBlindDobycha: report.forest?.okNoBlind ?? null,
    treesSearchNotEveryStep: report.forest?.okSearchRare ?? null,
    treesLowWaitCuSpam: (report.forest?.waitCu || 0) <= Math.max(3, (report.forest?.steps || 0)),
    herbsNoSearch: report.herbs ? report.herbs.searches === 0 : null,
    herbsNoDobycha: report.herbs ? report.herbs.dobycha === 0 : null,
    herbsStepped: (report.herbs?.steps || 0) > 0,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
