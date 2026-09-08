/**
 * Executable logic tests against REAL functions from 5kings-bot.user.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');

function extractFunction(name) {
  const needle = '\n  function ' + name + '(';
  let idx = src.indexOf(needle);
  if (idx < 0) {
    const n2 = '\n  async function ' + name + '(';
    idx = src.indexOf(n2);
    if (idx < 0) throw new Error('function not found: ' + name);
    idx += 1;
  } else idx += 1;
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

function extractConst(name) {
  const re = new RegExp('\\n  const ' + name + ' = ');
  const m = src.match(re);
  if (!m) throw new Error('const not found: ' + name);
  const idx = m.index + 1;
  const brace = src.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, p + 1) + ';';
    }
  }
  throw new Error('unterminated const: ' + name);
}

const prelude = `
function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}
const BOT = {
  cfg: {
    forest: {
      collectHerbs: true,
      collectMushrooms: true,
      collectCopper: true,
      collectIron: true,
      collectGold: false,
      startDir: 'face',
      holdCourse: true,
      mushroomCat1: true,
      mushroomCat2: true,
      mushroomCat3: true,
    },
    battle: { useMagic: true, healBelowHpPct: 30 },
  },
  state: { bannedAbs: new Set(), skipForestKeys: {} },
};
function refreshCfg() {}
${extractFunction('forestSkipUntil')}
${extractFunction('forestIsSkipped')}
${extractFunction('nfMushroomCategory')}
${extractFunction('mushroomCatAllowed')}
${extractConst('NF')}
${extractFunction('nfImgMeta')}
${extractFunction('nfTypeKind')}
${extractFunction('nfViewParams')}
${extractFunction('nfResolveXY')}
${extractFunction('listBigForestItems')}
${extractFunction('kindAtCell')}
${extractFunction('bigForestChebyshev')}
${extractFunction('nearestBigItem')}
${extractFunction('bigForestNaprDeltas')}
${extractFunction('cellAhead')}
${extractFunction('nfGetAbs')}
${extractFunction('facingNapr')}
${extractFunction('naprFromStartDir')}
${extractFunction('parseCssRgb')}
${extractFunction('radarKindFromBlob')}
${extractFunction('rememberFarItem')}
const WALKABLE_KINDS = { herb: 1, mushroom: 1, chest: 1 };
${extractFunction('isBlockedCell')}
${extractFunction('isWantedCraftAhead')}
${extractFunction('chooseDetour')}
${extractFunction('hopFreeEnd')}
${extractFunction('hopFreeLen')}
${extractFunction('bestEscapeNapr')}
${extractFunction('isWalkableForPath')}
${extractFunction('bfsFirstNapr')}
${extractFunction('bfsPath')}
${extractFunction('chooseDetourToward')}
${extractFunction('naprToward')}
${extractFunction('isHelperBlob')}
${extractFunction('isHealSpellBlob')}
${extractFunction('shouldBattleHeal')}
${extractFunction('battleHpInfo')}
globalThis.__T = {
  BOT, NF, nfViewParams, nfResolveXY, nfTypeKind, listBigForestItems, kindAtCell,
  nearestBigItem, isBlockedCell, isWantedCraftAhead, chooseDetour, naprToward,
  isWalkableForPath, bfsFirstNapr, bfsPath, chooseDetourToward,
  hopFreeEnd, hopFreeLen, bestEscapeNapr, nfMushroomCategory, mushroomCatAllowed,
  isHelperBlob, isHealSpellBlob, shouldBattleHeal, battleHpInfo, bigForestChebyshev, cellAhead,
  nfGetAbs, facingNapr, naprFromStartDir, parseCssRgb, radarKindFromBlob, rememberFarItem
};
`;

const failed = [];
let passed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('PASS', name);
  } else {
    failed.push(name);
    console.log('FAIL', name, extra != null ? extra : '');
  }
}

eval(prelude);
const T = globalThis.__T;

// GetAbs from game (viewmode 0 / 1 / 2)
function GetAbs(mx, my, x, y, viewmode) {
  if (!viewmode) {
    if (mx - x > 8 || mx - x < -8 || my - y > 8 || my - y < -8) return null;
    const res = (y - my) * 17 + (x - mx);
    const L = 144 + res;
    return L >= 0 && L <= 288 ? L : null;
  }
  if (viewmode === 1) {
    if (mx - x > 14 || mx - x < -14 || my - y > 8 || my - y < -8) return null;
    const res = (y - my) * 29 + (x - mx);
    const L = 246 + res;
    return L >= 0 && L <= 492 ? L : null;
  }
  if (viewmode === 2) {
    if (mx - x > 14 || mx - x < -14 || my - y > 14 || my - y < -8 && false) {
      /* fallthrough check below */
    }
    if (mx - x > 14 || mx - x < -14 || my - y > 14 || my - y < -14) return null;
    const res = (y - my) * 29 + (x - mx);
    const L = 420 + res;
    return L >= 0 && L <= 840 ? L : null;
  }
  return null;
}

function makeWin(opts) {
  const mx = opts.mx || 200;
  const my = opts.my || 200;
  const viewmode = opts.viewmode != null ? opts.viewmode : 1;
  const napr = opts.napr || 1;
  const poses = {};
  (opts.items || []).forEach(function (it) {
    const key = it.abs != null ? String(it.abs) : GetAbs(mx, my, it.x, it.y, viewmode);
    poses[String(key)] = { type: it.type, posx: it.posx, posy: it.posy, id: it.id || 1 };
    if (it.x != null && it.posx == null) {

      poses[String(key)].posx = it.x;
      poses[String(key)].posy = it.y;
    }
  });
  return {
    viewmode: viewmode,
    img_by_type: {
      77: { img: 'travy/bazilik', title: 'Базилик' },
      427: { img: 'griby/syroezgka', title: 'Сыроежка' },
      74: { img: 'skala_med', title: 'Жила меди' },
      70: { img: 'skala_zhelezn', title: 'Жила железа' },
      10: { img: 'skala', title: 'Скала' },
      170: { img: 'vl1', title: 'Вода' },
      237: { img: 'mv1', title: 'Водоём' },
    },
    global_data: {
      my_group: { posx: mx, posy: my, napr: napr, stay: 1, shiptp: opts.shiptp || 0 },
      abs_poses: poses,
      base_items: opts.base_items,
    },
  };
}

// --- nfResolveXY inverse of GetAbs ---
{
  const mx = 500;
  const my = 300;
  let all = 0;
  let hit = 0;
  for (let vm = 0; vm <= 2; vm++) {
    const limX = vm === 0 ? 8 : 14;
    const limY = vm === 0 ? 8 : vm === 1 ? 8 : 14;
    const win = { viewmode: vm, global_data: { my_group: { posx: mx, posy: my } } };
    for (let dx = -limX; dx <= limX; dx++) {
      for (let dy = -limY; dy <= limY; dy++) {
        const x = mx + dx;
        const y = my + dy;
        const L = GetAbs(mx, my, x, y, vm);
        if (L == null) continue;
        all++;
        const pos = T.nfResolveXY(win, String(L), { type: 77 });
        if (pos && pos.x === x && pos.y === y) hit++;
      }
    }
  }
  ok('L1 nfResolveXY inverse GetAbs', hit === all && all > 200, hit + '/' + all);
}

// --- posx/posy=0 is valid ---
{
  const win = { viewmode: 1, global_data: { my_group: { posx: 10, posy: 10 } } };
  const pos = T.nfResolveXY(win, '246', { posx: 0, posy: 0, type: 77 });
  ok('L2 pos 0,0 not treated as missing', pos && pos.x === 0 && pos.y === 0, pos);
}

// --- herbs / mushrooms listed from coords ---
{
  const win = makeWin({
    mx: 100,
    my: 100,
    napr: 1,
    items: [
      { type: 77, x: 102, y: 101 },
      { type: 427, x: 103, y: 100 },
      { type: 74, x: 101, y: 100 },
      { type: 10, x: 100, y: 101 },
    ],
  });
  const step = T.listBigForestItems(win, 'step');
  const craft = T.listBigForestItems(win, 'craft');
  const kinds = step.map((s) => s.kind).sort();
  ok('L3 herbs/mushrooms listed in step mode', kinds.join(',') === 'herb,mushroom', kinds);
  ok('L4 copper listed in craft mode', craft.length === 1 && craft[0].kind === 'copper', craft);
  ok('L5 herb type 77 → herb', T.nfTypeKind(77, win) === 'herb');
  ok('L6 mushroom 427 → mushroom', T.nfTypeKind(427, win) === 'mushroom');
}

// --- nearest herb by chebyshev (beyond close visual but in abs_poses) ---
{
  const win = makeWin({
    mx: 50,
    my: 50,
    viewmode: 2,
    items: [{ type: 77, x: 58, y: 55 }],
  });
  const me = { x: 50, y: 50 };
  const step = T.listBigForestItems(win, 'step');
  const n = T.nearestBigItem(me, step, null, 'herb');
  ok('L7 herb 8 steps away still found (viewmode 2)', n && n.d === 8 && n.kind === 'herb', n);
}

{
  ok('C6 cat1 427 сыроежка', T.nfMushroomCategory(427) === 1);
  ok('C6 cat2 433 шампиньон', T.nfMushroomCategory(433) === 2);
  ok('C6 cat3 448 мухомор', T.nfMushroomCategory(448) === 3);
  T.BOT.cfg.forest.mushroomCat2 = false;
  const win = makeWin({
    mx: 100,
    my: 100,
    items: [
      { type: 427, x: 101, y: 100 },
      { type: 433, x: 102, y: 100 },
    ],
  });
  const step = T.listBigForestItems(win, 'step');
  const types = step.map((s) => s.type);
  ok('C6 cat2 off skips 433', types.indexOf(433) < 0 && types.indexOf(427) >= 0, types);
  T.BOT.cfg.forest.mushroomCat2 = true;
}

{
  const win = makeWin({
    mx: 20,
    my: 20,
    napr: 1,
    items: [{ type: 10, x: 20, y: 21 }],
  });
  const me = { x: 20, y: 20 };
  ok('C3 hop into rock is 0', T.hopFreeLen(win, me, 1, 6) === 0);
  ok('C3 hop away from rock >0', T.hopFreeLen(win, me, 5, 6) >= 3);
  const esc = T.bestEscapeNapr(win, me, 1);
  ok('C2/C3 escape not into the rock', esc !== 1, esc);
}

// --- obstacles ---
{
  const win = makeWin({
    mx: 20,
    my: 20,
    napr: 1,
    items: [
      { type: 10, x: 20, y: 21 },
      { type: 74, x: 21, y: 20 },
      { type: 170, x: 19, y: 20 },
      { type: 77, x: 20, y: 19 },
    ],
  });
  ok('L8 rock is blocked', T.isBlockedCell(win, 20, 21) === true);
  ok('L9 sea/other is blocked', T.isBlockedCell(win, 19, 20) === true);
  ok('L10 copper is blocked (cannot walk onto)', T.isBlockedCell(win, 21, 20) === true);
  ok('L11 herb is walkable', T.isBlockedCell(win, 20, 19) === false);
  ok('L12 empty is walkable', T.isBlockedCell(win, 22, 22) === false);
  ok('L13 wanted copper ahead', T.isWantedCraftAhead('copper') === true);
  ok('L14 gold not wanted if collectGold=false', T.isWantedCraftAhead('gold') === false);
  ok('L9w water overlay kind', T.nfTypeKind(170, win) === 'water' && T.nfTypeKind(237, win) === 'water');
}

// --- open sea: base_items.type=2 without abs_poses overlay ---
{
  const mx = 20;
  const my = 20;
  const viewmode = 1;
  const seaAbs = GetAbs(mx, my, 21, 20, viewmode);
  const landAbs = GetAbs(mx, my, 19, 20, viewmode);
  const win = makeWin({
    mx: mx,
    my: my,
    napr: 7,
    viewmode: viewmode,
    base_items: (function () {
      const a = [];
      a[seaAbs] = { type: 2, posx: 21, posy: 20, id: 101 };
      a[landAbs] = { type: 1, posx: 19, posy: 20, id: 102 };
      return a;
    })(),
  });
  ok('L9c open sea type=2 is blocked', T.isBlockedCell(win, 21, 20) === true);
  ok('L9d land type=1 is walkable', T.isBlockedCell(win, 19, 20) === false);
  win.global_data.my_group.shiptp = 3;
  ok('L9e sea walkable with ship', T.isBlockedCell(win, 21, 20) === false);
}

// --- startDir: face / north / south ---
{
  const win = makeWin({ mx: 10, my: 10, napr: 7 });
  T.BOT.cfg.forest.startDir = 'face';
  ok('L24 startDir face = current facing', T.naprFromStartDir(win) === 7);
  T.BOT.cfg.forest.startDir = '5';
  ok('L25 startDir 5 = north', T.naprFromStartDir(win) === 5);
  T.BOT.cfg.forest.startDir = 'север';
  ok('L26 startDir север = 5', T.naprFromStartDir(win) === 5);
  T.BOT.cfg.forest.startDir = 'юг';
  ok('L27 startDir юг = 1', T.naprFromStartDir(win) === 1);
  T.BOT.cfg.forest.startDir = 'face';
}

// --- radar colors + far cache ---
{
  ok('L28 green dot is herb', T.radarKindFromBlob('', 'lime') === 'herb');
  ok('L29 brown dot is mushroom', T.radarKindFromBlob('', 'brown') === 'mushroom');
  ok('L30 title гриб', T.radarKindFromBlob('гриб подосиновик', '#fff') === 'mushroom');
  ok('L31 title трава', T.radarKindFromBlob('травы базилик', '') === 'herb');
  const w = makeWin({
    mx: 10,
    my: 10,
    items: [{ type: 77, x: 12, y: 10 }],
  });
  T.BOT.state.farItems = {};
  T.rememberFarItem(w, { type: 77, posx: 40, posy: 10 });
  ok('L32 far herb cached beyond view', T.BOT.state.farItems['40,10'] && T.BOT.state.farItems['40,10'].kind === 'herb');
}

// --- source contracts water / startDir ---
{
  ok('S9 water types listed', /water:\s*range\(170,\s*235\)/.test(src));
  ok('S10 startDir default face', /startDir:\s*'face'/.test(src));
  ok('S11 start forest resets wanderNapr', /BOT\.state\.wanderNapr = startN/.test(src));
  ok('S12 start forest button present', /id="k5-forest-start"/.test(src) && /Старт лес/.test(src));
  ok('S13 cancel frozen stay=0', /ход завис \(stay=0\)/.test(src) && /GotoKletka=0/.test(src));
  ok('S14 radar step items', /function listRadarItems/.test(src) && /function listAllStepItems/.test(src));
  ok('S15 mushroom basket', /BASKET_NEED_RE/.test(src) && /корзина грибника/.test(src));
  ok('S16 radar calibration optional', /radarCalibrated/.test(src) && /fromRadar: true/.test(src));
  ok('S17 walkToward radar fallback course', /без полного пути — курс/.test(src) && !/if \(dest\.fromRadar\) return false/.test(src));
  ok('S18 sticky step target after pickup', /function pickStickyStepItem/.test(src) && /function forgetStepCell/.test(src));
  ok('S19 radar merged into walking list', /listRadarItems/.test(src) && /listAllStepItems/.test(src));
}

// --- chooseDetour skips blocked ---
{
  const win = makeWin({
    mx: 10,
    my: 10,
    napr: 1,
    items: [{ type: 10, x: 10, y: 11 }],
  });
  const me = { x: 10, y: 10 };
  const d = T.chooseDetour(win, me, 1);
  const ahead = T.cellAhead(win, me, d);
  ok('L15 detour not toward the rock', !(ahead.x === 10 && ahead.y === 11) && d >= 1 && d <= 8, { d, ahead });
  ok('L15g detour is not 180 when a side is free', d !== 5, { d, ahead });
}

// --- BFS around rocks toward mushroom; stand beside ore ---
{
  const win = makeWin({
    mx: 20,
    my: 20,
    napr: 7,
    items: [
      { type: 10, x: 21, y: 20 },
      { type: 427, x: 22, y: 20 },
      { type: 74, x: 20, y: 21 },
    ],
  });
  const me = { x: 20, y: 20 };
  const toMush = T.bfsFirstNapr(win, me, 22, 20, null);
  const mushAhead = toMush ? T.cellAhead(win, me, toMush) : null;
  ok('L15b BFS does not step onto rock toward mushroom', toMush != null && toMush !== 0 && !(mushAhead && mushAhead.x === 21 && mushAhead.y === 20), { toMush, mushAhead });
  ok('L15c mushroom cell itself walkable', T.isWalkableForPath(win, 22, 20, { x: 22, y: 20 }) === true);
  const beside = T.bfsFirstNapr(win, me, 20, 21, { standBeside: true });
  ok('L15d already adjacent to ore → 0', beside === 0, beside);
  const farWin = makeWin({
    mx: 10,
    my: 10,
    napr: 7,
    items: [{ type: 74, x: 14, y: 10 }],
  });
  const farMe = { x: 10, y: 10 };
  const toVein = T.bfsFirstNapr(farWin, farMe, 14, 10, { standBeside: true });
  ok('L15e path to stand beside ore exists', toVein != null && toVein !== 0, toVein);
  const pathM = T.bfsPath(win, me, 22, 20, null);
  ok('L15f bfsPath goes around rock to mushroom', pathM && pathM.length >= 2 && !(pathM[0].x === 21 && pathM[0].y === 20), pathM);
}

// --- magbook spell matching ---
{
  const spellRe = /помощник|вызвать\s*помощ/i;
  ok('L16 helper spell name', T.isHelperBlob('Вызвать помощника', spellRe));
  ok('L17 heal spell name', T.isHealSpellBlob('Восстановление здоровья'));
  ok('L18 helper is not heal', T.isHealSpellBlob('Вызвать помощника') === false);
  ok('L19 heal is not helper', T.isHelperBlob('Восстановление здоровья', spellRe) === false);
}

// --- shouldBattleHeal ---
{
  const win = {
    document: { getElementById: function () { return null; } },
  };
  ok('L20 no heal at full HP', T.shouldBattleHeal(win, { hp: 100, mhp: 100 }) === false);
  ok('L21 heal at 20% HP', T.shouldBattleHeal(win, { hp: 20, mhp: 100 }) === true);
  ok('L22 no heal at 50% if threshold 30', T.shouldBattleHeal(win, { hp: 50, mhp: 100 }) === false);
  T.BOT.cfg.battle.useMagic = false;
  ok('L23 no heal if useMagic off even at 10%', T.shouldBattleHeal(win, { hp: 10, mhp: 100 }) === false);
  T.BOT.cfg.battle.useMagic = true;
}

// --- source contracts for the bugs we just fixed ---
{
  ok('S1 waitForestIdle exists', /function waitForestIdle\(/.test(src));
  ok('S2 isWantedCraftAhead exists', /function isWantedCraftAhead\(/.test(src));
  ok('S3 copper ahead does not detour', /стоп, жду поиск/.test(src));
  ok('S4 stay=0 not counted as stuck', /ещё идём — не считаем застреванием/.test(src));
  ok('S5 no battle move by default', /moveInBattle:\s*false/.test(src));
  ok('S6 heal via magbook', /async function trySummonHealSpell\(/.test(src));
  ok('S7 equippedToolKind skip', /equippedToolKind === wantKind/.test(src));
  ok('S8 4 blocks when no melee', /inRange\.length === 0/.test(src) && /defense: true/.test(src));
}

console.log('\nLogic: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
