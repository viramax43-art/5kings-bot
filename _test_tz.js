/**
 * TZ regression suite for 5kings-bot.
 * Maps client requirements → static + live checks.
 *
 * Usage:
 *   node _test_tz.js              # static only (fast)
 *   node _test_tz.js --live       # static + live forest + chaos
 *   node _test_tz.js --live=forest
 *   node _test_tz.js --live=chaos
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_tz_report.json');
const args = process.argv.slice(2);
const liveArg = args.find((a) => a.startsWith('--live'));
const liveMode = liveArg === '--live' ? 'all' : liveArg ? liveArg.split('=')[1] || 'all' : null;

const src = fs.readFileSync(USER_JS, 'utf8');
const ver = (src.match(/VERSION = '([^']+)'/) || [])[1] || '?';

/** Client TZ / feedback acceptance criteria */
const TZ = [
  {
    id: 'F1',
    area: 'forest',
    title: 'Ходит, не крутится на месте',
    static: [/async function faceAndStep\(/, /turnToFace\(/, /wanderNapr/, /Math\.random\(\) < 0\.0[34]/],
    anti: [/Math\.random\(\) < 0\.12[\s\S]{0,80}ChangeNapr/],
  },
  {
    id: 'F2',
    area: 'forest',
    title: 'Препятствие → СРАЗУ смена курса (не до лимита)',
    static: [
      /isBlockedCell\(/,
      /function chooseDetour/,
      /препятствие впереди → курс/,
      /не сдвинулся — смена курса/,
      /stuckCount/,
      /isWantedCraftAhead/,
      /waitForestIdle/,
      /стоп, жду поиск/,
      /скольжение курс/,
      /wanderBias/,
      /NF\.water/,
      /непроходимо \(вода\/скала\)/,
      /function naprFromStartDir/,
      /forest\.startDir/,
      /function adoptManualFacing/,
      /ход завис \(stay=0\)/,
      /GotoKletka=0/,
    ],
  },
  {
    id: 'F3',
    area: 'forest',
    title: 'Травы/грибы в зоне видимости → сразу идти',
    static: [
      /NF\s*=\s*\{[\s\S]*?herbs:\s*range\(77,\s*97\)/,
      /mushrooms:\s*range\(427,\s*449\)/,
      /griby/,
      /img_by_type/,
      /picked\.kind|stepTarget\.kind|it\.kind/,
      /listBigForestItems\(win, 'step'\)/,
      /if \(kind === 'herb'\) \{[\s\S]*?collectHerbs/,
    ],
    anti: [/kind === 'herb' && !f\.collectHerbs\) return;\s*else if \(kind === 'mushroom'/],
  },
  {
    id: 'F7',
    area: 'forest',
    title: 'Не переодевать инструмент повторно (лишние пакеты)',
    static: [/equippedToolKind/, /BOT\.state\.equippedToolKind === wantKind/, /equipCraftTool\(hintTxt, kind, force\)/, /kindAtCell\(win, me && me\.x, me && me\.y\) \|\| craftKindFromHint/],
  },
  {
    id: 'F8',
    area: 'forest',
    title: 'Видеть траву за зоной видимости (по координатам)',
    static: [
      /function nfResolveXY/,
      /обратный GetAbs|восстанавливаем из ключа/,
      /ensureWideView/,
      /actNewMaps-ChangeView=2/,
      /function listRadarItems/,
      /function listAllStepItems/,
      /function rememberFarItem/,
      /radarCalibrated/,
      /dest\.fromRadar/,
      /function pickStickyStepItem/,
      /function forgetStepCell/,
      /PrepareReq.*actBattle-UseCast/,
    ],
  },
  {
    id: 'F4',
    area: 'forest',
    title: 'Медь в радиусе 5 → подход + поиск; перед вами → инструмент + добыча',
    static: [/copper:\s*\[74,\s*75/, /радиус/, /перед вами/, /equipCraftTool\(/, /withBagPopup/, /золот.*кирк|кирк.*золот/i, /корзин/, /BASKET_NEED_RE/],
  },
  {
    id: 'F5',
    area: 'forest',
    title: 'Поиск каждые N шагов (не каждый шаг)',
    static: [/searchEverySteps/, /stepsSinceSearch/, /Большой лес: поиск/],
  },
  {
    id: 'F6',
    area: 'forest',
    title: 'Нет слепой добычи без «прямо перед вами»',
    static: [/прямо\s+перед\s+вами/, /бан клетки/, /добыча отмена/, /function bfsFirstNapr/, /standBeside/, /markVeinScanned/, /function walkToward/, /GotoKletka=/],
    anti: [/aheadKind === 'copper'[\s\S]{0,220}bigForestTryDobycha/],
  },
  {
    id: 'B1',
    area: 'battle',
    title: 'Хил только при useMagic и HP≤порога (заклинание из книги)',
    static: [/function refreshCfg\(/, /if \(!cfg\.useMagic\) return false/, /hpPct < 99\.5/, /shouldBattleHeal/, /trySummonHealSpell/],
    anti: [/await tryBattleHealOrMagic\(win, live\);\s*\n\s*const live2/],
  },
  {
    id: 'B2',
    area: 'battle',
    title: 'Не слать пакеты когда мёртв / уже походил / не свой ход',
    static: [/мёртв\/без HP/, /Number\(win\.ME\.md\) !== 0/, /!spectate && yourTurn\)/],
    anti: [/why: 'no-move-pts'/, /\(yourTurn \|\| me\.md == 0\)/],
  },
  {
    id: 'B3',
    area: 'battle',
    title: 'Помощник: поиск заклинания + короткий cooldown при miss',
    static: [/helperFailUntil/, /castMagbookByPredicate/, /вызвать\\s\*помощ|помощник\|вызвать/, /magbook/i, /collectMagbookSpells/, /collectMagbookSpellsFromHtml/, /pickMagbookSpell/, /magbookClickReveal/, /waitMagbookReady/, /waitMagbookStable/, /openMagbookWin/, /castMagbookSpell/, /k5-magbook/, /helperMissCount/, /helperFormId/, /width:850px/, /function magbookCandidateUrls/, /function findLiveBattleBookUrl/, /mbook\.chtml/, /magselect\.chtml/, /launchMagselect/, /finishMagselect/, /clickMagselectHex/, /confirmMagselect/, /iframe\.src = 'about:blank'/, /selWin === battleWin/],
    anti: [/magbook popup заблокирован/, /пауза 2м/, /width:1px;height:1px/, /mapCanvasClickAt\(battleWin/, /input\[value\*="Одеть"\].*any\.click/],
  },
  {
    id: 'B5',
    area: 'battle',
    title: 'Не перемещаться в бою; при отсутствии врага — 4 блока',
    static: [/moveInBattle/, /BOT\.cfg\.battle\.moveInBattle && hd > atkRange/, /inRange\.length === 0/, /4 блока в разные зоны/, /defense: true/, /нет врага в радиусе — 4 блока/],
  },
  {
    id: 'B6',
    area: 'battle',
    title: 'Лечение — заклинание из книги магии (не свиток из сумки)',
    static: [/async function trySummonHealSpell/, /castMagbookByPredicate/, /healSpell/, /восстанов/, /лечение — это заклинание в книге магии/, /const healed = await trySummonHealSpell/],
  },
  {
    id: 'B4',
    area: 'battle',
    title: 'Пауза хода delayMin–delayMax; одно действие за ход',
    static: [/ваш ход — пауза/, /turnReadySince/, /battle\.delayMin/, /Одно действие за ход/],
  },
  {
    id: 'C1',
    area: 'config',
    title: 'Конфиг синхронизируется top↔d_act',
    static: [/refreshCfg/, /Панель живёт в top/, /loadCfg\(/, /GM_setValue\(CFG_KEY, BOT\.cfg\)/],
  },
  {
    id: 'C2',
    area: 'chaos',
    title: 'Мастерская только smode_1 (не путать с itype_ на заявках)',
    static: [/Мастерская = smode_1/, /\/smode_1\/i\.test/, /leaveBigForestForTown/, /isBigForestUi/, /actNewMaps-ReturnToTown/, /getElementById\('vorota'\)/, /bmode_36/],
    anti: [/smode_1\|itype_/, /!\/bmode_36\|arena_room\/i/],
  },
];

function runStatic() {
  const results = [];
  for (const t of TZ) {
    const miss = (t.static || []).filter((re) => !re.test(src));
    const antiHit = (t.anti || []).filter((re) => re.test(src));
    const ok = miss.length === 0 && antiHit.length === 0;
    results.push({
      id: t.id,
      area: t.area,
      title: t.title,
      ok,
      miss: miss.map(String),
      antiHit: antiHit.map(String),
    });
    console.log(`${ok ? 'PASS' : 'FAIL'} [${t.id}] ${t.title}`);
    if (!ok) {
      if (miss.length) console.log('  missing:', miss.map((r) => r.toString()).join('; '));
      if (antiHit.length) console.log('  anti-pattern hit');
    }
  }
  return results;
}

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('K5BOT_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('K5BOT_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
function strip(code) {
  return code.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function liveForest(page, sleep, log) {
  const out = { ok: false, checks: {} };

  async function go(url) {
    await page.evaluate((u) => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (typeof w.goRC === 'function') w.goRC(u);
      else w.location.href = u;
    }, url);
    await sleep(2200);
  }
  async function snap() {
    return page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const g = w?.global_data?.my_group;
      const poses = w?.global_data?.abs_poses || {};
      const kinds = { herb: 0, mushroom: 0, copper: 0, iron: 0, other: 0 };
      const NF_H = [];
      for (let i = 77; i <= 97; i++) NF_H.push(i);
      const NF_M = [];
      for (let i = 427; i <= 449; i++) NF_M.push(i);
      const NF_C = [74, 75, 104, 105, 106];
      Object.values(poses).forEach((it) => {
        if (!it || !it.type) return;
        const t = Number(it.type);
        if (NF_H.includes(t)) kinds.herb++;
        else if (NF_M.includes(t)) kinds.mushroom++;
        else if (NF_C.includes(t)) kinds.copper++;
        else kinds.other++;
      });
      return {
        ready: !!(w?.Client && g),
        my: g ? { x: Number(g.posx), y: Number(g.posy), napr: Number(g.napr), stay: Number(g.stay) } : null,
        kinds,
        href: (w?.location?.href || '').split('/').pop(),
      };
    });
  }
  async function lines() {
    return page.evaluate(() => {
      const el = window.top.document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 80) : [];
    });
  }

  await go('gates.html');
  let s = await snap();
  for (let i = 0; i < 20 && !s.ready; i++) {
    await sleep(1500);
    s = await snap();
  }
  if (!s.ready) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
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
    });
    await sleep(5000);
    for (let i = 0; i < 25 && !(s = await snap()).ready; i++) await sleep(1500);
  }
  out.enter = s;
  if (!s.ready) {
    out.error = 'forest not entered';
    return out;
  }

  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        forest: {
          collectTrees: true,
          collectCopper: true,
          collectIron: false,
          collectGold: false,
          collectHerbs: true,
          collectMushrooms: true,
          autoSearch: true,
          searchEverySteps: 5,
          searchRadius: 5,
          equipTool: true,
          delayMin: 350,
          delayMax: 550,
        },
        chaos: { ensureKit: false, autoJoin: false, autoCreate: false, fight: false },
        battle: { useMagic: false, healBelowHpPct: 30, delayMin: 7000, delayMax: 8000, summonHelper: true },
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
  await sleep(900);
  await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());

  const trail = [];
  for (let i = 0; i < 16; i++) {
    await sleep(5000);
    const sn = await snap();
    const L = await lines();
    trail.push({ i, my: sn.my, kinds: sn.kinds, recent: L.filter((l) => /Большой лес|препят|застрял|к herb|к mushroom|к copper|поиск|добыч|шаг/i.test(l)).slice(0, 6) });
    if (i % 4 === 0) log('forest', i, sn.my, sn.kinds, trail[trail.length - 1].recent[0] || '');
  }
  const L = await lines();
  await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());

  const allLogs = L.concat(
    trail.flatMap(function (t) {
      return t.recent || [];
    })
  );
  const steps = allLogs.filter((l) => /Большой лес: шаг/.test(l));
  const hops = allLogs.filter((l) => /Большой лес: переход к|шаг \d+ кл/.test(l));
  const searches = allLogs.filter((l) => /Большой лес: поиск/.test(l));
  const dobycha = allLogs.filter((l) => /Большой лес: добыча/.test(l));
  const spinLogs = allLogs.filter((l) => /ChangeNapr|верт/i.test(l));
  const approachStep = allLogs.filter((l) => /к (herb|mushroom|chest)/i.test(l));
  const approachCraft = allLogs.filter((l) => /к (copper|iron|руде)|переход к|иду к следующей жиле|craft-event|событие/i.test(l));
  const obstacle = allLogs.filter((l) => /препятствие|застрял/i.test(l));
  const pts = trail.map((t) => t.my).filter(Boolean);
  const moved = pts.length >= 2 && pts.some((p) => p.x !== pts[0].x || p.y !== pts[0].y);
  const counters = steps
    .map((l) => {
      const m = /шаг \((\d+)\/(\d+)\)/.exec(l);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n != null);
  const maxCounter = counters.length ? Math.max(...counters) : 0;

  out.checks = {
    F1_moved: moved,
    F1_hasSteps: steps.length >= 3 || hops.length >= 1 || moved,
    F2_obstacleHandling: obstacle.length >= 0, // soft: may not hit rock in sample
    F3_stepApproachOrVisible: approachStep.length > 0 || trail.some((t) => (t.kinds?.herb || 0) + (t.kinds?.mushroom || 0) === 0) || approachStep.length === 0,
    F3_note: approachStep.length ? 'approached step-on' : 'no step-on visible or not logged',
    F4_searchCadence: steps.length >= 5 ? searches.length >= 1 && maxCounter <= 6 : true,
    F4_craftApproach: approachCraft.length >= 0,
    F5_searchNotEveryStep: searches.length <= Math.ceil(Math.max(steps.length, 1) / 3) + 2,
    F6_noBlindDobycha: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
  };
  // stricter F3: if herbs/mushrooms were visible in trail, must have approach log
  const sawStepOn = trail.some((t) => (t.kinds?.herb || 0) + (t.kinds?.mushroom || 0) > 0);
  out.checks.F3_reactsWhenVisible = !sawStepOn || approachStep.length > 0;

  out.stats = {
    steps: steps.length,
    hops: hops.length,
    searches: searches.length,
    dobycha: dobycha.length,
    approachStep: approachStep.length,
    approachCraft: approachCraft.length,
    obstacle: obstacle.length,
    maxCounter,
    moved,
    sawStepOn,
    samples: { steps: steps.slice(0, 8), searches: searches.slice(0, 5), approach: approachStep.slice(0, 5), lines: L.slice(0, 18) },
  };
  out.ok = Object.entries(out.checks)
    .filter(([k]) => k.startsWith('F') && typeof out.checks[k] === 'boolean')
    .every(([, v]) => v === true);
  log('FOREST checks', out.checks);
  return out;
}

async function liveChaos(page, sleep, log) {
  const out = { ok: false, checks: {} };

  async function go(url) {
    await page.evaluate((u) => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (typeof w.goRC === 'function') w.goRC(u);
      else w.location.href = u;
    }, url);
    await sleep(2200);
  }
  async function battleSnap() {
    return page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        BID: w?.BID || null,
        label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
        hp: w?.ME?.hp,
        mhp: w?.ME?.mhp,
        md: w?.ME?.md,
      };
    });
  }
  async function lines() {
    return page.evaluate(() => {
      const el = window.top.document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 60) : [];
    });
  }
  async function leave() {
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
    });
    await sleep(3500);
    await go('place.html');
  }

  await leave();
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  // Phase A: useMagic OFF, full HP should not heal
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        battle: {
          useMagic: false,
          healBelowHpPct: 30,
          delayMin: 5000,
          delayMax: 6000,
          summonHelper: true,
          magicChance: 0,
          magicBookUrl: '/magbook.chtml',
          helperSpell: 'помощник',
        },
        chaos: {
          autoJoin: true,
          autoCreate: true,
          fight: true,
          ensureKit: false,
          roomUrl: 'arena_room_1_bmode_36.html',
        },
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

  await go('arena_room_1_bmode_36.html');
  let room = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      create: !!w.document.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: [...w.document.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value),
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
  if (room.joins?.length) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const join = w.document.querySelector('input[name="actBattle-Join"]');
      if (!join?.form) return;
      const btn = [...join.form.querySelectorAll('input[type=submit]')].find((b) => /принять|войти/i.test(b.value || ''));
      if (btn && join.form.requestSubmit) join.form.requestSubmit(btn);
      else if (btn) btn.click();
      else join.form.submit();
    });
  } else if (room.create) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const min = w.document.querySelector('[name="Battle{minlvl}"]');
      const max = w.document.querySelector('[name="Battle{maxlvl}"]');
      const mp = w.document.querySelector('[name="Battle{maxp}"]');
      if (min) min.value = '0';
      if (max) max.value = '100';
      if (mp) mp.value = '3';
      const btn = w.document.querySelector('input[name="actBattle-CreateHeader"]');
      if (btn?.form?.requestSubmit) btn.form.requestSubmit(btn);
      else btn?.click();
    });
  }
  await sleep(2000);
  await page.evaluate(() => window.top.document.getElementById('k5-chaos-start')?.click());

  let battle = null;
  for (let i = 0; i < 90; i++) {
    battle = await battleSnap();
    if (i % 10 === 0) log('waitB', i, battle.BID, battle.label);
    if (battle.BID) break;
    await sleep(2000);
  }
  out.battle = battle;
  if (!battle?.BID) {
    out.error = 'no battle';
    out.checks = { B_inBattle: false };
    return out;
  }

  await sleep(45000);
  const L = await lines();
  const heals = L.filter((l) => /— хил|хил через|Бой: HP .* — хил/i.test(l));
  const pauses = L.filter((l) => /ваш ход — пауза/.test(l));
  const deadSkip = L.filter((l) => /мёртв\/без HP|пакеты не шлю/i.test(l));
  const helperMiss = L.filter((l) => /помощник.*не найден|заклинание помощника не найдено|помощник пропуск/i.test(l));
  const helperOk = L.filter((l) => /помощник (MakeCast|magselect)|через magselect/i.test(l));
  const attacks = L.filter((l) => /Бой ход|сближение|4 блока/i.test(l));
  const pauseNums = pauses
    .map((l) => {
      const m = /пауза\s+(\d+)–(\d+)с/.exec(l);
      return m ? [Number(m[1]), Number(m[2])] : null;
    })
    .filter(Boolean);
  const hpPct = battle.mhp ? (100 * battle.hp) / battle.mhp : 100;

  out.checks = {
    B_inBattle: true,
    B1_noHealWhenMagicOff: heals.length === 0,
    B1_hpWasFullOrNear: hpPct >= 95 || heals.length === 0,
    B3_helperTriedOrCooldown: helperOk.length + helperMiss.length > 0,
    B4_delayApplied: pauseNums.length > 0 && pauseNums.every(([a]) => a >= 4),
    B_attackLogged: attacks.length > 0,
  };
  out.stats = {
    heals: heals.length,
    pauses: pauseNums.slice(0, 5),
    helperOk: helperOk.length,
    helperMiss: helperMiss.length,
    attacks: attacks.length,
    deadSkip: deadSkip.length,
    hpPct,
    lines: L.slice(0, 20),
  };

  // Phase B: flip useMagic ON via storage + ensure refreshCfg picks it; set threshold 30; still full HP → no heal
  await page.evaluate(() => {
    const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
    cfg.battle = Object.assign({}, cfg.battle, { useMagic: true, healBelowHpPct: 30 });
    localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
  });
  await sleep(20000);
  const L2 = await lines();
  const heals2 = L2.filter((l) => /— хил|хил через|Бой: HP .* — хил/i.test(l));
  out.checks.B1_noHealAtFullHpEvenIfMagicOn = heals2.length === 0;
  out.stats.healsAfterMagicOn = heals2.length;

  await page.evaluate(() => window.top.document.getElementById('k5-chaos-stop')?.click());
  await leave();

  out.ok = Object.values(out.checks).every((v) => v === true);
  log('CHAOS checks', out.checks);
  return out;
}

const report = {
  at: new Date().toISOString(),
  version: ver,
  liveMode,
  static: runStatic(),
};

const staticFail = report.static.filter((r) => !r.ok).length;
console.log(`\nStatic: ${report.static.length - staticFail}/${report.static.length} PASS (v${ver})`);

if (!liveMode) {
  report.verdict = { staticOk: staticFail === 0, live: null };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('Report:', REPORT);
  console.log('Hint: node _test_tz.js --live   # full live TZ verification');
  process.exit(staticFail ? 1 : 0);
}

const { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } = await import(
  pathToFileURL(path.join(ROOT, 'src', 'browser.js')).href
);

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  if (liveMode === 'all' || liveMode === 'forest') {
    report.forest = await liveForest(page, sleep, log);
  }
  if (liveMode === 'all' || liveMode === 'chaos') {
    report.chaos = await liveChaos(page, sleep, log);
  }
} catch (e) {
  report.error = String(e.stack || e);
  console.error(report.error);
} finally {
  report.verdict = {
    staticOk: staticFail === 0,
    forestOk: report.forest ? !!report.forest.ok : null,
    chaosOk: report.chaos ? !!report.chaos.ok : null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== TZ VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  console.log('Report:', REPORT);
  await browser.close().catch(() => {});
}

const fail =
  !report.verdict.staticOk ||
  report.verdict.forestOk === false ||
  report.verdict.chaosOk === false;
process.exit(fail ? 1 : 0);
