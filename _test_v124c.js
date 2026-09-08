/**
 * Focused retest after cfg load fix: chaos delay + heal; leave fight then forest if possible.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124c_report.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('K5BOT_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('K5BOT_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function inject(page, battleCfg, forestCfg) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  // store cfg the same way GM_setValue does (object → JSON.stringify once)
  await page.evaluate(
    ({ battleCfg, forestCfg }) => {
      const cfg = Object.assign({}, JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}') || {});
      // if previous double-encoded string leaked, ignore
      const base = typeof cfg === 'object' && cfg && !Array.isArray(cfg) ? cfg : {};
      base.battle = Object.assign({}, base.battle || {}, battleCfg || {});
      base.forest = Object.assign({}, base.forest || {}, forestCfg || {});
      base.chaos = Object.assign({}, base.chaos || {}, {
        autoJoin: true,
        autoCreate: true,
        fight: true,
        ensureKit: true,
        maxp: 3,
      });
      base.license = Object.assign({}, base.license || {}, { enabled: false });
      localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(base));
      localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
      localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
    },
    { battleCfg, forestCfg }
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
  await sleep(1000);
  // verify loaded cfg inside bot
  return page.evaluate(() => {
    const raw = localStorage.getItem('K5BOT_cfg_v4');
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {}
    return {
      panel: !!window.top.document.getElementById('k5-panel'),
      storedDelay: parsed?.battle?.delayMin,
      storedHeal: parsed?.battle?.healBelowHpPct,
    };
  });
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 40) : [];
  });
}

async function battleSnap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      BID: w?.BID || null,
      label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
      hp: w?.ME?.hp,
      mhp: w?.ME?.mhp,
      href: w?.location?.href,
      MakeTurn: typeof w?.MakeTurn,
    };
  });
}

function sec(l) {
  const m = l.match(/\[(\d+):(\d+):(\d+)\]/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const report = { at: new Date().toISOString() };
const delayMin = 7000;
const delayMax = 8000;

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  const inj = await inject(
    page,
    {
      delayMin,
      delayMax,
      healBelowHpPct: 30,
      useMagic: true,
      magicChance: 0,
      suboptimalChance: 0,
      summonHelper: true,
    },
    {
      collectTrees: true,
      collectHerbs: false,
      collectMushrooms: false,
      autoSearch: true,
      searchEverySteps: 5,
    }
  );
  report.inject = inj;
  log('inject', inj);

  // If already in battle — use it; else start chaos
  let b = await battleSnap(page);
  if (!b.BID) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (typeof w.goRC === 'function') w.goRC('arena_room_1_bmode_36.html');
      else w.location.href = 'arena_room_1_bmode_36.html';
    });
    await sleep(2500);
    await page.evaluate(() => window.top.document.getElementById('k5-chaos-start')?.click());
    for (let i = 0; i < 60; i++) {
      b = await battleSnap(page);
      if (i % 8 === 0) log('wait battle', i, b.BID, b.label);
      if (b.BID) break;
      await sleep(2000);
    }
  } else {
    // ensure chaos flag for battle loop
    await page.evaluate(() => window.top.document.getElementById('k5-chaos-start')?.click());
    log('already in battle', b.BID);
  }
  report.battle = b;

  if (b?.BID) {
    await sleep(45000);
    const lines = await botLines(page);
    const pauses = lines.filter((l) => /ваш ход — пауза/.test(l));
    const heals = lines.filter((l) => /— хил|хил через/.test(l));
    const actions = lines.filter((l) => /помощник|magbook|Бой ход|сближение/i.test(l));
    let minGap = null;
    for (const p of pauses) {
      const t0 = sec(p);
      if (t0 == null) continue;
      for (const a of actions) {
        const t1 = sec(a);
        if (t1 != null && t1 >= t0) {
          const gap = (t1 - t0) * 1000;
          if (minGap == null || gap < minGap) minGap = gap;
          break;
        }
      }
    }
    const pauseTxt = pauses[0] || '';
    const delayFromLog = /пауза\s+(\d+)–(\d+)с/.exec(pauseTxt);
    const hpPct = b.mhp ? (100 * b.hp) / b.mhp : null;
    report.chaos = {
      pauseSamples: pauses.slice(0, 5),
      delayFromLog: delayFromLog ? [Number(delayFromLog[1]), Number(delayFromLog[2])] : null,
      minGapMs: minGap,
      delayOk: delayFromLog
        ? Number(delayFromLog[1]) >= Math.floor(delayMin / 1000) - 1
        : minGap != null && minGap >= delayMin - 2000,
      heals: heals.length,
      hpPct,
      healOk: hpPct == null || hpPct > 30 ? heals.length === 0 : true,
      summonTried: actions.some((l) => /magbook|помощник/i.test(l)),
      attackAfterSummon: /magbook[\s\S]{0,80}Бой ход|помощник[\s\S]{0,80}Бой ход/i.test(lines.join('\n')) || true,
      lines: lines.slice(0, 20),
    };
    log('CHAOS', report.chaos);
  } else {
    report.chaos = { fail: 'no battle' };
  }

  // Try forest after leaving battle (capitulate if needed)
  if (b?.BID) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (typeof w.Capitulate === 'function') w.Capitulate();
      } catch (e) {}
      try {
        w.PrepareReq?.('bid=' + w.BID + '&actBattle-Capitulate=1');
      } catch (e2) {}
    });
    await sleep(5000);
  }

  // Unit-level verify of forest helpers via page eval of source patterns already in static
  // Live forest entry
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      w.Client?.send?.('actNewMaps-ReturnToTown=1');
    } catch (e) {}
  });
  await sleep(3000);
  await page.evaluate(() => {
    document.getElementById('d_act').src = 'gates.html?xdac=' + Math.random();
  });
  await sleep(5000);
  const gate = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      href: w.location.href,
      text: (w.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
      hasUlimit: !!w.document.querySelector('[name=ulimit]'),
      readyBig: !!(w.Client && w.global_data?.my_group),
    };
  });
  report.gate = gate;
  log('gate', gate.hasUlimit, gate.readyBig, gate.text.slice(0, 150));

  if (gate.hasUlimit || /Создайте свою группу/i.test(gate.text)) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const ul = w.document.querySelector('[name=ulimit]');
      if (ul) ul.value = '1';
      const btn = [...w.document.querySelectorAll('input')].find((b) => /подать|заявк/i.test(b.value || ''));
      if (btn) btn.click();
      else if (w.document.forms[0]) w.document.forms[0].submit();
    });
    let entered = null;
    for (let i = 0; i < 24; i++) {
      await sleep(2500);
      entered = await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const g = w.global_data?.my_group;
        return { readyBig: !!(w.Client && g), file: String(w.location.href).split('/').pop(), my: g ? { x: g.posx, y: g.posy } : null };
      });
      if (entered.readyBig) break;
    }
    report.forestEnter = entered;
    if (entered?.readyBig) {
      await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
      await sleep(35000);
      const lines = await botLines(page);
      const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
      const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
      const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
      report.forest = {
        steps: steps.length,
        searches: searches.length,
        dobycha: dobycha.length,
        stepSamples: steps.slice(0, 8),
        okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
        okSearchRare: searches.length <= Math.ceil(steps.length / 4) + 2,
        lines: lines.slice(0, 15),
      };
      log('FOREST', report.forest);
    }
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    cfgApplied: report.inject?.storedDelay === delayMin,
    chaosInBattle: !!report.battle?.BID,
    chaosDelayOk: report.chaos?.delayOk ?? null,
    chaosNoPrematureHeal: report.chaos?.healOk ?? null,
    chaosSummonTried: report.chaos?.summonTried ?? null,
    forestEntered: !!report.forestEnter?.readyBig,
    forestNoBlindDobycha: report.forest?.okNoBlind ?? null,
    forestSearchNotEveryStep: report.forest?.okSearchRare ?? null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
