/**
 * v1.2.4 live retest: cfg delay apply, chaos pause/heal/summon, forest step/search.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124d_report.json');

const DELAY_MIN = 7000;
const DELAY_MAX = 8000;

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
    else if (typeof w.goR === 'function') w.goR(u);
    else w.location.href = u;
  }, url);
  await sleep(2200);
}

async function leaveMaps(page) {
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      if (typeof w.Capitulate === 'function') w.Capitulate();
    } catch (e) {}
    try {
      if (w.BID) w.PrepareReq?.('bid=' + w.BID + '&actBattle-Capitulate=1');
    } catch (e2) {}
    try {
      if (typeof w.TryReturnToTown === 'function') w.TryReturnToTown();
    } catch (e3) {}
    try {
      w.Client?.send?.('actNewMaps-ReturnToTown=1');
    } catch (e4) {}
  });
  await sleep(4000);
  await go(page, 'place.html');
  await sleep(1500);
}

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(
    ({ delayMin, delayMax }) => {
      const base = {
        battle: {
          delayMin,
          delayMax,
          healBelowHpPct: 30,
          useMagic: true,
          magicChance: 0,
          suboptimalChance: 0,
          summonHelper: true,
          helperSpell: 'помощник',
          magicBookUrl: '/magbook.chtml',
        },
        forest: {
          collectTrees: true,
          collectOre: false,
          collectHerbs: false,
          collectMushrooms: false,
          autoSearch: true,
          searchEverySteps: 5,
          searchRadius: 5,
          equipTool: false,
        },
        chaos: {
          autoJoin: true,
          autoCreate: true,
          fight: true,
          ensureKit: false,
          maxp: 3,
          roomUrl: 'arena_room_1_bmode_36.html',
        },
        license: { enabled: false },
      };
      localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(base));
      localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
      localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
    },
    { delayMin: DELAY_MIN, delayMax: DELAY_MAX }
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
  return page.evaluate(() => {
    const panel = window.top.document.getElementById('k5-panel');
    const dMin = panel?.querySelector('[data-cfg-num="battle.delayMin"]')?.value;
    const heal = panel?.querySelector('[data-cfg-num="battle.healBelowHpPct"]')?.value;
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || 'null');
    } catch (e) {}
    return {
      panel: !!panel,
      uiDelayMin: dMin ? Number(dMin) : null,
      uiHeal: heal ? Number(heal) : null,
      storedDelay: stored?.battle?.delayMin ?? null,
    };
  });
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 50) : [];
  });
}

async function roomInfo(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const text = (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 350);
    return {
      href: w.location.href,
      create: !!w.document.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: [...w.document.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value),
      inApp: /отозвать|вы в заявке|ожидание|в заявке/i.test(text),
      text,
    };
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
    };
  });
}

async function forestSnap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      file: String(w?.location?.href || '').split('/').pop(),
      readyBig: !!(w?.Client && g),
      my: g ? { x: g.posx, y: g.posy } : null,
      text: ((w?.document?.body?.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 220),
      hasUlimit: !!w?.document?.querySelector('[name=ulimit]'),
      hasCreate: [...(w?.document?.forms || [])].some((f) => /CreateGroup/i.test(f.innerHTML || '')),
    };
  });
}

function parsePause(line) {
  const m = /пауза\s+(\d+)–(\d+)с/.exec(line);
  return m ? [Number(m[1]), Number(m[2])] : null;
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
  await leaveMaps(page);

  report.inject = await inject(page);
  log('inject', report.inject);

  // --- CHAOS ---
  await go(page, 'arena_room_1_bmode_36.html');
  let room = await roomInfo(page);
  report.room1 = room;
  log('room', room.create, room.joins?.length, room.inApp, room.text.slice(0, 120));

  if (!room.create && !room.joins?.length && !room.inApp) {
    await go(page, 'arena_room_1_bmode_36_smode_1.html');
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const btn = [...w.document.querySelectorAll('input')].find((b) => /надеть/i.test(b.value || ''));
      if (btn) btn.click();
    });
    await sleep(2500);
    await go(page, 'arena_room_1_bmode_36.html');
    room = await roomInfo(page);
    report.room2 = room;
    log('room2', room.create, room.joins?.length, room.inApp);
  }

  if (!room.inApp) {
    if (room.joins?.length) {
      report.join = await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const join = w.document.querySelector('input[name="actBattle-Join"]');
        if (!join?.form) return { ok: false };
        const side = join.form.querySelector('input[name="side"], select[name="side"]');
        if (side && side.tagName === 'SELECT') side.value = side.options[0]?.value || '1';
        const btn = [...join.form.querySelectorAll('input[type=submit]')].find((b) =>
          /принять|войти/i.test(b.value || '')
        );
        if (btn && join.form.requestSubmit) join.form.requestSubmit(btn);
        else if (btn) btn.click();
        else join.form.submit();
        return { ok: true, id: join.value };
      });
      log('join', report.join);
    } else if (room.create) {
      report.create = await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const min = w.document.querySelector('[name="Battle{minlvl}"]');
        const max = w.document.querySelector('[name="Battle{maxlvl}"]');
        const mp = w.document.querySelector('[name="Battle{maxp}"]');
        if (min) min.value = '0';
        if (max) max.value = '100';
        if (mp) mp.value = '3';
        const btn = w.document.querySelector('input[name="actBattle-CreateHeader"]');
        if (!btn) return { ok: false };
        if (btn.form?.requestSubmit) btn.form.requestSubmit(btn);
        else btn.click();
        return { ok: true };
      });
      log('create', report.create);
    }
    await sleep(2500);
  }

  await page.evaluate(() => window.top.document.getElementById('k5-chaos-start')?.click());

  let battle = null;
  for (let i = 0; i < 100; i++) {
    battle = await battleSnap(page);
    if (i % 10 === 0) {
      const lines = await botLines(page);
      const ri = await roomInfo(page);
      log('waitB', i, battle.BID, battle.label, lines[0] || '', 'joins', ri.joins?.length, 'inApp', ri.inApp);
    }
    if (battle.BID) break;
    await sleep(2000);
  }
  report.battle = battle;

  if (battle?.BID) {
    await sleep(50000);
    const lines = await botLines(page);
    const pauses = lines.filter((l) => /ваш ход — пауза/.test(l));
    const heals = lines.filter((l) => /— хил|хил через/.test(l));
    const summons = lines.filter((l) => /magbook|помощник/i.test(l));
    const attacks = lines.filter((l) => /Бой ход|сближение/i.test(l));
    const pauseNums = pauses.map(parsePause).filter(Boolean);
    const delayOk =
      pauseNums.length > 0 &&
      pauseNums.every(([a, b]) => a >= Math.floor(DELAY_MIN / 1000) - 1 && b >= Math.floor(DELAY_MAX / 1000) - 1);
    const hpPct = battle.mhp ? (100 * battle.hp) / battle.mhp : null;
    report.chaos = {
      pauseSamples: pauses.slice(0, 6),
      pauseNums: pauseNums.slice(0, 6),
      delayOk,
      heals: heals.length,
      healOk: hpPct == null || hpPct > 30 ? heals.length === 0 : true,
      summonTried: summons.length > 0,
      attackLogged: attacks.length > 0,
      hpPct,
      lines: lines.slice(0, 22),
    };
    log('CHAOS', {
      delayOk,
      pauseNums: pauseNums[0],
      healOk: report.chaos.healOk,
      summons: summons.length,
      attacks: attacks.length,
    });
    await page.evaluate(() => window.top.document.getElementById('k5-chaos-stop')?.click());
  } else {
    report.chaos = { fail: 'no battle', lines: (await botLines(page)).slice(0, 15) };
    log('no battle', report.chaos.lines);
  }

  // --- FOREST ---
  await leaveMaps(page);
  await go(page, 'gates.html');
  await sleep(2000);
  let fs0 = await forestSnap(page);
  report.gates = fs0;
  log('gates', fs0.file, fs0.readyBig, fs0.hasUlimit, fs0.hasCreate, fs0.text.slice(0, 100));

  if (!fs0.readyBig) {
    const create = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const doc = w.document;
      if (typeof w.StartDobycha === 'function') {
        w.location.href = 'newforest2.html';
        return { toNf: true };
      }
      const cancel = [...doc.querySelectorAll('input')].find((n) => /отозвать/i.test(n.value || ''));
      if (cancel) return { already: cancel.value };
      const form = [...doc.forms].find((f) => /CreateGroup/i.test(f.innerHTML));
      if (!form) return { noForm: true, text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 250) };
      const ul = form.querySelector('[name=ulimit]');
      if (ul) ul.value = '1';
      const btn = form.querySelector('input[type=submit]');
      if (btn) {
        btn.click();
        return { clicked: btn.value };
      }
      form.submit();
      return { submitted: true };
    });
    report.forestCreate = create;
    log('forestCreate', create);
    let entered = null;
    for (let i = 0; i < 28; i++) {
      await sleep(2500);
      entered = await forestSnap(page);
      if (i % 4 === 0) log('waitF', i, entered.file, entered.readyBig);
      if (entered.readyBig) break;
    }
    report.forestEnter = entered;
  } else {
    report.forestEnter = fs0;
  }

  if (report.forestEnter?.readyBig) {
    // re-inject flags clean, keep cfg
    await page.evaluate(() => {
      localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
      localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
    });
    await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
    await sleep(40000);
    const lines = await botLines(page);
    const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
    const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
    const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
    report.forest = {
      steps: steps.length,
      searches: searches.length,
      dobycha: dobycha.length,
      stepSamples: steps.slice(0, 10),
      searchSamples: searches.slice(0, 5),
      okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
      okSearchRare: searches.length === 0 || searches.length <= Math.ceil(Math.max(steps.length, 1) / 4) + 2,
      lines: lines.slice(0, 18),
    };
    log('FOREST', report.forest);
    await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    cfgUiDelay: report.inject?.uiDelayMin === DELAY_MIN || report.inject?.storedDelay === DELAY_MIN,
    chaosInBattle: !!report.battle?.BID,
    chaosDelayOk: report.chaos?.delayOk ?? null,
    chaosNoPrematureHeal: report.chaos?.healOk ?? null,
    chaosSummonTried: report.chaos?.summonTried ?? null,
    forestEntered: !!report.forestEnter?.readyBig,
    forestNoBlindDobycha: report.forest?.okNoBlind ?? null,
    forestSearchNotEveryStep: report.forest?.okSearchRare ?? null,
    forestHasSteps: (report.forest?.steps || 0) > 0,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
const fail = Object.values(report.verdict).some((v) => v === false);
process.exit(fail ? 1 : 0);
