/**
 * v1.2.4 regression: forest scan/step-on + chaos delay/heal/summon
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124_report.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;

function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

function staticAudit(src) {
  return {
    version124: /VERSION = '1\.2\.4'/.test(src),
    searchEverySteps: /searchEverySteps:\s*5/.test(src),
    noBlindDobychaEveryTick: !/lastCraft > 3500/.test(src),
    dobychaOnlyFront: /перед вами/.test(src) && /bigForestTryDobycha/.test(src),
    herbsNoSearch: /wantStep && !needCraft/.test(src),
    banTexture: /бан клетки/.test(src),
    healGateUseMagic: /if \(!cfg\.useMagic\) return false/.test(src),
    healDefault30: /healBelowHpPct:\s*30/.test(src),
    turnDelayFromStart: /turnReadySince/.test(src) && /ваш ход — пауза/.test(src),
    healBeforeSummon: /needHeal[\s\S]{0,400}trySummonHelper/.test(src),
  };
}

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return {};
    const g = w.global_data && w.global_data.my_group;
    const nItems = g && w.global_data.abs_poses ? Object.keys(w.global_data.abs_poses).length : 0;
    return {
      href: w.location.href,
      file: String(w.location.href || '').split('/').pop(),
      readyBig: !!(w.Client && g),
      we: w.global_data && w.global_data.wait_event,
      my: g ? { x: g.posx, y: g.posy, stay: g.stay, napr: g.napr } : null,
      nItems,
      text: ((w.document.body && w.document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 180),
    };
  });
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 60) : [];
  });
}

async function inject(page, forestCfg, battleCfg) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(
    ({ forestCfg, battleCfg }) => {
      localStorage.setItem('K5BOT_run_forest', 'false');
      localStorage.setItem('K5BOT_run_chaos', 'false');
      const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
      cfg.forest = Object.assign({}, cfg.forest || {}, forestCfg || {});
      cfg.battle = Object.assign({}, cfg.battle || {}, battleCfg || {});
      cfg.chaos = Object.assign({}, cfg.chaos || {}, {
        autoJoin: true,
        autoCreate: true,
        fight: true,
        ensureKit: true,
      });
      cfg.license = Object.assign({}, cfg.license || {}, { enabled: false });
      localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
    },
    { forestCfg, battleCfg }
  );
  for (const f of page.frames()) {
    try {
      await f.evaluate((src) => {
        try {
          eval(src);
        } catch (e) {}
      }, code);
    } catch (e) {}
  }
  await sleep(900);
  return page.evaluate(() => !!window.top.document.getElementById('k5-panel'));
}

async function leaveMaps(page) {
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      if (typeof w.TryReturnToTown === 'function') w.TryReturnToTown();
    } catch (e) {}
  });
  await sleep(4000);
}

async function enterBigForest(page) {
  let s = await snap(page);
  if (s.readyBig) return s;
  await goAct(page, 'gates.html');
  s = await snap(page);
  if (s.readyBig) return s;
  const r = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w.document;
    if (typeof w.StartDobycha === 'function') {
      w.location.href = 'newforest2.html';
      return { toNf: true };
    }
    const form = [...doc.forms].find((f) => /CreateGroup/i.test(f.innerHTML));
    if (!form) {
      // try click enter / войти
      const btn = [...doc.querySelectorAll('input,button,a')].find((b) =>
        /войти|групп|создать|открыть/i.test((b.value || '') + (b.textContent || ''))
      );
      if (btn) {
        btn.click();
        return { clicked: (btn.value || btn.textContent || '').slice(0, 40) };
      }
      return { noForm: true, text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) };
    }
    const ul = form.querySelector('[name=ulimit]');
    if (ul) ul.value = '1';
    const btn = form.querySelector('input[type=submit]');
    if (btn) btn.click();
    else form.submit();
    return { created: true };
  });
  log('enterForest action', r);
  for (let i = 0; i < 36; i++) {
    s = await snap(page);
    if (i % 4 === 0) log('forest wait', i, s.file, s.readyBig, s.we, s.my);
    if (s.readyBig) return s;
    if (/newforest/i.test(s.file || '')) {
      await sleep(2500);
      s = await snap(page);
      if (s.readyBig) return s;
    }
    await sleep(2000);
  }
  return s;
}

function analyzeForestLogs(lines) {
  const joined = lines.join('\n');
  const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
  const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
  const bans = lines.filter((l) => /бан клетки|бан /.test(l));
  // steps between searches
  const stepNums = steps
    .map((l) => {
      const m = l.match(/шаг \((\d+)\/(\d+)\)/);
      return m ? { n: Number(m[1]), every: Number(m[2]) } : null;
    })
    .filter(Boolean);
  return {
    stepCount: steps.length,
    searchCount: searches.length,
    dobychaCount: dobycha.length,
    banCount: bans.length,
    stepSamples: stepNums.slice(0, 12),
    searchedBeforeFiveSteps: stepNums.some((s) => s.n > 0 && s.n < s.every && searches.length > 1),
    // blind dobycha would show many dobycha without «перед вами»
    blindDobychaSuspect: dobycha.filter((l) => !/перед вами|event/i.test(l)).length > 3,
    lines: lines.slice(0, 25),
  };
}

function analyzeChaosLogs(lines, delayMin) {
  const joined = lines.join('\n');
  const pauses = lines.filter((l) => /ваш ход — пауза|пауза хода ещё/.test(l));
  const heals = lines.filter((l) => /HP .* — хил|хил через/.test(l));
  const summons = lines.filter((l) => /помощник|magbook/i.test(l));
  const attacks = lines.filter((l) => /Бой ход|сближение/.test(l));
  // Extract timestamps roughly and check gap after "ваш ход"
  const turnStarts = [];
  const actions = [];
  for (const l of lines) {
    const tm = l.match(/\[(\d{1,2}:\d{2}:\d{2})\]/);
    if (!tm) continue;
    const parts = tm[1].split(':').map(Number);
    const sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (/ваш ход — пауза/.test(l)) turnStarts.push({ sec, l });
    if (/помощник|хил|Бой ход|сближение|magbook/i.test(l) && !/ваш ход|пауза хода ещё|=== Боевой/.test(l)) {
      actions.push({ sec, l });
    }
  }
  let minGap = null;
  for (const t of turnStarts) {
    const next = actions.find((a) => a.sec >= t.sec);
    if (next) {
      const gap = (next.sec - t.sec) * 1000;
      if (minGap == null || gap < minGap) minGap = gap;
    }
  }
  return {
    pauseLogged: pauses.length > 0,
    healLogged: heals.length > 0,
    summonLogged: summons.length > 0,
    attackLogged: attacks.length > 0,
    minActionGapMs: minGap,
    delayOk: minGap == null || minGap >= Math.max(1500, delayMin * 0.6),
    lines: lines.slice(0, 30),
  };
}

const report = {
  at: new Date().toISOString(),
  static: staticAudit(fs.readFileSync(USER_JS, 'utf8')),
  forest: {},
  chaos: {},
};

log('STATIC', report.static);

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  await leaveMaps(page);

  // ——— FOREST: trees mode ———
  const entered = await enterBigForest(page);
  report.forest.enter = entered;
  log('entered forest', entered.readyBig, entered.file, entered.my);

  if (entered.readyBig) {
    const inj = await inject(
      page,
      {
        collectTrees: true,
        collectCopper: false,
        collectIron: false,
        collectGold: false,
        collectHerbs: false,
        collectMushrooms: false,
        autoSearch: true,
        searchEverySteps: 5,
        equipTool: false,
        delayMin: 400,
        delayMax: 700,
      },
      {}
    );
    report.forest.injectTrees = inj;
    await page.evaluate(() => {
      const b = window.top.document.getElementById('k5-forest-start');
      if (b) b.click();
    });
    log('forest trees started');
    await sleep(45000);
    const linesTrees = await botLines(page);
    report.forest.trees = analyzeForestLogs(linesTrees);
    log('trees analysis', JSON.stringify(report.forest.trees, null, 2).slice(0, 800));

    // stop forest
    await page.evaluate(() => {
      const b = window.top.document.getElementById('k5-forest-stop');
      if (b) b.click();
    });
    await sleep(1500);

    // ——— FOREST: herbs-only ———
    await page.evaluate(() => {
      try {
        const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
        cfg.forest = Object.assign({}, cfg.forest, {
          collectTrees: false,
          collectCopper: false,
          collectIron: false,
          collectGold: false,
          collectHerbs: true,
          collectMushrooms: true,
          autoSearch: true, // even if on — bot must not search in herbs-only
        });
        localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
      } catch (e) {}
      // re-apply by clicking stop/start; cfg read from BOT.cfg already loaded — force reload via location
    });
    // reinject to pick cfg
    await inject(
      page,
      {
        collectTrees: false,
        collectCopper: false,
        collectIron: false,
        collectGold: false,
        collectHerbs: true,
        collectMushrooms: true,
        autoSearch: true,
        searchEverySteps: 5,
        equipTool: false,
        delayMin: 400,
        delayMax: 700,
      },
      {}
    );
    await page.evaluate(() => {
      const b = window.top.document.getElementById('k5-forest-start');
      if (b) b.click();
    });
    log('forest herbs started');
    await sleep(35000);
    const linesHerbs = await botLines(page);
    // only look at recent herb-run lines (after re-start)
    const herbStartIdx = linesHerbs.findIndex((l) => /Лес СТАРТ|СТАРТ.*лес|Большой лес: шаг/i.test(l));
    const herbSlice = herbStartIdx >= 0 ? linesHerbs.slice(0, Math.max(herbStartIdx + 1, 40)) : linesHerbs;
    report.forest.herbs = analyzeForestLogs(herbSlice);
    // In herbs mode searches should be 0 among recent
    report.forest.herbs.noSearchOk = report.forest.herbs.searchCount === 0;
    report.forest.herbs.noDobychaOk = report.forest.herbs.dobychaCount === 0;
    log('herbs analysis', JSON.stringify(report.forest.herbs, null, 2).slice(0, 800));

    await page.evaluate(() => {
      const b = window.top.document.getElementById('k5-forest-stop');
      if (b) b.click();
    });
  } else {
    report.forest.fail = 'could not enter big forest';
  }

  // ——— CHAOS ———
  await leaveMaps(page);
  await goAct(page, 'place.html');
  await goAct(page, 'arena_room_1_bmode_36.html');
  const delayMin = 8000; // use 8s for faster test (still proves delay >> 1s)
  const delayMax = 9000;
  await inject(
    page,
    {},
    {
      delayMin,
      delayMax,
      healBelowHpPct: 30,
      useMagic: true,
      summonHelper: true,
      magicChance: 0,
      suboptimalChance: 0,
    }
  );
  await page.evaluate(() => {
    const b = window.top.document.getElementById('k5-chaos-start');
    if (b) b.click();
  });
  log('chaos started delay', delayMin, delayMax);

  let battle = null;
  for (let i = 0; i < 70; i++) {
    battle = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        BID: w?.BID || null,
        href: w?.location?.href,
        label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
        hp: w?.ME?.hp,
        mhp: w?.ME?.mhp,
      };
    });
    if (i % 8 === 0) {
      const lines = await botLines(page);
      log('chaos wait', i, battle.BID, battle.label, lines[0] || '');
    }
    if (battle.BID) break;
    await sleep(2000);
  }
  report.chaos.battle = battle;

  if (battle?.BID) {
    await sleep(45000);
    const lines = await botLines(page);
    report.chaos.analysis = analyzeChaosLogs(lines, delayMin);
    const hpPct = battle.mhp ? (100 * battle.hp) / battle.mhp : null;
    report.chaos.hpPctAtStart = hpPct;
    report.chaos.healShouldNotIfAbove30 = hpPct == null || hpPct > 30 ? !report.chaos.analysis.healLogged : true;
    log('chaos analysis', JSON.stringify(report.chaos.analysis, null, 2).slice(0, 1200));
  } else {
    report.chaos.fail = 'no battle';
    report.chaos.lines = await botLines(page);
  }

  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  const s = report.static;
  const staticOk = Object.values(s).every(Boolean);
  const f = report.forest;
  const c = report.chaos;
  report.verdict = {
    staticOk,
    forestEntered: !!f.enter?.readyBig,
    treesSteps: f.trees?.stepCount > 0,
    treesNoBlindDobycha: f.trees ? !f.trees.blindDobychaSuspect : null,
    treesSearchNotEveryStep: f.trees ? f.trees.searchCount <= Math.ceil((f.trees.stepCount || 0) / 4) + 2 : null,
    herbsNoSearch: f.herbs?.noSearchOk ?? null,
    herbsNoDobycha: f.herbs?.noDobychaOk ?? null,
    chaosInBattle: !!c.battle?.BID,
    chaosDelayOk: c.analysis?.delayOk ?? null,
    chaosPauseLogged: c.analysis?.pauseLogged ?? null,
    chaosNoPrematureHeal: c.healShouldNotIfAbove30 ?? null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}

const fails = Object.entries(report.verdict).filter(([, v]) => v === false);
process.exit(fails.length ? 1 : 0);
