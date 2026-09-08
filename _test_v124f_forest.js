/**
 * Forest live on already-entered big forest (Client + my_group).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124f_forest.json');

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
    return {
      href: w?.location?.href,
      readyBig: !!(w?.Client && g),
      my: g ? { x: g.posx, y: g.posy, stay: g.stay } : null,
      we: w?.global_data?.wait_event,
    };
  });
}

async function inject(page, forestCfg) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate((forestCfg) => {
    const base = {
      forest: Object.assign(
        {
          autoSearch: true,
          searchEverySteps: 5,
          searchRadius: 5,
          equipTool: false,
          delayMin: 350,
          delayMax: 600,
        },
        forestCfg
      ),
      battle: { delayMin: 7000, delayMax: 8000, healBelowHpPct: 30, summonHelper: true, useMagic: true },
      chaos: { ensureKit: false, autoJoin: false, autoCreate: false, fight: false },
      license: { enabled: false },
    };
    localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(base));
    localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
    localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
  }, forestCfg);
  for (const f of page.frames()) {
    try {
      await f.evaluate((src) => {
        try {
          eval(src);
        } catch (e) {}
      }, code);
    } catch (e) {}
  }
  await sleep(800);
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 50) : [];
  });
}

async function runMode(page, name, forestCfg, ms) {
  await inject(page, forestCfg);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
  await sleep(ms);
  const lines = await botLines(page);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
  await sleep(800);
  const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
  const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
  const approach = lines.filter((l) => /к ресурсу|иду к|собираю|трав|гриб/i.test(l));
  return {
    name,
    cfg: forestCfg,
    steps: steps.length,
    searches: searches.length,
    dobycha: dobycha.length,
    approach: approach.length,
    stepSamples: steps.slice(0, 12),
    searchSamples: searches.slice(0, 6),
    dobychaSamples: dobycha.slice(0, 6),
    approachSamples: approach.slice(0, 6),
    okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
    okSearchRare: searches.length === 0 || searches.length <= Math.ceil(Math.max(steps.length, 1) / 4) + 2,
    lines: lines.slice(0, 22),
  };
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
  await go(page, 'gates.html');
  let s = await snap(page);
  if (!s.readyBig) {
    await go(page, 'newforest2.html');
    s = await snap(page);
  }
  report.enter = s;
  log('enter', s);

  if (!s.readyBig) {
    report.error = 'not in big forest';
  } else {
    // trees mode: search every 5 steps, no blind dobycha
    report.trees = await runMode(
      page,
      'trees',
      {
        collectTrees: true,
        collectOre: false,
        collectHerbs: false,
        collectMushrooms: false,
        autoSearch: true,
        searchEverySteps: 5,
      },
      45000
    );
    log('TREES', {
      steps: report.trees.steps,
      searches: report.trees.searches,
      dobycha: report.trees.dobycha,
      okNoBlind: report.trees.okNoBlind,
      okSearchRare: report.trees.okSearchRare,
    });

    // herbs-only: no search/dobycha spam, should walk toward items
    report.herbs = await runMode(
      page,
      'herbs',
      {
        collectTrees: false,
        collectOre: false,
        collectHerbs: true,
        collectMushrooms: false,
        autoSearch: true,
        searchEverySteps: 5,
      },
      35000
    );
    log('HERBS', {
      steps: report.herbs.steps,
      searches: report.herbs.searches,
      dobycha: report.herbs.dobycha,
      approach: report.herbs.approach,
    });
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    forestEntered: !!report.enter?.readyBig,
    treesHasSteps: (report.trees?.steps || 0) > 0,
    treesNoBlindDobycha: report.trees?.okNoBlind ?? null,
    treesSearchNotEveryStep: report.trees?.okSearchRare ?? null,
    herbsNoSearch: report.herbs ? report.herbs.searches === 0 : null,
    herbsNoDobycha: report.herbs ? report.herbs.dobycha === 0 : null,
    herbsHasSteps: (report.herbs?.steps || 0) > 0,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
