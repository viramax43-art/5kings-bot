// ==UserScript==
// @name         5Kings Bot
// @namespace    https://5kings.ru/
// @version      1.2.39
// @description  Лес + королевские хаосы 5kings.ru. Только ТЗ. Локальный userscript.
// @author       freelance
// @match        http://5kings.ru/*
// @match        https://5kings.ru/*
// @match        http://*.5kings.ru/*
// @match        https://*.5kings.ru/*
// @match        *://5kings.ru/*
// @match        *://*.5kings.ru/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

// Если после Ctrl+S нет зелёной полосы на https://5kings.ru/game.html —
// Chrome блокирует TM: chrome://extensions → Tampermonkey → «Подробнее»
// → включить «Разрешить пользовательские скрипты» → F5 на игре.

(function () {
  'use strict';

  // МАЯК: если его нет на странице — Tampermonkey вообще не выполнил файл
  function showBeacon(msg, isErr) {
    try {
      var root = window;
      try {
        if (window.top && window.top.document) root = window.top;
      } catch (e1) {}
      var doc = root.document;
      if (!doc) return;
      var put = function () {
        var el = doc.getElementById('k5-beacon');
        if (!el) {
          el = doc.createElement('div');
          el.id = 'k5-beacon';
          el.setAttribute(
            'style',
            'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:10px 12px;' +
              'font:bold 14px/1.3 Tahoma,Arial,sans-serif;text-align:center;cursor:pointer;' +
              'box-shadow:0 2px 8px rgba(0,0,0,.4)'
          );
          el.onclick = function () {
            try {
              el.remove();
            } catch (e) {}
          };
          (doc.body || doc.documentElement).appendChild(el);
        }
        el.style.background = isErr ? '#8b0000' : '#1a5c1a';
        el.style.color = '#fff';
        el.textContent = msg + '  (клик = скрыть)';
      };
      if (doc.body) put();
      else {
        doc.addEventListener('DOMContentLoaded', put);
        var n = 0;
        var iv = setInterval(function () {
          n++;
          if (doc.body) {
            put();
            clearInterval(iv);
          } else if (n > 40) clearInterval(iv);
        }, 250);
      }
    } catch (e) {
      try {
        console.error('[5k-bot] beacon', e);
      } catch (e2) {}
    }
  }

  const VERSION = '1.2.39';

  try {
    console.log('%c[5k-bot] executed v' + VERSION + ' @ ' + location.href, 'background:#1a5c1a;color:#fff;padding:4px');
    showBeacon('5Kings Bot v' + VERSION + ': скрипт запущен…');
  } catch (e0) {}

  // page-контекст (cu/gd). При CSP Chrome/TM падает в content-world → unsafeWindow
  const PAGE =
    typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.document
      ? unsafeWindow
      : window;

  // В чате/списке игроков не грузим тяжёлую логику (но маяк уже показан на top)
  try {
    var href0 = String(location.href || '');
    var isTop0 = false;
    try {
      isTop0 = window === window.top;
    } catch (e) {
      isTop0 = true;
    }
    if (
      !isTop0 &&
      /chat\.html|chatuser|chatact|pers\.html|interface\/chat/i.test(href0) &&
      !(PAGE.cu && PAGE.gd)
    ) {
      return;
    }
  } catch (e) {}

  function storage() {
    try {
      return (PAGE && PAGE.localStorage) || localStorage;
    } catch (e) {
      return localStorage;
    }
  }
  function GM_getValue(k, def) {
    try {
      const v = storage().getItem('K5BOT_' + k);
      if (v == null) return def;
      return JSON.parse(v);
    } catch (e) {
      return def;
    }
  }
  function GM_setValue(k, v) {
    try {
      storage().setItem('K5BOT_' + k, JSON.stringify(v));
    } catch (e) {}
  }
  function GM_addStyle(css) {
    try {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  const CFG_KEY = 'cfg_v4';
  const FLAG = {
    forest: 'run_forest',
    chaos: 'run_chaos',
    captcha: 'captcha_pause',
  };

  // Панель всегда в top — иначе во фрейме d_act её не видно / клипы
  function getTopWin() {
    try {
      return PAGE.top || PAGE;
    } catch (e) {
      return PAGE;
    }
  }
  function getTopDoc() {
    try {
      return getTopWin().document;
    } catch (e) {
      return document;
    }
  }
  function isTopScript() {
    try {
      return window === window.top;
    } catch (e) {
      return true;
    }
  }
  function claimController() {
    try {
      const topW = getTopWin();
      if (!window.__k5_bot_id) window.__k5_bot_id = 'k5_' + Math.random().toString(36).slice(2);
      // Top с d_act — лучший контроллер; иначе кадр с cu
      const prefer =
        (isTopScript() && !!document.getElementById('d_act')) ||
        !!(PAGE.cu && PAGE.gd) ||
        isTopScript();
      if (!topW.__k5_bot_runner) {
        if (prefer) topW.__k5_bot_runner = window.__k5_bot_id;
      } else if (prefer && isTopScript() && document.getElementById('d_act')) {
        // top перехватывает управление у iframe
        topW.__k5_bot_runner = window.__k5_bot_id;
      }
      return topW.__k5_bot_runner === window.__k5_bot_id;
    } catch (e) {
      return isTopScript();
    }
  }

  function isController() {
    try {
      return getTopWin().__k5_bot_runner === window.__k5_bot_id;
    } catch (e) {
      return true;
    }
  }

  /* ---------- clock polyfill (game frames call fsetTime) ---------- */
  (function installGameClockPolyfill() {
    const src = function () {
      if (window.__k5_clock_polyfill) return;
      window.__k5_clock_polyfill = 1;
      if (typeof window.hour === 'undefined') window.hour = 0;
      if (typeof window.minute === 'undefined') window.minute = 0;
      if (typeof window.secund === 'undefined') window.secund = 0;
      if (typeof window.time_interval === 'undefined') window.time_interval = 0;
      if (typeof window.CorrectTime !== 'function') {
        window.CorrectTime = function () {
          window.secund += 1;
          if (window.secund > 59) {
            window.minute += 1;
            window.secund -= 60;
          }
          if (window.minute > 59) {
            window.hour += 1;
            window.minute -= 60;
          }
          if (window.hour > 23) window.hour -= 24;
          var res = '';
          if (window.hour < 10) res += '0';
          res += window.hour + ':';
          if (window.minute < 10) res += '0';
          res += window.minute + ':';
          if (window.secund < 10) res += '0';
          res += window.secund;
          try {
            var el = document.getElementById('time');
            if (el) el.innerHTML = res;
            if (window.jQuery) window.jQuery('#time').html(res);
          } catch (e) {}
        };
      }
      if (typeof window.fsetTime !== 'function') {
        window.fsetTime = function (s_hour, s_minute, s_secund) {
          var res = '';
          if (s_hour < 10) res += '0';
          res += s_hour + ':';
          if (s_minute < 10) res += '0';
          res += s_minute + ':';
          if (s_secund < 10) res += '0';
          res += s_secund;
          try {
            var el = document.getElementById('time');
            if (el) el.innerHTML = res;
            if (window.jQuery) window.jQuery('#time').html(res);
          } catch (e) {}
          window.hour = s_hour;
          window.minute = s_minute;
          window.secund = s_secund;
          try {
            clearInterval(window.time_interval);
          } catch (e) {}
          window.time_interval = setInterval(function () {
            if (typeof window.CorrectTime === 'function') window.CorrectTime();
          }, 1000);
        };
      }
    };
    function injectInto(win) {
      if (!win || !win.document) return;
      try {
        win.eval('(' + src.toString() + ')()');
      } catch (e1) {
        try {
          const s = win.document.createElement('script');
          s.textContent = '(' + src.toString() + ')();';
          (win.document.documentElement || win.document.head || win.document.body).appendChild(s);
          s.remove();
        } catch (e2) {}
      }
    }
    injectInto(PAGE);
    try {
      injectInto(PAGE.top);
    } catch (e) {}
    setTimeout(function () {
      try {
        injectInto(PAGE.top || PAGE);
      } catch (e) {}
    }, 400);
  })();

  /* ---------- utils ---------- */
  function range(a, b) {
    const r = [];
    for (let i = a; i <= b; i++) r.push(i);
    return r;
  }
  function rand(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function humanDelay(min, max) {
    // сумма двух random → ближе к «человеческому» распределению
    const a = rand(min, max);
    const b = rand(min, max);
    return Math.floor((a + b) / 2);
  }
  function deepMerge(a, b) {
    const o = Object.assign({}, a);
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) o[k] = deepMerge(a[k] || {}, b[k]);
      else o[k] = b[k];
    });
    return o;
  }
  function flagGet(k) {
    try {
      return !!GM_getValue(k, false);
    } catch (e) {
      return false;
    }
  }
  function flagSet(k, v) {
    try {
      GM_setValue(k, !!v);
    } catch (e) {}
  }

  const NX = [0, 0, 1, 1, 1, 0, -1, -1, -1];
  const NY = [0, -1, -1, 0, 1, 1, 1, 0, -1];
  const ZONES = [0, 1, 2, 3, 4];
  const ZONE_WEIGHTS = [3, 5, 2, 2, 2]; // head, body, rhand, lhand, foot

  const RES = {
    trees: [1, 2, 3, 4, 5, 6],
    copper: [7, 8, 9, 10],
    iron: [11, 12, 13, 14],
    gold: [15, 16, 17, 18],
    herbs: range(19, 39),
    mushrooms: [],
  };

  // Типы большого леса (newforest2 img_by_type) — не путать с городским forest.html
  const NF = {
    herbs: range(77, 97),
    mushrooms: range(427, 449),
    // категории грибника (lib id=65): 1 статы, 2 +обереги, 3 −обереги
    mushroomCat1: range(427, 432),
    mushroomCat2: range(433, 440),
    mushroomCat3: range(441, 448),
    // vl* большая вода, mv* мелкие водоёмы — без лодки не ходим
    water: range(170, 235).concat(range(237, 286)),
    copper: [74, 75, 104, 105, 106],
    iron: [70, 71, 72, 73, 107, 108, 109, 110, 111, 112, 113],
    gold: [],
    // добываемые деревья (не декоративные blockers) — доп. по meta sosn/dub/…
    trees: [],
    rocks: [10, 11, 101, 102, 103].concat(range(114, 130)),
    chests: [76],
    // декоративные деревья/кусты — не step-on ресурс, при упирании меняем курс
    blockers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 26, 27, 28, 29, 30].concat(
      [101, 102, 103],
      range(114, 130)
    ),
  };

  const CRAFT_TYPES = new Set([].concat(RES.trees, RES.copper, RES.iron, RES.gold));
  const KH_ITEM_TYPES = [
    { itype: 1, name: 'Шлем' },
    { itype: 2, name: 'Амулет' },
    { itype: 3, name: 'Латы' },
    { itype: 4, name: 'Перчатки' },
    { itype: 5, name: 'Пояс' },
    { itype: 6, name: 'Щит' },
    { itype: 7, name: 'Оружие' },
    { itype: 9, name: 'Поножи' },
    { itype: 10, name: 'Кольцо' },
    { itype: 25, name: 'Наручи' },
  ];
  const WORKSHOP_URL = 'arena_room_1_bmode_36_smode_1.html';
  const APPS_URL = 'arena_room_1_bmode_36_lvl_-1_smode_0_itype_0.html';
  const ROOM_URL = 'arena_room_1_bmode_36.html';

  // не ловить «Кирка рудокопа» / «Топор лесоруба» — это инструмент, не профессия
  const PROFESSION_HINTS = [
    /нужна?\s+професси/i,
    /професси[яи].{0,24}(рудокоп|дровосек|лесоруб|травник)/i,
    /только\s+(рудокоп|дровосек|лесоруб|травник)/i,
    /нечего добывать/i,
    /не можете добывать/i,
  ];
  const TOOL_NEED_RE =
    /необходим|инструмент|наденьте|экипир|нужна\s*кирк|нужен\s*топор|корзин\w*\s*грибник|для сбора грибов|должны иметь в руках|иметь в руках|кирк[уиа]\s*рудокоп|топор\s*лесоруб/i;
  const BASKET_NEED_RE = /корзин\w*\s*грибник|для сбора грибов/i;

  function defaultCfg() {
    return {
      forest: {
        delayMin: 500,
        delayMax: 1200,
        collectTrees: true,
        collectCopper: false,
        collectIron: false,
        collectGold: false,
        collectHerbs: true,
        collectMushrooms: true,
        mushroomCat1: true,
        mushroomCat2: true,
        mushroomCat3: true,
        autoSearch: true,
        searchEverySteps: 5,
        searchWaitMs: 32000,
        searchRadius: 5,
        equipTool: true,
        autoHeal: true,
        injuryWaitMs: 300000,
        healMode: 'auto',
        healAbilityId: '',
        startDir: 'face',
        holdCourse: true,
        useRadar: true,
        radarMaxDist: 28,
      },
      chaos: {
        roomUrl: ROOM_URL,
        minlvl: 0,
        maxlvl: 50,
        maxp: 6,
        autoJoin: true,
        autoCreate: true,
        pollMs: 4000,
        reloadEmptyMs: 15000,
        fight: true,
        ensureKit: true,
      },
      battle: {
        delayMin: 700,
        delayMax: 2200,
        healBelowHpPct: 30,
        useMagic: true,
        magicChance: 0.22,
        suboptimalChance: 0.12,
        pauseBetweenFightsMinMs: 8000,
        pauseBetweenFightsMaxMs: 25000,
        sessionMaxMin: 0, // 0 = случайно 20–120; иначе 20–120 мин
        sessionMinMin: 20,
        sessionMaxCap: 120,
        // перемещение в бою выключено по умолчанию (палевно/смертельно); при отсутствии врага рядом — 4 блока
        moveInBattle: false,
        // тактика: defense=4 блока, standard=2 блока+1 удар, aggressive=2 удара
        tactic: 'standard',
        // хаосы: книга из боя (ссылка с иконки), не мирный magbook и не свитки mbag
        summonHelper: true,
        helperSpell: 'помощник|вызвать\\s*помощ|клон|создать\\s*клон|clone',
        helperFormId: '',
        // лечение — заклинание из книги магии, не свиток из сумки
        healSpell: 'восстанови|восстановить\\s*здоровье|здоровье|лечен|исцел|heal|cure|restore',
        magicBookUrl: '/magbook.chtml',
      },
      captcha: {
        detect: true,
        beep: true,
        // точка расширения под RuCaptcha / другой решатель:
        // solverHook = async (imgDataUrl) => 'код'
        autoSolve: false,
      },
      license: {
        enabled: false,
        // пусто = привязка к первому UserID при старте; можно добавить второго вручную
        allowedUserIds: [],
      },
      ui: { collapsed: false },
    };
  }

  const BOT = {
    version: VERSION,
    cfg: null,
    state: {
      craftBusy: false,
      meId: null,
      me: null,
      injury: false,
      injurySince: 0,
      searchHint: null,
      bannedAbs: new Set(),
      bannedTypes: new Set(),
      lastStatus: '',
      captchaPaused: false,
      kitReady: false,
      kitChecked: false,
      emptyAppsSince: 0,
      fightSessionStart: 0,
      fightSessionLimit: 0,
      sessionExpirePending: false,
      lastFightEnd: 0,
      forestTimers: {},
      learnedMeId: null,
      expectMoveAt: 0,
      lastForestHref: '',
      stepsSinceSearch: 0,
      bigForestHint: null,
      bigForestApproach: null,
      lastDobychaKey: '',
      dobychaFails: 0,
      turnReadySince: 0,
      lastBattleRound: null,
      localNapr: 0,
      stuckCount: 0,
      lastWalkPos: '',
      wanderNapr: 0,
      craftVisitQueue: [],
      scannedVeins: {},
      veinScanKind: '',
      equippedToolKind: null,
      viewWidened: false,
      helperFailUntil: 0,
      helperBusy: false,
      helperDisabled: false,
      helperFormId: '',
      helperMissCount: 0,
      bannedSummonHex: {},
      healFailUntil: 0,
      healFormId: '',
      healSpellMissUntil: 0,
      lastCfgRefresh: 0,
      lastChaosNavAt: 0,
      lastJoinAt: 0,
      gotoTarget: null,
    },
  };

  function refreshCfg() {
    // Панель живёт в top, а лес/бой часто в d_act — без этого галки «хил» не доходят до боевого цикла
    try {
      if (Date.now() - (BOT.state.lastCfgRefresh || 0) < 800) return;
      BOT.state.lastCfgRefresh = Date.now();
      BOT.cfg = loadCfg();
    } catch (e) {}
  }

  function loadCfg() {
    try {
      let raw = GM_getValue(CFG_KEY, null);
      if (!raw) return defaultCfg();
      // совместимость: раньше saveCfg клал JSON.stringify внутрь GM_setValue (двойное кодирование)
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw);
        } catch (e1) {}
      }
      if (!raw || typeof raw !== 'object') return defaultCfg();
      const cfg = deepMerge(defaultCfg(), raw);
      // старый паттерн с \w не матчил кириллицу «Восстановить»
      try {
        if (cfg.battle && /\\w/.test(String(cfg.battle.healSpell || ''))) {
          cfg.battle.healSpell = defaultCfg().battle.healSpell;
        }
      } catch (eHs) {}
      return cfg;
    } catch (e) {
      return defaultCfg();
    }
  }
  function saveCfg() {
    try {
      GM_setValue(CFG_KEY, BOT.cfg);
    } catch (e) {}
  }
  BOT.cfg = loadCfg();

  function log(msg, level) {
    BOT.state.lastStatus = String(msg);
    const doc = getTopDoc();
    const el = doc.getElementById('k5-log');
    if (el) {
      const line = doc.createElement('div');
      line.className = 'k5-log-' + (level || 'info');
      line.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
      el.prepend(line);
      while (el.childNodes.length > 120) el.removeChild(el.lastChild);
    }
    try {
      console.log('[5k-bot]', msg);
    } catch (e) {}
    const st = doc.getElementById('k5-status');
    if (st) st.textContent = msg;
    const badge = doc.getElementById('k5-cap-badge');
    if (badge) badge.style.display = BOT.state.captchaPaused || flagGet(FLAG.captcha) ? 'inline-block' : 'none';
  }

  function getUserId() {
    try {
      const m = String(PAGE.document.cookie || document.cookie || '').match(/(?:^|; )UserID=([^;]*)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function checkLicense() {
    if (!BOT.cfg.license.enabled) return true;
    const uid = getUserId();
    if (!uid) return true;
    let allowed = BOT.cfg.license.allowedUserIds || [];
    if (!allowed.length) {
      allowed = [String(uid)];
      BOT.cfg.license.allowedUserIds = allowed;
      saveCfg();
      log('Лицензия: привязка к UserID ' + uid, 'ok');
      return true;
    }
    if (allowed.map(String).indexOf(String(uid)) >= 0) return true;
    log('Лицензия: UserID ' + uid + ' не в списке. Добавьте в настройках.', 'err');
    return false;
  }

  function isBigForestWin(win) {
    if (!win) return false;
    try {
      const href = String((win.location && win.location.href) || '');
      if (/newforest/i.test(href)) return true;
      // Клиент большого леса (иногда URL тоже forest.html при активной сессии)
      if (
        typeof win.StartDobycha === 'function' &&
        typeof win.StartSearch === 'function' &&
        win.Client &&
        typeof win.Client.send === 'function'
      )
        return true;
    } catch (e) {}
    return false;
  }

  function getActWin() {
    // 1) текущий фрейм уже лес/бой
    if (isBigForestWin(PAGE)) return PAGE;
    if (PAGE.cu && PAGE.gd) return PAGE;
    if (typeof PAGE.MakeTurn === 'function' && PAGE.BID) return PAGE;

    const topW = getTopWin();

    // 2) любой фрейм с большим лесом / cu/gd / боем (важнее «пустого» d_act)
    try {
      const frames = topW.frames || [];
      for (let i = 0; i < frames.length; i++) {
        try {
          const f = frames[i];
          if (!f) continue;
          if (isBigForestWin(f)) return f;
          if (f.cu && f.gd) return f;
          if (typeof f.MakeTurn === 'function' && f.BID) return f;
        } catch (e) {}
      }
    } catch (e) {}

    // 3) iframe#d_act — главный игровой кадр
    try {
      const el = topW.document && topW.document.getElementById('d_act');
      if (el && el.contentWindow) return el.contentWindow;
    } catch (e) {}
    try {
      if (topW.frames && topW.frames.d_act) return topW.frames.d_act;
    } catch (e) {}

    // 4) standalone forest/battle page (редко)
    if (/newforest|forest\.html|bmode_36|arena_room|battle/i.test(PAGE.location && PAGE.location.href))
      return PAGE;
    return null;
  }

  function readCookie(name, win) {
    try {
      const src = (win && win.document && win.document.cookie) || document.cookie || '';
      const m = String(src).match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function isCityForest(win) {
    win = win || getActWin();
    if (isBigForestWin(win)) return false;
    try {
      const href = forestHref(win);
      if (/newforest/i.test(href)) return false;
      const doc = win && win.document;
      if (!doc) return false;
      // Городской лес: кнопка «На улицу» → place_street_*.html
      const nodes = doc.querySelectorAll('input[type=button],button,a,[onclick]');
      for (let i = 0; i < nodes.length; i++) {
        const t =
          (nodes[i].value || '') +
          ' ' +
          (nodes[i].textContent || '') +
          ' ' +
          (nodes[i].getAttribute('onclick') || '');
        if (/place_street_/i.test(t) || /на улицу/i.test(t)) return true;
      }
    } catch (e) {}
    return false;
  }

  function forestHref(win) {
    try {
      return String((win && win.location && win.location.href) || '');
    } catch (e) {
      return '';
    }
  }

  function isGameShell() {
    try {
      const topW = getTopWin();
      return !!(topW.document && topW.document.getElementById('d_act'));
    } catch (e) {
      return false;
    }
  }

  function go(win, url) {
    // НИКОГДА не навигируем top/shell — иначе ломается game.html
    let target = win;
    if (!target || target === getTopWin()) {
      target = getActWin();
    }
    if (!target) {
      log('Нет кадра d_act — откройте игру (game.html), затем повторите', 'err');
      return false;
    }
    try {
      if (target.top === target && isGameShell()) {
        // target оказался top при наличии d_act — переключиться
        const act = getActWin();
        if (act && act !== target) target = act;
        else if (target === getTopWin()) {
          log('Отказ: навигация top запрещена', 'err');
          return false;
        }
      }
    } catch (e) {}

    try {
      if (typeof target.goRC === 'function') target.goRC(url);
      else if (typeof target.goR === 'function') target.goR(url);
      else target.location.href = url;
      return true;
    } catch (e) {
      try {
        target.location.href = url;
        return true;
      } catch (e2) {
        log('go fail: ' + (e2.message || e2), 'err');
        return false;
      }
    }
  }

  function isBigForestUi(win) {
    win = win || getActWin();
    if (!win || !win.document) return false;
    try {
      const doc = win.document;
      if (doc.getElementById('vorota')) return true;
      if (doc.querySelector('input[name="actNewMaps-ChangeView"]')) return true;
      if (doc.getElementById('canvas') && typeof win.StartDobycha === 'function') return true;
    } catch (e) {}
    return isBigForestWin(win);
  }

  function goDact(url) {
    const topW = getTopWin();
    let origin = 'https://5kings.ru';
    try {
      origin = String(topW.location.origin || origin);
    } catch (e) {}
    const path = String(url || '').replace(/^\//, '');
    const abs = /^https?:/i.test(path) ? path : origin + '/' + path;
    const full = abs + (abs.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    try {
      const el = topW.document && topW.document.getElementById('d_act');
      if (el) {
        el.src = full;
        return true;
      }
    } catch (e1) {}
    try {
      const act = getActWin();
      if (act && act.location) {
        act.location.href = full;
        return true;
      }
    } catch (e2) {}
    return go(getActWin(), url);
  }

  function nfWaitEvent(win) {
    try {
      return Number((win && win.global_data && win.global_data.wait_event) || 0);
    } catch (e) {
      return 0;
    }
  }

  function nfGroupStay(win) {
    try {
      const g = win && win.global_data && win.global_data.my_group;
      return g ? Number(g.stay) : 1;
    } catch (e) {
      return 1;
    }
  }

  async function nfWaitUntilStanding(maxMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < (maxMs || 12000)) {
      const win = getActWin();
      if (!isBigForestUi(win) || nfGroupStay(win) !== 0) return;
      await sleep(400);
    }
  }

  async function leaveBigForestForTown(win) {
    win = win || getActWin();
    if (!isBigForestUi(win)) return true;
    const href0 = forestHref(win).split('/').pop();
    log('Хаос: большой лес поверх ' + href0 + ' — выхожу к воротам');
    await nfWaitUntilStanding(12000);
    win = getActWin();
    let we = nfWaitEvent(win);
    if (we === 2 || we === 3 || we === 4) {
      log('Хаос: отмена события wait=' + we);
      try {
        if (win.Client && typeof win.Client.send === 'function') {
          win.Client.send('actNewMaps-CancelEvent=' + (we === 2 ? '2' : '3'));
        }
      } catch (e) {}
      const tCancel = Date.now();
      while (Date.now() - tCancel < 10000) {
        await sleep(400);
        we = nfWaitEvent(getActWin());
        if (!we || we === 1) break;
      }
    }
    win = getActWin();
    we = nfWaitEvent(win);
    let realConfirm = null;
    try {
      realConfirm = win.confirm;
      win.confirm = function () {
        return true;
      };
      if (we !== 1) {
        await nfWaitUntilStanding(8000);
        win = getActWin();
        if (win.Client && typeof win.Client.send === 'function') {
          win.Client.send('actNewMaps-ReturnToTown=1');
        } else if (typeof win.TryReturnToTown === 'function') {
          win.TryReturnToTown();
        }
      } else {
        log('Хаос: уже идём к воротам');
      }
    } catch (e) {
      log('Хаос: выход: ' + (e.message || e), 'err');
    }
    try {
      win.confirm = realConfirm;
    } catch (e2) {}

    const t0 = Date.now();
    let resent = false;
    while (Date.now() - t0 < 90000) {
      await sleep(800);
      win = getActWin();
      if (!isBigForestUi(win)) {
        log('Хаос: вышли @ ' + forestHref(win).split('/').pop(), 'ok');
        return true;
      }
      we = nfWaitEvent(win);
      if (!resent && Date.now() - t0 > 10000 && we !== 1) {
        resent = true;
        log('Хаос: повтор ReturnToTown');
        try {
          win.confirm = function () {
            return true;
          };
          if (win.Client && typeof win.Client.send === 'function') {
            win.Client.send('actNewMaps-ReturnToTown=1');
          }
        } catch (e3) {}
      }
    }
    log('Хаос: лес не отпустил за 90с wait=' + nfWaitEvent(getActWin()), 'err');
    return !isBigForestUi(getActWin());
  }

  async function ensureChaosAppsPage() {
    let win = getActWin();
    if (isBigForestUi(win)) {
      const left = await leaveBigForestForTown(win);
      if (!left) return getActWin();
      await sleep(1000);
      win = getActWin();
    }
    if (isBigForestUi(getActWin())) return getActWin();
    let snap = getAppsSnapshot(getActWin());
    if (/bmode_36/i.test(forestHref(getActWin())) && (snap.canCreate || snap.inApp || snap.joins.length)) {
      return getActWin();
    }
    log('Хаос: открываю список заявок');
    goDact(APPS_URL);
    for (let i = 0; i < 16; i++) {
      await sleep(500);
      win = getActWin();
      if (isBigForestUi(win)) {
        log('Хаос: сервер вернул лес — сначала выход', 'err');
        await leaveBigForestForTown(win);
        return getActWin();
      }
      snap = getAppsSnapshot(win);
      if (snap.canCreate || snap.inApp || snap.joins.length) return win;
    }
    if (!isBigForestUi(getActWin()) && !getAppsSnapshot(getActWin()).canCreate) {
      log('Хаос: заявок нет на экране — через город');
      goDact('place.html');
      await sleep(1500);
      if (!isBigForestUi(getActWin())) {
        goDact(APPS_URL);
        await sleep(2000);
      }
    }
    return getActWin();
  }

  /* ---------- captcha ---------- */
  function elVisible(el) {
    if (!el) return false;
    try {
      const st = (el.ownerDocument && el.ownerDocument.defaultView
        ? el.ownerDocument.defaultView
        : window
      ).getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    } catch (e) {
      return !!(el.offsetWidth || el.offsetHeight);
    }
  }

  /** Текст страницы без панели бота (иначе лог «капч…» сам себя триггерит). */
  function pageTextSansBot(doc) {
    try {
      const clone = (doc.body && doc.body.cloneNode(true)) || null;
      if (!clone) return '';
      const kill = clone.querySelectorAll('#k5-panel,#k5-beacon,#k5-log,#k5-smoke,[id^="k5-"]');
      for (let i = 0; i < kill.length; i++) {
        if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
      }
      return clone.innerText || '';
    } catch (e) {
      return (doc.body && doc.body.innerText) || '';
    }
  }

  function captchaPresent(doc) {
    doc = doc || PAGE.document;
    try {
      const box = doc.getElementById('div_capcha') || doc.getElementById('div_captcha');
      if (box && elVisible(box)) return true;

      const imgs = doc.querySelectorAll(
        'img[src*="capcha"],img[src*="captcha"],img[src*="kcaptcha"],img[src*="Capcha"]'
      );
      for (let i = 0; i < imgs.length; i++) {
        if (elVisible(imgs[i])) return true;
      }

      const inputs = doc.querySelectorAll(
        'input[name="code"],input[name="captcha"],input[name="capcha"],input[name="need_capcha"]'
      );
      let visibleCode = false;
      for (let j = 0; j < inputs.length; j++) {
        if (elVisible(inputs[j])) {
          visibleCode = true;
          break;
        }
      }
      if (visibleCode) {
        const t = pageTextSansBot(doc);
        if (/капч|код с картинк|введите код|картинк/i.test(t)) return true;
      }

      // Только явная фраза про капчу (не любое слово «код»)
      const t2 = pageTextSansBot(doc);
      if (/введите код с картинки|код с картинки|подтвердите капч/i.test(t2)) return true;
    } catch (e) {}
    return false;
  }

  function anyCaptchaVisible() {
    try {
      if (captchaPresent(PAGE.document)) return true;
      const act = getActWin();
      if (act && act.document && captchaPresent(act.document)) return true;
    } catch (e) {}
    return false;
  }

  /** Сброс залипшего CAP=true, если на экране капчи нет. */
  function clearCaptchaIfGone(silent) {
    if (!flagGet(FLAG.captcha) && !BOT.state.captchaPaused) return false;
    if (anyCaptchaVisible()) return false;
    BOT.state.captchaPaused = false;
    flagSet(FLAG.captcha, false);
    if (!silent) log('Капча не найдена на экране — паузу снял', 'ok');
    updateUi();
    return true;
  }

  function beep() {
    if (!BOT.cfg.captcha.beep) return;
    try {
      const Ctx = PAGE.AudioContext || PAGE.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.start();
      setTimeout(function () {
        o.stop();
        ctx.close();
      }, 400);
    } catch (e) {}
  }

  function onCaptchaDetected(reason) {
    if (BOT.state.captchaPaused) return;
    BOT.state.captchaPaused = true;
    flagSet(FLAG.captcha, true);
    flagSet(FLAG.forest, false);
    flagSet(FLAG.chaos, false);
    log('КАПЧА: остановлен. ' + (reason || '') + ' Решите вручную и нажмите «Продолжить».', 'err');
    beep();
    setTimeout(beep, 700);
    setTimeout(beep, 1400);
    // hook for future solver
    try {
      if (BOT.cfg.captcha.autoSolve && typeof PAGE.__k5_captchaSolver === 'function') {
        PAGE.__k5_captchaSolver();
      }
    } catch (e) {}
    updateUi();
  }

  function resumeAfterCaptcha() {
    BOT.state.captchaPaused = false;
    flagSet(FLAG.captcha, false);
    log('Капча снята — можно снова стартовать модули', 'ok');
    updateUi();
  }

  function watchCaptcha() {
    if (!BOT.cfg.captcha.detect) return;
    // Если пауза висит, а капчи уже нет — снимаем (частый false-positive)
    if (flagGet(FLAG.captcha) || BOT.state.captchaPaused) {
      clearCaptchaIfGone(true);
      return;
    }
    try {
      if (anyCaptchaVisible()) onCaptchaDetected('видимая капча');
    } catch (e) {}
  }

  /* ---------- forest helpers ---------- */
  function discoverMushroomTypes(win) {
    win = win || getActWin();
    const found = [];
    try {
      const ij = win.ij;
      if (ij) {
        Object.keys(ij).forEach(function (k) {
          const meta = ij[k];
          const title = ((meta && (meta.title || meta.alt)) || '') + '';
          if (/гриб/i.test(title)) found.push(Number(k));
        });
      }
    } catch (e) {}
    RES.mushrooms = found;
    return found;
  }

  function selectedTypes() {
    const f = BOT.cfg.forest;
    let t = [];
    if (f.collectTrees) t = t.concat(RES.trees);
    if (f.collectCopper) t = t.concat(RES.copper);
    if (f.collectIron) t = t.concat(RES.iron);
    if (f.collectGold) t = t.concat(RES.gold);
    if (f.collectHerbs) t = t.concat(RES.herbs);
    if (f.collectMushrooms) {
      if (!RES.mushrooms.length) discoverMushroomTypes();
      t = t.concat(RES.mushrooms);
    }
    return new Set(t.map(Number));
  }

  function isCraftType(img) {
    return CRAFT_TYPES.has(Number(img));
  }
  function isStepOnType(img) {
    img = Number(img);
    if (isCraftType(img)) return false;
    return true;
  }

  function forestReady(win) {
    win = win || getActWin();
    if (!win) return false;
    // Большой лес (ворота / фортпост / телепорт): newforest2 + WS Client
    if (isBigForestWin(win)) {
      try {
        return !!(
          win.Client &&
          typeof win.Client.send === 'function' &&
          win.global_data &&
          win.global_data.my_group
        );
      } catch (e) {
        return false;
      }
    }
    // Старый/городской forest.html
    return !!(win.cu && typeof win.cu.send === 'function' && win.gd);
  }

  function bigForestBusy(win) {
    try {
      const gd = win.global_data;
      if (!gd) return false;
      const we = Number(gd.wait_event);
      // 1 выход, 2 поиск, 3 добыча, 4 др. события
      return we > 0;
    } catch (e) {
      return false;
    }
  }

  function bigForestSend(win, msg) {
    try {
      if (win.Client && typeof win.Client.send === 'function') {
        win.Client.send(msg);
        return true;
      }
    } catch (e) {
      log('newforest send: ' + (e.message || e), 'err');
    }
    return false;
  }

  function discoverMeBig(win) {
    try {
      const g = win.global_data && win.global_data.my_group;
      if (!g) return null;
      const x = Number(g.posx);
      const y = Number(g.posy);
      const me = {
        x: x,
        y: y,
        abs: 0,
        id: win.sesId || g.sub_type || getUserId(),
        napr: g.napr,
        stay: g.stay,
      };
      setMe(me);
      return BOT.state.me;
    } catch (e) {
      return null;
    }
  }

  function forestNeedsCraftSearch() {
    const f = BOT.cfg.forest;
    return !!(f.collectTrees || f.collectCopper || f.collectIron || f.collectGold);
  }

  function forestWantsStepOn() {
    const f = BOT.cfg.forest;
    return !!(f.collectHerbs || f.collectMushrooms);
  }

  /** Направления большого леса (как в newforest2.js) */
  function bigForestNaprDeltas(win) {
    const nx = (win && win.naprs_x) || [0, 0, -1, -1, -1, 0, 1, 1, 1];
    const ny = (win && win.naprs_y) || [0, 1, 1, 0, -1, -1, -1, 0, 1];
    return { nx: nx, ny: ny };
  }

  function bigForestChebyshev(x1, y1, x2, y2) {
    return Math.max(Math.abs(Number(x1) - Number(x2)), Math.abs(Number(y1) - Number(y2)));
  }

  function bigForestReadText(win) {
    let t = '';
    try {
      const modal = win.document.getElementById('modal_form');
      const vis = modal && modal.style && modal.style.display === 'block';
      if (vis) t += ' ' + (modal.innerText || '');
    } catch (e) {}
    try {
      t += ' ' + readGameChat();
    } catch (e2) {}
    return String(t).replace(/\s+/g, ' ').slice(-2000);
  }

  function readGameChat() {
    let t = '';
    function grab(doc) {
      if (!doc || !doc.body) return;
      t += ' ' + (doc.body.innerText || '');
    }
    try {
      const tw = getTopWin();
      const names = ['d_chat', 'chat', 'd_chatuser', 'chatuser', 'd_chatact', 'chatact'];
      for (let i = 0; i < names.length; i++) {
        try {
          const fr = tw.frames[names[i]];
          if (fr && fr.document) grab(fr.document);
        } catch (eN) {}
      }
      const ifr = tw.document && tw.document.querySelectorAll('iframe');
      if (ifr) {
        for (let i = 0; i < ifr.length; i++) {
          const src = String((ifr[i].src || '') + ' ' + (ifr[i].name || '') + ' ' + (ifr[i].id || ''));
          if (!/chat/i.test(src)) continue;
          try {
            grab(ifr[i].contentDocument);
          } catch (eI) {}
        }
      }
    } catch (e) {}
    return t.slice(-1800);
  }

  const CRAFT_EVENT_RE = /сосна|дуб|красн\w*\s*дерев|медь|желез|золот|дерев[оа]|в\s+радиусе/i;
  const FRONT_EVENT_RE = /прямо\s+перед\s+вами|перед\s+вами/i;
  const STRICT_FRONT_RE = /прямо\s+перед\s+вами/i;

  function parseBigForestHint(text) {
    if (!text) return null;
    if (!CRAFT_EVENT_RE.test(text) && !FRONT_EVENT_RE.test(text)) return null;
    let dir = null;
    if (STRICT_FRONT_RE.test(text)) dir = 'front';
    else if (/слева/i.test(text)) dir = 'left';
    else if (/справа/i.test(text)) dir = 'right';
    else if (/сзади|позади/i.test(text)) dir = 'back';
    else if (/радиус/i.test(text)) dir = 'radius';
    else if (FRONT_EVENT_RE.test(text)) dir = 'frontish';
    else dir = 'near';
    return { t: Date.now(), dir: dir, front: STRICT_FRONT_RE.test(text), txt: text.slice(0, 200) };
  }

  function hintFresh(hint, ms) {
    return !!(hint && Date.now() - (hint.t || 0) < (ms || 18000));
  }

  function nfImgMeta(win, type) {
    try {
      const map = win && win.img_by_type;
      if (!map) return '';
      const m = map[type] || map[String(type)];
      if (!m) return '';
      return [m.img, m.title, m.alt, m.src].filter(Boolean).join(' ');
    } catch (e) {
      return '';
    }
  }

  function nfMushroomCategory(type, win) {
    type = Number(type);
    if (NF.mushroomCat1.indexOf(type) >= 0) return 1;
    if (NF.mushroomCat2.indexOf(type) >= 0) return 2;
    if (NF.mushroomCat3.indexOf(type) >= 0) return 3;
    const meta = nfImgMeta(win, type).toLowerCase();
    if (!meta) return 0;
    if (/syroezgka|ryzgik|podosinov|podberez|mokhovik|belij|сыроеж|рыжик|подосинов|подберезов|моховик|белый/.test(meta))
      return 1;
    if (/shampinon|trufel|smorchok|opjata|lisichka|kozljak|gruzd|masljat|шампинь|трюфел|сморчок|опят|лисичк|козляк|грузд|маслят/.test(meta))
      return 2;
    if (/psylocebe|podostroma|muhomor|mitsena|volokonn|poganka|псилоц|коралл|мухомор|мицен|волокон|поганк/.test(meta))
      return 3;
    return 0;
  }

  function mushroomCatAllowed(type, win) {
    const f = BOT.cfg.forest;
    if (!f || !f.collectMushrooms) return false;
    const cat = nfMushroomCategory(type, win);
    if (cat === 1) return f.mushroomCat1 !== false;
    if (cat === 2) return f.mushroomCat2 !== false;
    if (cat === 3) return f.mushroomCat3 !== false;
    // неизвестный гриб — берём только если включены все три
    return f.mushroomCat1 !== false && f.mushroomCat2 !== false && f.mushroomCat3 !== false;
  }

  function nfTypeKind(type, win) {
    type = Number(type);
    const meta = nfImgMeta(win, type);
    if (/griby\//i.test(meta) || /гриб/i.test(meta)) return 'mushroom';
    if (/travy\//i.test(meta) || /трав/i.test(meta)) return 'herb';
    if (/skala_zolot|золот/i.test(meta) && !/желез/i.test(meta)) return 'gold';
    if (/skala_med/i.test(meta)) return 'copper';
    if (/skala_zhelezn/i.test(meta)) return 'iron';
    // добываемое дерево (не куст-декор из blockers)
    if (
      NF.blockers.indexOf(type) < 0 &&
      (/sosn|dub|derev|listvin|vekov|pine|oak|ель|сосн|дуб|дерев|листв|веков/i.test(meta) ||
        (NF.trees && NF.trees.indexOf(type) >= 0))
    ) {
      return 'tree';
    }
    if (/^vl\d|^mv\d/i.test(meta) || /вода|море|океан|водоём|водоем/i.test(meta)) return 'water';
    if (NF.water && NF.water.indexOf(type) >= 0) return 'water';
    if (NF.herbs.indexOf(type) >= 0) return 'herb';
    if (NF.mushrooms.indexOf(type) >= 0) return 'mushroom';
    if (NF.gold && NF.gold.indexOf(type) >= 0) return 'gold';
    if (NF.copper.indexOf(type) >= 0) return 'copper';
    if (NF.iron.indexOf(type) >= 0) return 'iron';
    if (NF.trees && NF.trees.indexOf(type) >= 0) return 'tree';
    if (NF.chests.indexOf(type) >= 0) return 'chest';
    if (NF.rocks.indexOf(type) >= 0 || NF.blockers.indexOf(type) >= 0) return 'block';
    return 'other';
  }

  // viewmode 0: центр 144, шаг ряда 17 (±8×±8); 1: центр 246, шаг 29 (±14×±8); 2: центр 420, шаг 29 (±14×±14)
  function nfViewParams(win) {
    const vm = Number(win && win.viewmode) || 0;
    if (vm === 2) return { center: 420, row: 29 };
    if (vm === 1) return { center: 246, row: 29 };
    return { center: 144, row: 17 };
  }

  // Мировые координаты записи abs_poses: из posx/posy, иначе восстанавливаем из ключа (обратный GetAbs)
  function nfResolveXY(win, absKey, it) {
    const hasX = it && it.posx != null && it.posx !== '';
    const hasY = it && it.posy != null && it.posy !== '';
    if (hasX && hasY) {
      const x = Number(it.posx);
      const y = Number(it.posy);
      if (isFinite(x) && isFinite(y)) return { x: x, y: y };
    }
    try {
      const g = win.global_data && win.global_data.my_group;
      const mx = Number(g && g.posx);
      const my = Number(g && g.posy);
      const L = Number(absKey);
      if (!isFinite(mx) || !isFinite(my) || !isFinite(L)) return null;
      const p = nfViewParams(win);
      const r = L - p.center;
      const dy = Math.round(r / p.row);
      const dx = r - dy * p.row;
      return { x: mx + dx, y: my + dy };
    } catch (e) {
      return null;
    }
  }

  function listBigForestItems(win, mode) {
    const out = [];
    mode = mode || 'any';
    try {
      const gd = win.global_data;
      if (!gd || !gd.abs_poses) return out;
      const animalTypes = {};
      for (let i = 287; i <= 326; i++) animalTypes[i] = true;
      Object.keys(gd.abs_poses).forEach(function (abs) {
        const it = gd.abs_poses[abs];
        if (!it || it === 0) return;
        const type = Number(it.type);
        if (animalTypes[type]) return;
        const pos = nfResolveXY(win, abs, it);
        if (!pos) return;
        const x = pos.x;
        const y = pos.y;
        if (!isFinite(x) || !isFinite(y)) return;
        if (BOT.state.bannedAbs.has(x + ',' + y)) return;
        if (forestIsSkipped('a:' + abs)) return;
        const kind = nfTypeKind(type, win);
        const f = BOT.cfg.forest;
        if (mode === 'step') {
          if (kind === 'herb') {
            if (!f.collectHerbs) return;
          } else if (kind === 'mushroom') {
            if (!f.collectMushrooms) return;
            if (!mushroomCatAllowed(type, win)) return;
          } else if (kind !== 'chest') {
            return;
          }
        }
        if (mode === 'craft') {
          if (kind === 'copper') {
            if (!f.collectCopper) return;
          } else if (kind === 'iron') {
            if (!f.collectIron) return;
          } else if (kind === 'gold') {
            if (!f.collectGold) return;
          } else if (kind === 'tree') {
            if (!f.collectTrees) return;
          } else {
            return;
          }
        }
        if (mode === 'block' && kind !== 'block') return;
        out.push({
          abs: abs,
          x: x,
          y: y,
          type: type,
          kind: kind,
          id: it.id,
          key: x + ',' + y,
        });
      });
    } catch (e) {}
    return out;
  }

  function rememberFarItem(win, it) {
    if (!it) return;
    const x = Number(it.posx != null ? it.posx : it.x);
    const y = Number(it.posy != null ? it.posy : it.y);
    if (!isFinite(x) || !isFinite(y)) return;
    const kind = nfTypeKind(it.type || it.imgType, win);
    if (kind !== 'herb' && kind !== 'mushroom' && kind !== 'chest') return;
    if (!BOT.state.farItems) BOT.state.farItems = {};
    BOT.state.farItems[x + ',' + y] = {
      x: x,
      y: y,
      type: Number(it.type || it.imgType) || 0,
      kind: kind,
      key: x + ',' + y,
      t: Date.now(),
    };
  }

  function parseCssRgb(c) {
    if (!c) return null;
    c = String(c).toLowerCase().trim();
    let m = /^#([0-9a-f]{3})$/.exec(c);
    if (m) {
      return [
        parseInt(m[1][0] + m[1][0], 16),
        parseInt(m[1][1] + m[1][1], 16),
        parseInt(m[1][2] + m[1][2], 16),
      ];
    }
    m = /^#([0-9a-f]{6})$/.exec(c);
    if (m) {
      return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    }
    m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    const named = {
      lime: [0, 255, 0],
      green: [0, 128, 0],
      olive: [128, 128, 0],
      yellow: [255, 255, 0],
      brown: [165, 42, 42],
      orange: [255, 165, 0],
      peru: [205, 133, 63],
      sienna: [160, 82, 45],
      purple: [128, 0, 128],
      magenta: [255, 0, 255],
      fuchsia: [255, 0, 255],
      red: [255, 0, 0],
      white: [255, 255, 255],
    };
    return named[c] || null;
  }

  function radarKindFromBlob(blob, color) {
    const s = String(blob || '').toLowerCase();
    if (/гриб|griby|mushroom/i.test(s)) return 'mushroom';
    if (/трав|travy|herb|базилик|ромашк|шалфе/i.test(s)) return 'herb';
    const col = String(color || '').toLowerCase();
    if (/brown|orange|peru|sienna|chocolate/i.test(col)) return 'mushroom';
    const rgb = parseCssRgb(color);
    if (!rgb) return null;
    const r = rgb[0];
    const g = rgb[1];
    const b = rgb[2];
    if (g > r + 20 && g > b + 10) return 'herb';
    if (r > 80 && r > b + 25 && g >= b - 10 && g < r + 50) return 'mushroom';
    if (r > 90 && b > 90 && g < Math.min(r, b) - 15) return 'mushroom';
    return null;
  }

  function listRadarItems(win) {
    const out = [];
    if (BOT.cfg.forest && BOT.cfg.forest.useRadar === false) return out;
    try {
      const iframe = win.document && win.document.getElementById('radar_frame');
      const doc = iframe && (iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document));
      if (!doc || !doc.body) return out;
      const me = discoverMeBig(win) || getMe(win);
      if (!me) return out;
      const wrap = doc.body;
      const rw = wrap.scrollWidth || wrap.clientWidth || 200;
      const rh = wrap.scrollHeight || wrap.clientHeight || 200;
      const els = wrap.querySelectorAll('*');
      const dots = [];
      for (let i = 0; i < els.length && i < 400; i++) {
        const el = els[i];
        const st = el.style || {};
        let left = parseFloat(st.left);
        let top = parseFloat(st.top);
        if (!isFinite(left) || !isFinite(top)) {
          try {
            const cs = doc.defaultView && doc.defaultView.getComputedStyle(el);
            if (cs) {
              left = parseFloat(cs.left);
              top = parseFloat(cs.top);
            }
          } catch (eCs) {}
        }
        if (!isFinite(left) || !isFinite(top)) continue;
        const blob = ((el.title || '') + ' ' + (el.alt || '') + ' ' + (el.className || '')).toLowerCase();
        const color = st.backgroundColor || st.background || st.color || '';
        const kind = radarKindFromBlob(blob, color);
        if (!kind) continue;
        dots.push({ px: left, py: top, kind: kind });
      }
      if (!dots.length) return out;
      let cell = BOT.state.radarCellPx || 4;
      let calibrated = !!BOT.state.radarCalibrated;
      const known = listBigForestItems(win, 'step');
      if (known.length) {
        let bestCell = cell;
        let bestErr = 1e9;
        let bestHits = 0;
        for (let c = 2; c <= 8; c++) {
          let err = 0;
          let hits = 0;
          for (let k = 0; k < known.length && k < 8; k++) {
            const kx = (known[k].x - me.x) * c + rw / 2;
            const ky = (known[k].y - me.y) * c + rh / 2;
            let minD = 1e9;
            for (let j = 0; j < dots.length; j++) {
              const d = Math.abs(dots[j].px - kx) + Math.abs(dots[j].py - ky);
              if (d < minD) minD = d;
            }
            if (minD < c * 2.5) {
              err += minD;
              hits++;
            }
          }
          if (hits >= 2 && err / hits < bestErr) {
            bestErr = err / hits;
            bestCell = c;
            bestHits = hits;
          }
        }
        if (bestHits >= 2) {
          cell = bestCell;
          BOT.state.radarCellPx = cell;
          BOT.state.radarCalibrated = true;
          calibrated = true;
        }
      }
      if (!calibrated) {
        cell = BOT.state.radarCellPx || 4;
        if (Date.now() - (BOT.state.lastRadarUncalLog || 0) > 20000) {
          BOT.state.lastRadarUncalLog = Date.now();
          log('Большой лес: радар без калибровки — шкала ' + cell + 'px');
        }
      }
      const f = BOT.cfg.forest;
      const maxR = Math.max(12, Number(f.radarMaxDist) || 28);
      const seen = {};
      for (let i = 0; i < dots.length; i++) {
        const x = Math.round(me.x + (dots[i].px - rw / 2) / cell);
        const y = Math.round(me.y + (dots[i].py - rh / 2) / cell);
        const key = x + ',' + y;
        if (seen[key]) continue;
        seen[key] = 1;
        const dist = bigForestChebyshev(me.x, me.y, x, y);
        if (dist > maxR) continue;
        if (dist === 0) continue;
        if (dots[i].kind === 'herb' && !f.collectHerbs) continue;
        if (dots[i].kind === 'mushroom' && !f.collectMushrooms) continue;
        if (BOT.state.bannedAbs.has(key)) continue;
        const knownType = typeAtCell(win, x, y);
        if (dots[i].kind === 'mushroom' && knownType && !mushroomCatAllowed(knownType, win)) continue;
        out.push({
          x: x,
          y: y,
          kind: dots[i].kind,
          key: key,
          type: knownType || 0,
          fromRadar: true,
        });
      }
    } catch (e) {}
    return out;
  }

  function listAllStepItems(win) {
    const vis = listBigForestItems(win, 'step');
    const radar = listRadarItems(win);
    if (!radar.length) return vis;
    const seen = {};
    for (let i = 0; i < vis.length; i++) seen[vis[i].x + ',' + vis[i].y] = 1;
    const out = vis.slice();
    for (let j = 0; j < radar.length; j++) {
      const it = radar[j];
      const key = it.x + ',' + it.y;
      if (seen[key]) continue;
      const knownType = typeAtCell(win, it.x, it.y);
      if (it.kind === 'mushroom' && knownType && !mushroomCatAllowed(knownType, win)) continue;
      let near = false;
      for (let k = 0; k < vis.length; k++) {
        if (bigForestChebyshev(it.x, it.y, vis[k].x, vis[k].y) <= 1) {
          near = true;
          break;
        }
      }
      // видимый гриб «не той» категории рядом — не тянемся по радару к той же клетке
      if (!near && it.kind === 'mushroom') {
        const kCell = kindAtCell(win, it.x, it.y);
        if (kCell === 'mushroom' && knownType && !mushroomCatAllowed(knownType, win)) continue;
      }
      if (near) continue;
      seen[key] = 1;
      out.push(it);
    }
    return out;
  }

  function stepItemStillThere(win, it) {
    if (!it || it.x == null || it.y == null) return false;
    const type = typeAtCell(win, it.x, it.y);
    if (type && (it.kind === 'mushroom' || nfTypeKind(type, win) === 'mushroom')) {
      if (!mushroomCatAllowed(type, win)) return false;
    }
    const k = kindAtCell(win, it.x, it.y);
    if (k === 'herb' || k === 'mushroom' || k === 'chest') return true;
    if (it.kind && k === it.kind) return true;
    if (it.fromRadar) {
      if (k && k !== 'herb' && k !== 'mushroom' && k !== 'chest' && k !== it.kind) return false;
      return true;
    }
    return false;
  }

  function typeAtCell(win, x, y) {
    try {
      const gd = win.global_data;
      if (!gd || !gd.abs_poses) return 0;
      const keys = Object.keys(gd.abs_poses);
      for (let i = 0; i < keys.length; i++) {
        const it = gd.abs_poses[keys[i]];
        if (!it || it === 0) continue;
        const pos = nfResolveXY(win, keys[i], it);
        if (pos && pos.x === Number(x) && pos.y === Number(y)) {
          const type = Number(it.type) || 0;
          if (type) return type;
        }
      }
    } catch (e) {}
    return 0;
  }

  function kindAtCell(win, x, y) {
    let blocked = null;
    try {
      const gd = win.global_data;
      if (!gd || !gd.abs_poses) return null;
      const keys = Object.keys(gd.abs_poses);
      for (let i = 0; i < keys.length; i++) {
        const it = gd.abs_poses[keys[i]];
        if (!it || it === 0) continue;
        const pos = nfResolveXY(win, keys[i], it);
        if (pos && pos.x === Number(x) && pos.y === Number(y)) {
          const kind = nfTypeKind(it.type, win);
          if (
            kind === 'herb' ||
            kind === 'mushroom' ||
            kind === 'chest' ||
            kind === 'copper' ||
            kind === 'iron' ||
            kind === 'gold'
          ) {
            return kind;
          }
          if (!blocked) blocked = kind;
        }
      }
    } catch (e) {}
    return blocked;
  }

  function nearestBigItem(me, items, maxR, preferKind) {
    let best = null;
    let bestD = 99;
    let bestPref = 0;
    for (let i = 0; i < items.length; i++) {
      const d = bigForestChebyshev(me.x, me.y, items[i].x, items[i].y);
      if (maxR != null && d > maxR) continue;
      const pref = preferKind && items[i].kind === preferKind ? 1 : 0;
      if (d < bestD || (d === bestD && pref > bestPref) || (d === bestD && pref === bestPref && Math.random() < 0.3)) {
        bestD = d;
        bestPref = pref;
        best = Object.assign({}, items[i], { d: d });
      }
    }
    return best;
  }

  function currentNapr(win) {
    if (BOT.state.localNapr >= 1 && BOT.state.localNapr <= 8) return BOT.state.localNapr;
    const g = win.global_data && win.global_data.my_group;
    return Number(g && g.napr) || 1;
  }

  function facingNapr(win) {
    const g = win.global_data && win.global_data.my_group;
    const n = Number(g && g.napr);
    if (n >= 1 && n <= 8) return n;
    return currentNapr(win);
  }

  // 1 юг, 5 север, 3 запад, 7 восток (как naprs_x/y в newforest2)
  function naprFromStartDir(win) {
    const v = String((BOT.cfg.forest && BOT.cfg.forest.startDir) || 'face')
      .toLowerCase()
      .trim();
    if (!v || v === 'face' || v === '0') return facingNapr(win);
    const named = {
      1: 1,
      s: 1,
      south: 1,
      юг: 1,
      2: 2,
      sw: 2,
      'юго-запад': 2,
      3: 3,
      w: 3,
      west: 3,
      запад: 3,
      4: 4,
      nw: 4,
      'северо-запад': 4,
      5: 5,
      n: 5,
      north: 5,
      север: 5,
      6: 6,
      ne: 6,
      'северо-восток': 6,
      7: 7,
      e: 7,
      east: 7,
      восток: 7,
      8: 8,
      se: 8,
      'юго-восток': 8,
    };
    return named[v] || facingNapr(win);
  }

  // Игрок повернул персонажа вручную — берём его курс, а не старый wanderNapr в море
  function adoptManualFacing(win) {
    const sd = String((BOT.cfg.forest && BOT.cfg.forest.startDir) || 'face')
      .toLowerCase()
      .trim();
    // holdCourse: курс фиксирован, не перехватываем ни ручные повороты, ни «как стоит»
    if (BOT.cfg.forest && BOT.cfg.forest.holdCourse !== false) {
      return currentNapr(win);
    }
    if (sd && sd !== 'face' && sd !== '0') return currentNapr(win);
    const gn = facingNapr(win);
    if (!(gn >= 1 && gn <= 8)) return gn;
    if (Date.now() - (BOT.state.lastBotTurnAt || 0) < 1800) return gn;
    if (BOT.state.localNapr && Number(BOT.state.localNapr) !== gn) {
      log('Большой лес: курс игрока ' + gn);
      BOT.state.wanderNapr = gn;
      setLocalNapr(gn);
    }
    return gn;
  }

  function setLocalNapr(n) {
    BOT.state.localNapr = ((Number(n) - 1 + 8) % 8) + 1;
  }

  function naprExactDelta(win, fromX, fromY, toX, toY) {
    const d = bigForestNaprDeltas(win);
    const dx = Number(toX) - Number(fromX);
    const dy = Number(toY) - Number(fromY);
    for (let n = 1; n <= 8; n++) {
      if (d.nx[n] === dx && d.ny[n] === dy) return n;
    }
    return naprToward(win, fromX, fromY, toX, toY);
  }

  function isCardinalNapr(n) {
    n = Number(n);
    return n === 1 || n === 3 || n === 5 || n === 7;
  }

  /** Клетка, с которой жила будет прямо по курсу (apeha: сначала лицом, иначе слева/справа). */
  function pickFaceStand(win, me, vein) {
    if (!me || !vein) return null;
    const dlt = bigForestNaprDeltas(win);
    let best = null;
    for (let n = 1; n <= 8; n++) {
      const sx = Number(vein.x) - dlt.nx[n];
      const sy = Number(vein.y) - dlt.ny[n];
      if (isBlockedCell(win, sx, sy)) continue;
      const dist = bigForestChebyshev(me.x, me.y, sx, sy);
      const here = Number(me.x) === sx && Number(me.y) === sy ? 0 : 1;
      const cardinal = isCardinalNapr(n) ? 0 : 3;
      const score = here * 100 + dist * 10 + cardinal;
      if (!best || score < best.score) {
        best = { x: sx, y: sy, n: n, dist: dist, score: score };
      }
    }
    return best;
  }

  async function faceCell(win, tx, ty) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const meCur = discoverMeBig(win) || getMe(win);
      if (!meCur) break;
      const ahead = cellAhead(win, meCur, currentNapr(win));
      if (Number(ahead.x) === Number(tx) && Number(ahead.y) === Number(ty)) {
        BOT.state.wanderNapr = currentNapr(win);
        return true;
      }
      const faceNeeded = naprToward(win, meCur.x, meCur.y, tx, ty);
      const t = turnToFace(win, faceNeeded);
      BOT.state.wanderNapr = faceNeeded;
      await sleep(t ? 350 : 150);
      if (!t) break;
    }
    const me2 = discoverMeBig(win) || getMe(win);
    if (!me2) return false;
    const ahead2 = cellAhead(win, me2, currentNapr(win));
    return Number(ahead2.x) === Number(tx) && Number(ahead2.y) === Number(ty);
  }

  async function approachAndFaceVein(win, me, vein) {
    if (!me || !vein) return false;
    const stand = pickFaceStand(win, me, vein);
    if (!stand) {
      log('Большой лес: нет клетки лицом к ' + (vein.kind || 'жиле') + ' @' + vein.x + ',' + vein.y, 'err');
      return false;
    }
    if (stand.dist > 0) {
      log(
        'Большой лес: к лицу ' +
          (vein.kind || 'жила') +
          ' → ' +
          stand.x +
          ',' +
          stand.y +
          ' (курс ' +
          stand.n +
          ')'
      );
      await gotoWorldCell(win, stand.x, stand.y, Math.min(28000, 4000 + stand.dist * 600));
      const meHop = discoverMeBig(win) || getMe(win);
      if (meHop && (Number(meHop.x) !== Number(stand.x) || Number(meHop.y) !== Number(stand.y))) {
        await walkToward(
          win,
          { x: stand.x, y: stand.y, kind: 'goto', key: stand.x + ',' + stand.y },
          'лицо жилы',
          false
        );
      }
    }
    const me2 = discoverMeBig(win) || getMe(win);
    const ok = await faceCell(win, vein.x, vein.y);
    if (!ok) {
      log('Большой лес: не встал лицом к ' + vein.x + ',' + vein.y + ' (стою ' + (me2 ? me2.x + ',' + me2.y : '?') + ')', 'err');
    }
    return ok;
  }

  async function leaveEmptySearchArea(win, me) {
    if (!me) return false;
    let n = BOT.state.wanderNapr || naprFromStartDir(win) || facingNapr(win);
    function hopLen(dir) {
      const end = hopFreeEnd(win, me, dir, 8);
      return { end: end, len: bigForestChebyshev(me.x, me.y, end.x, end.y), n: dir };
    }
    let best = hopLen(n);
    if (best.len < 6) {
      for (let dir = 1; dir <= 8; dir++) {
        const h = hopLen(dir);
        if (h.len > best.len) best = h;
      }
    }
    if (best.len < 1) {
      log('Большой лес: пустой поиск — некуда уйти', 'err');
      BOT.state.lastSearchEmpty = false;
      return false;
    }
    log('Большой лес: пустой поиск — ухожу на ' + best.len + ' кл. курс ' + best.n);
    BOT.state.wanderNapr = best.n;
    turnToFace(win, best.n);
    await sleep(200);
    await gotoWorldCell(win, best.end.x, best.end.y, Math.min(28000, 4000 + best.len * 500));
    BOT.state.lastSearchEmpty = false;
    BOT.state.bigForestHint = null;
    BOT.state.stepsSinceSearch = 99;
    return true;
  }

  function naprToward(win, fromX, fromY, toX, toY) {
    const d = bigForestNaprDeltas(win);
    const wantDx = Math.sign(Number(toX) - Number(fromX));
    const wantDy = Math.sign(Number(toY) - Number(fromY));
    let best = 1;
    let bestScore = -1;
    for (let n = 1; n <= 8; n++) {
      const dx = d.nx[n];
      const dy = d.ny[n];
      let score = 0;
      if (dx === wantDx) score += 2;
      else if (wantDx === 0 || dx === 0) score += 0;
      else score -= 2;
      if (dy === wantDy) score += 2;
      else if (wantDy === 0 || dy === 0) score += 0;
      else score -= 2;
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  function turnToFace(win, want) {
    // курс из игры, не localNapr: после GotoKletka персонаж смотрит куда шёл, local врёт
    let cur = facingNapr(win);
    want = ((Number(want) - 1 + 8) % 8) + 1;
    if (cur === want) return 0;
    let left = 0;
    let c = cur;
    while (c !== want && left < 8) {
      c = c === 1 ? 8 : c - 1;
      left++;
    }
    let right = 0;
    c = cur;
    while (c !== want && right < 8) {
      c = c === 8 ? 1 : c + 1;
      right++;
    }
    const useLeft = left <= right;
    const steps = Math.min(useLeft ? left : right, 4);
    for (let i = 0; i < steps; i++) {
      bigForestSend(win, 'actNewMaps-ChangeNapr=' + (useLeft ? '0' : '1'));
      cur = useLeft ? (cur === 1 ? 8 : cur - 1) : cur === 8 ? 1 : cur + 1;
    }
    setLocalNapr(cur);
    if (steps) BOT.state.lastBotTurnAt = Date.now();
    return steps;
  }

  function cellAhead(win, me, napr) {
    const d = bigForestNaprDeltas(win);
    const n = napr || currentNapr(win);
    return { x: Number(me.x) + d.nx[n], y: Number(me.y) + d.ny[n] };
  }

  // Проходимо пусто/трава/гриб/сундук. Вода (vl/mv и тайл type=2) — препятствие, без лодки не ходим.
  const WALKABLE_KINDS = { herb: 1, mushroom: 1, chest: 1 };
  function isBlockedCell(win, x, y) {
    let blocked = false;
    let walkable = false;
    try {
      const gd = win.global_data;
      if (!gd) return false;
      if (gd.abs_poses) {
        const keys = Object.keys(gd.abs_poses);
        for (let i = 0; i < keys.length; i++) {
          const it = gd.abs_poses[keys[i]];
          if (!it || it === 0) continue;
          const type = Number(it.type);
          if (type === 0) continue;
          const pos = nfResolveXY(win, keys[i], it);
          if (pos && pos.x === Number(x) && pos.y === Number(y)) {
            const kind = nfTypeKind(type, win);
            if (WALKABLE_KINDS[kind]) walkable = true;
            else blocked = true;
          }
        }
      }
      if (!walkable && gd.base_items) {
        let bi = null;
        const abs = typeof nfGetAbs === 'function' ? nfGetAbs(win, x, y) : null;
        if (abs != null && gd.base_items[abs]) bi = gd.base_items[abs];
        if (!bi) {
          const n = gd.base_items.length || 0;
          for (let j = 0; j < n && j < 900; j++) {
            const it = gd.base_items[j];
            if (it && Number(it.posx) === Number(x) && Number(it.posy) === Number(y)) {
              bi = it;
              break;
            }
          }
        }
        if (bi) {
          const bt = Number(bi.type);
          const ship = gd.my_group && Number(gd.my_group.shiptp);
          // type 1 — суша; type 2 — вода (без лодки нельзя)
          if (bt === 2 && !ship) blocked = true;
        }
      }
    } catch (e) {}
    if (walkable) return false;
    return blocked;
  }

  function hopFreeEnd(win, me, n, maxN) {
    const d = bigForestNaprDeltas(win);
    let wx = Number(me.x);
    let wy = Number(me.y);
    let lastGood = { x: wx, y: wy };
    const cap = maxN || 8;
    for (let i = 0; i < cap; i++) {
      wx += d.nx[n];
      wy += d.ny[n];
      if (isBlockedCell(win, wx, wy)) break;
      lastGood = { x: wx, y: wy };
    }
    return lastGood;
  }

  function hopFreeLen(win, me, n, maxN) {
    if (!me) return 0;
    const end = hopFreeEnd(win, me, n, maxN);
    return bigForestChebyshev(me.x, me.y, end.x, end.y);
  }

  // Скольжение вдоль стены: сначала чуть влево/вправо, разворот на 180 — только если тупик.
  function chooseDetour(win, me, cur) {
    if (!BOT.state.wanderBias) BOT.state.wanderBias = Math.random() < 0.5 ? -1 : 1;
    const b = BOT.state.wanderBias;
    const offsets = [b, 2 * b, 3 * b, -b, -2 * b, -3 * b];
    for (let i = 0; i < offsets.length; i++) {
      const n = ((cur - 1 + offsets[i] + 8) % 8) + 1;
      if (!me) return n;
      const c = cellAhead(win, me, n);
      if (!isBlockedCell(win, c.x, c.y)) return n;
    }
    return ((cur + 3) % 8) + 1;
  }

  // У скалы: направление с самым длинным свободным ходом, не крутиться на месте.
  function bestEscapeNapr(win, me, cur) {
    if (!me) return cur;
    let best = cur;
    let bestLen = hopFreeLen(win, me, cur, 8);
    const b = BOT.state.wanderBias || 1;
    const offsets = [b, -b, 2 * b, -2 * b, 3 * b, -3 * b, 4];
    for (let i = 0; i < offsets.length; i++) {
      const n = ((cur - 1 + offsets[i] + 8) % 8) + 1;
      const len = hopFreeLen(win, me, n, 8);
      if (len > bestLen) {
        bestLen = len;
        best = n;
      }
    }
    return best;
  }

  function markHoldDetour() {
    BOT.state.holdDetourUntil = Date.now() + 12000;
  }

  function isWalkableForPath(win, x, y, goal) {
    if (goal && Number(x) === Number(goal.x) && Number(y) === Number(goal.y)) return true;
    return !isBlockedCell(win, x, y);
  }

  function forestSkipUntil(key, ms) {
    if (!BOT.state.skipForestKeys) BOT.state.skipForestKeys = {};
    BOT.state.skipForestKeys[key] = Date.now() + (ms || 20000);
  }

  function stepItemKey(it) {
    if (!it) return '';
    if (it.abs != null && it.abs !== '') return 'a:' + String(it.abs);
    return 'k:' + String(it.key || it.x + ',' + it.y);
  }

  function forgetStepCell(keyOrIt, ms) {
    const it = keyOrIt && typeof keyOrIt === 'object' ? keyOrIt : null;
    const key = it ? stepItemKey(it) : String(keyOrIt || '');
    if (!key) return;
    if (BOT.state.farItems) {
      if (it && it.key) delete BOT.state.farItems[it.key];
      else delete BOT.state.farItems[key.replace(/^k:/, '')];
    }
    forestSkipUntil(key, ms || 60000);
    if (it && it.abs != null) forestSkipUntil('a:' + String(it.abs), ms || 90000);
    if (BOT.state.stepTarget && BOT.state.stepTarget.key === key) BOT.state.stepTarget = null;
  }

  function pickStickyStepItem(win, me, items) {
    if (!me || !items || !items.length) {
      BOT.state.stepTarget = null;
      return null;
    }
    const t = BOT.state.stepTarget;
    if (t && t.key && !forestIsSkipped(t.key)) {
      let still = null;
      for (let i = 0; i < items.length; i++) {
        if (stepItemKey(items[i]) === t.key) {
          still = items[i];
          break;
        }
      }
      if (still && stepItemStillThere(win, still)) {
        const dist = bigForestChebyshev(me.x, me.y, still.x, still.y);
        // обход скалы может временно увеличить dist на 1 — сбрасываем только при явном отступлении
        if (t.lastDist != null && dist > t.lastDist + 1) {
          forgetStepCell(still, 45000);
          still = null;
        } else {
          t.lastDist = Math.min(dist, t.lastDist != null ? t.lastDist : dist);
          return still;
        }
      } else if (t.key) {
        forgetStepCell(t.key, 90000);
      }
    }
    const vis = items.filter(function (it) {
      return stepItemStillThere(win, it);
    });
    if (!vis.length) {
      BOT.state.stepTarget = null;
      return null;
    }
    vis.sort(function (a, b) {
      return bigForestChebyshev(me.x, me.y, a.x, a.y) - bigForestChebyshev(me.x, me.y, b.x, b.y);
    });
    const it = vis[0];
    BOT.state.stepTarget = {
      key: stepItemKey(it),
      lastDist: bigForestChebyshev(me.x, me.y, it.x, it.y),
      since: Date.now(),
    };
    return it;
  }

  function forestIsSkipped(key) {
    const map = BOT.state.skipForestKeys;
    if (!map || !key) return false;
    const until = map[key];
    if (!until) return false;
    if (Date.now() > until) {
      delete map[key];
      return false;
    }
    return true;
  }

  function markVeinScanned(key) {
    if (!BOT.state.scannedVeins) BOT.state.scannedVeins = {};
    if (key) BOT.state.scannedVeins[key] = Date.now();
  }

  function veinWasScanned(key) {
    const t = BOT.state.scannedVeins && BOT.state.scannedVeins[key];
    return !!(t && Date.now() - t < 90000);
  }

  // Первый шаг BFS (8 направлений). standBeside: цель — любая проходимая клетка рядом с (tx,ty), не заходить на жилу.
  // 0 = уже на цели; null = пути нет.
  function bfsFirstNapr(win, me, tx, ty, opts) {
    if (!me) return null;
    const standBeside = !!(opts && opts.standBeside);
    const d = bigForestNaprDeltas(win);
    const goal = standBeside ? null : { x: Number(tx), y: Number(ty) };
    function isGoal(x, y) {
      if (standBeside) {
        return bigForestChebyshev(x, y, tx, ty) === 1 && !isBlockedCell(win, x, y);
      }
      return Number(x) === Number(tx) && Number(y) === Number(ty);
    }
    if (isGoal(me.x, me.y)) return 0;
    const seen = {};
    seen[me.x + ',' + me.y] = 1;
    const q = [{ x: Number(me.x), y: Number(me.y), first: 0, dist: 0 }];
    let n = 0;
    while (q.length && n < 420) {
      const cur = q.shift();
      n++;
      for (let dir = 1; dir <= 8; dir++) {
        const nx = cur.x + d.nx[dir];
        const ny = cur.y + d.ny[dir];
        const k = nx + ',' + ny;
        if (seen[k]) continue;
        const atGoal = isGoal(nx, ny);
        if (!atGoal && !isWalkableForPath(win, nx, ny, goal)) continue;
        seen[k] = 1;
        const first = cur.first || dir;
        if (atGoal) return first;
        if (cur.dist < 24) q.push({ x: nx, y: ny, first: first, dist: cur.dist + 1 });
      }
    }
    return null;
  }

  // Полный путь (клетки без стартовой). Пусто [] = уже на цели.
  function bfsPath(win, me, tx, ty, opts) {
    const standBeside = !!(opts && opts.standBeside);
    const d = bigForestNaprDeltas(win);
    const goal = standBeside ? null : { x: Number(tx), y: Number(ty) };
    function isGoal(x, y) {
      if (standBeside) {
        return bigForestChebyshev(x, y, tx, ty) === 1 && !isBlockedCell(win, x, y);
      }
      return Number(x) === Number(tx) && Number(y) === Number(ty);
    }
    if (!me) return null;
    if (isGoal(me.x, me.y)) return [];
    const seen = {};
    seen[me.x + ',' + me.y] = { px: null, py: null };
    const q = [{ x: Number(me.x), y: Number(me.y), dist: 0 }];
    let n = 0;
    while (q.length && n < 900) {
      const cur = q.shift();
      n++;
      for (let dir = 1; dir <= 8; dir++) {
        const nx = cur.x + d.nx[dir];
        const ny = cur.y + d.ny[dir];
        const k = nx + ',' + ny;
        if (seen[k]) continue;
        const atGoal = isGoal(nx, ny);
        if (!atGoal && !isWalkableForPath(win, nx, ny, goal)) continue;
        seen[k] = { px: cur.x, py: cur.y };
        if (atGoal) {
          const path = [];
          let cx = nx;
          let cy = ny;
          while (!(cx === Number(me.x) && cy === Number(me.y))) {
            path.push({ x: cx, y: cy });
            const p = seen[cx + ',' + cy];
            if (!p || p.px == null) break;
            cx = p.px;
            cy = p.py;
          }
          path.reverse();
          return path;
        }
        if (cur.dist < 48) q.push({ x: nx, y: ny, dist: cur.dist + 1 });
      }
    }
    return null;
  }

  function nfGetAbs(win, x, y) {
    try {
      const g = win.global_data && win.global_data.my_group;
      if (!g) return null;
      const mx = Number(g.posx);
      const my = Number(g.posy);
      const tx = Number(x);
      const ty = Number(y);
      const dx = mx - tx;
      const dy = my - ty;
      const vm = Number(win && win.viewmode) || 0;
      if (!vm) {
        if (dx > 8 || dx < -8 || dy > 8 || dy < -8) return null;
        const L = 144 + (ty - my) * 17 + (tx - mx);
        return L >= 0 && L <= 288 ? L : null;
      }
      if (vm === 1) {
        if (dx > 14 || dx < -14 || dy > 8 || dy < -8) return null;
        const L = 246 + (ty - my) * 29 + (tx - mx);
        return L >= 0 && L <= 492 ? L : null;
      }
      if (dx > 14 || dx < -14 || dy > 14 || dy < -14) return null;
      const L = 420 + (ty - my) * 29 + (tx - mx);
      return L >= 0 && L <= 840 ? L : null;
    } catch (e) {
      return null;
    }
  }

  function cellGotoId(win, x, y) {
    try {
      const bi = win.global_data && win.global_data.base_items;
      if (!bi) return null;
      const abs = nfGetAbs(win, x, y);
      if (abs != null && bi[abs] && bi[abs].id != null) return bi[abs].id;
      const n = bi.length || 0;
      for (let i = 0; i < n && i < 900; i++) {
        const it = bi[i];
        if (it && Number(it.posx) === Number(x) && Number(it.posy) === Number(y) && it.id != null) return it.id;
      }
    } catch (e) {}
    return null;
  }

  async function waitForestStand(win, before, dest, maxMs) {
    const t0 = Date.now();
    let after = discoverMeBig(win) || getMe(win);
    let moving = false;
    let lastPos = before ? before.x + ',' + before.y : '';
    let lastPosAt = Date.now();
    while (Date.now() - t0 < (maxMs || 9000)) {
      after = discoverMeBig(win) || getMe(win);
      let stay = 1;
      try {
        const g = win.global_data && win.global_data.my_group;
        stay = g ? Number(g.stay) : 1;
      } catch (e) {}
      const pos = after ? after.x + ',' + after.y : '';
      if (pos !== lastPos) {
        lastPos = pos;
        lastPosAt = Date.now();
      }
      if (stay === 0) moving = true;
      if (stay === 1 && moving) return after;
      if (
        stay === 1 &&
        dest &&
        after &&
        Number(after.x) === Number(dest.x) &&
        Number(after.y) === Number(dest.y)
      ) {
        return after;
      }
      // stay=0, но координаты не меняются — упёрлись в воду/стену, не ждать 9с
      if (stay === 0 && Date.now() - lastPosAt > 2800) {
        log('Большой лес: ход без сдвига — отмена');
        bigForestSend(win, 'actNewMaps-GotoKletka=0');
        return after;
      }
      await sleep(120);
    }
    return after;
  }

  async function gotoWorldCell(win, x, y, maxWaitMs) {
    const before = discoverMeBig(win) || getMe(win);
    if (isBlockedCell(win, x, y)) {
      log('Большой лес: ' + x + ',' + y + ' непроходимо (вода/скала) — не иду');
      return before;
    }
    const id = cellGotoId(win, x, y);
    BOT.state.forestTimers.lastMoveAt = Date.now();
    if (id != null) {
      log('Большой лес: переход к ' + x + ',' + y);
      bigForestSend(win, 'actNewMaps-GotoKletka=' + id);
      await sleep(280);
      let stay = 1;
      try {
        const g = win.global_data && win.global_data.my_group;
        stay = g ? Number(g.stay) : 1;
      } catch (eS) {}
      if (stay === 1) {
        // как ручной клик по клетке: второй пакет = «идти»
        bigForestSend(win, 'actNewMaps-GotoKletka=' + id);
      }
    } else {
      const n = naprToward(win, before.x, before.y, x, y);
      turnToFace(win, n);
      await sleep(80);
      bigForestSend(win, 'actNewMaps-GotoKletka=-1');
    }
    const waitMs = maxWaitMs != null ? maxWaitMs : 9000;
    const after = await waitForestStand(win, before, { x: x, y: y }, waitMs);
    if (after && before && (after.x !== before.x || after.y !== before.y)) {
      BOT.state.stepsSinceSearch = (BOT.state.stepsSinceSearch || 0) + Math.max(
        1,
        bigForestChebyshev(before.x, before.y, after.x, after.y)
      );
      BOT.state.stuckCount = 0;
    }
    return after;
  }

  async function walkToward(win, dest, reason, standBeside) {
    const me = discoverMeBig(win) || getMe(win);
    if (!me || !dest) return false;
    const pathOpts = standBeside ? { standBeside: true } : null;
    const path = bfsPath(win, me, dest.x, dest.y, pathOpts);
    // клик по карте: goto / радар / трава-гриб — без поворотов на месте и без hop по 5
    const longHop =
      !!dest &&
      (dest.kind === 'goto' ||
        dest.fromRadar ||
        dest.kind === 'herb' ||
        dest.kind === 'mushroom' ||
        dest.kind === 'chest');
    if (path == null) {
      let n = bfsFirstNapr(win, me, dest.x, dest.y, pathOpts);
      if (n == null) n = naprToward(win, me.x, me.y, dest.x, dest.y);
      if (n == null) return false;
      if (n === 0) return true;
      BOT.state.wanderNapr = n;
      log(
        'Большой лес: к ' +
          (reason || dest.kind || '') +
          ' ' +
          dest.x +
          ',' +
          dest.y +
          (dest.fromRadar ? ' (радар)' : '') +
          ' без полного пути — курс ' +
          n
      );
      if (longHop) {
        const end = hopFreeEnd(win, me, n, 10);
        if (Number(end.x) === Number(me.x) && Number(end.y) === Number(me.y)) return false;
        await gotoWorldCell(win, end.x, end.y, Math.min(28000, 5000 + 10 * 400));
        return true;
      }
      await faceAndStep(win, n, reason || 'toward', dest);
      return true;
    }
    if (!path.length) return true;
    const isGoto = dest && dest.kind === 'goto';
    // к точке — один длинный GotoKletka (как клик), не по 5 клеток с паузами
    let cell;
    if (longHop) {
      if (cellGotoId(win, dest.x, dest.y) != null) {
        cell = { x: Number(dest.x), y: Number(dest.y) };
      } else {
        cell = path[path.length - 1] || path[0];
        for (let j = path.length - 1; j >= 0; j--) {
          if (cellGotoId(win, path[j].x, path[j].y) != null) {
            cell = path[j];
            break;
          }
        }
      }
    } else {
      const hopCap = 5;
      const hopMax = Math.min(path.length, hopCap);
      cell = path[hopMax - 1] || path[0];
    }
    const beforeDist =
      dest && dest.x != null ? bigForestChebyshev(me.x, me.y, dest.x, dest.y) : null;
    const hopIdx = path.findIndex(function (c) {
      return Number(c.x) === Number(cell.x) && Number(c.y) === Number(cell.y);
    });
    log(
      'Большой лес: к ' +
        (reason || dest.kind || '') +
        ' ' +
        dest.x +
        ',' +
        dest.y +
        ' шаг ' +
        (hopIdx >= 0 ? hopIdx + 1 : path.length) +
        '/' +
        path.length +
        ' кл. → ' +
        cell.x +
        ',' +
        cell.y
    );
    const waitMs = longHop ? Math.min(28000, 5000 + path.length * 400) : 9000;
    const after = await gotoWorldCell(win, cell.x, cell.y, waitMs);
    if (beforeDist != null && dest && BOT.state.stepTarget && BOT.state.stepTarget.key === stepItemKey(dest)) {
      const me2 = after || discoverMeBig(win) || getMe(win);
      if (me2) {
        const afterDist = bigForestChebyshev(me2.x, me2.y, dest.x, dest.y);
        BOT.state.stepTarget.lastDist = afterDist;
        if (afterDist > beforeDist) {
          BOT.state.stepTarget.stall = (BOT.state.stepTarget.stall || 0) + 1;
          if (BOT.state.stepTarget.stall >= 2) {
            log('Большой лес: отступаю от ' + dest.kind + ' @' + dest.key + ' — сброс цели', 'err');
            forgetStepCell(dest, 60000);
          }
        } else {
          BOT.state.stepTarget.stall = 0;
        }
      }
    }
    return true;
  }

  function chooseDetourToward(win, me, cur, tx, ty) {
    if (!me || tx == null || ty == null) return chooseDetour(win, me, cur);
    const d = bigForestNaprDeltas(win);
    const offsets = [0, -1, 1, -2, 2, -3, 3];
    let best = 0;
    let bestScore = 1e9;
    for (let i = 0; i < offsets.length; i++) {
      const n = ((cur - 1 + offsets[i] + 8) % 8) + 1;
      const c = { x: Number(me.x) + d.nx[n], y: Number(me.y) + d.ny[n] };
      if (isBlockedCell(win, c.x, c.y) && !(Number(c.x) === Number(tx) && Number(c.y) === Number(ty))) continue;
      const dist = bigForestChebyshev(c.x, c.y, tx, ty);
      const score = dist * 10 + Math.abs(offsets[i]);
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best || chooseDetour(win, me, cur);
  }

  function isWantedCraftAhead(kind) {
    const f = BOT.cfg.forest;
    return (
      (kind === 'copper' && f.collectCopper) ||
      (kind === 'iron' && f.collectIron) ||
      (kind === 'gold' && f.collectGold) ||
      (kind === 'tree' && f.collectTrees)
    );
  }

  async function waitForestIdle(win, before, maxMs) {
    const t0 = Date.now();
    let after = discoverMeBig(win) || getMe(win);
    while (Date.now() - t0 < (maxMs || 1600)) {
      after = discoverMeBig(win) || getMe(win);
      if (before && after && (after.x !== before.x || after.y !== before.y)) return after;
      const g = win.global_data && win.global_data.my_group;
      if (g && Number(g.stay) === 1) return after;
      await sleep(70);
    }
    return after;
  }

  async function faceAndStep(win, wantNapr, reason, dest) {
    const turns = turnToFace(win, wantNapr);
    if (turns) await sleep(70 + turns * 55);
    const before = discoverMeBig(win) || getMe(win);
    let cur = currentNapr(win);
    // Препятствие впереди — сразу скользим и ДЕЛАЕМ шаг (не крутимся на месте)
    if (before) {
      const ahead = cellAhead(win, before, cur);
      if (isBlockedCell(win, ahead.x, ahead.y)) {
        const ak = kindAtCell(win, ahead.x, ahead.y);
        if (dest && Number(ahead.x) === Number(dest.x) && Number(ahead.y) === Number(dest.y)) {
          // цель под ногами впереди (гриб/трава) — наступаем
        } else if (isWantedCraftAhead(ak)) {
          log('Большой лес: ' + ak + ' впереди — стоп, жду поиск');
          return;
        } else {
          const alt =
            dest && dest.x != null && !dest.fromRadar
              ? chooseDetourToward(win, before, cur, dest.x, dest.y)
              : chooseDetour(win, before, cur);
          log('Большой лес: препятствие впереди → курс ' + alt + (reason ? ' (' + reason + ')' : ''));
          turnToFace(win, alt);
          BOT.state.wanderNapr = alt;
          markHoldDetour();
          cur = alt;
          await sleep(90);
          const end = hopFreeEnd(win, before, cur, 4);
          if (end.x !== Number(before.x) || end.y !== Number(before.y)) {
            await gotoWorldCell(win, end.x, end.y);
            return;
          }
          const esc = bestEscapeNapr(win, before, cur);
          const escEnd = hopFreeEnd(win, before, esc, 6);
          if (escEnd.x !== Number(before.x) || escEnd.y !== Number(before.y)) {
            log('Большой лес: скала — уход курс ' + esc);
            BOT.state.wanderNapr = esc;
            markHoldDetour();
            turnToFace(win, esc);
            await gotoWorldCell(win, escEnd.x, escEnd.y);
            return;
          }
          BOT.state.stuckCount = (BOT.state.stuckCount || 0) + 1;
          return;
        }
      }
    }
    await bigForestStepForward(win);
    const after = await waitForestIdle(win, before, 1600);
    const key = after ? after.x + ',' + after.y : '';
    const beforeKey = before ? before.x + ',' + before.y : '';
    if (key && key !== beforeKey) {
      BOT.state.stepsSinceSearch = (BOT.state.stepsSinceSearch || 0) + 1;
      BOT.state.lastWalkPos = key;
      BOT.state.stuckCount = 0;
      log('Большой лес: шаг (' + BOT.state.stepsSinceSearch + '/' + (BOT.cfg.forest.searchEverySteps || 5) + ')');
    } else {
      const g = win.global_data && win.global_data.my_group;
      if (g && Number(g.stay) === 0) return; // ещё идём — не считаем застреванием
      BOT.state.stuckCount = (BOT.state.stuckCount || 0) + 1;
      const bounce =
        dest && dest.x != null && !dest.fromRadar
          ? chooseDetourToward(win, after || before, cur, dest.x, dest.y)
          : chooseDetour(win, after || before, cur);
      log('Большой лес: не сдвинулся — смена курса ' + bounce, 'err');
      turnToFace(win, bounce);
      BOT.state.wanderNapr = bounce;
      markHoldDetour();
      await sleep(80);
      // сразу шаг в новый курс — иначе «вертится вокруг оси»
      const me2 = discoverMeBig(win) || getMe(win) || after || before;
      if (me2) {
        const a3 = cellAhead(win, me2, bounce);
        if (!isBlockedCell(win, a3.x, a3.y)) {
          await bigForestStepForward(win);
          await waitForestIdle(win, me2, 1200);
        }
      }
    }
  }

  async function bigForestStepForward(win) {
    BOT.state.forestTimers.lastMoveAt = Date.now();
    bigForestSend(win, 'actNewMaps-GotoKletka=-1');
    // минимальная пауза как при ручной ходьбе (не завязано на forest.delayMin/Max)
    await sleep(humanDelay(150, 420));
  }

  // Расширяем обзор до максимума (viewmode 2 = ±14×±14), чтобы «видеть» траву/грибы дальше зоны видимости
  async function ensureWideView(win) {
    try {
      if (Number(win.viewmode) >= 2) {
        BOT.state.viewWidened = true;
        return;
      }
      const g = win.global_data && win.global_data.my_group;
      if (!g || Number(g.stay) !== 1) return;
      if (Date.now() - (BOT.state.lastViewTry || 0) < 8000) return;
      BOT.state.lastViewTry = Date.now();
      const sel = win.document && win.document.getElementById('viewmode');
      if (sel) {
        try {
          let has2 = false;
          for (let i = 0; i < sel.options.length; i++) {
            if (String(sel.options[i].value) === '2') has2 = true;
          }
          if (!has2) {
            const opt = win.document.createElement('option');
            opt.value = '2';
            opt.text = '29x29';
            sel.appendChild(opt);
          }
          sel.value = '2';
        } catch (eSel) {}
      }
      bigForestSend(win, 'actNewMaps-ChangeView=2');
      log('Большой лес: обзор → viewmode 2 (радар дальше карты)');
      await sleep(400);
    } catch (e) {}
  }

  async function bigForestDoSearch(win) {
    BOT.state.stepsSinceSearch = 0;
    BOT.state.forestTimers.lastSearchAt = Date.now();
    log('Большой лес: поиск…', 'ok');
    if (typeof win.StartSearch === 'function') win.StartSearch();
    else bigForestSend(win, 'actNewMaps-StartSearch=1');
    const t0 = Date.now();
    let sawBusy = false;
    let foundHint = null;
    let empty = false;
    while (Date.now() - t0 < 14000) {
      const we = Number(win.global_data && win.global_data.wait_event) || 0;
      if (we === 2) sawBusy = true;
      let modalTxt = '';
      try {
        const modal = win.document.getElementById('modal_form');
        const vis = modal && modal.style && modal.style.display === 'block';
        if (vis) modalTxt = String(modal.innerText || modal.innerHTML || '');
      } catch (eM) {}
      const parsed = parseBigForestHint(modalTxt);
      if (parsed) {
        foundHint = parsed;
        BOT.state.bigForestHint = parsed;
        BOT.state.lastSearchEmpty = false;
        break;
      }
      if (/ничего не найдено/i.test(modalTxt)) {
        empty = true;
        break;
      }
      if (sawBusy && we === 0 && Date.now() - t0 > 900) break;
      if (!sawBusy && Date.now() - t0 > 3500 && we === 0) break;
      await sleep(280);
    }
    const txt = bigForestReadText(win);
    const parsed2 = foundHint || parseBigForestHint(txt);
    if (parsed2) {
      BOT.state.bigForestHint = parsed2;
      BOT.state.lastSearchEmpty = false;
      log('Большой лес: поиск → «' + String(parsed2.txt || '').replace(/\s+/g, ' ').slice(0, 80) + '»');
    } else {
      BOT.state.lastSearchEmpty = true;
      BOT.state.bigForestHint = null;
      log('Большой лес: поиск пустой');
    }
  }

  function bagRowBlob(row) {
    if (!row) return '';
    let s = ((row.innerText || '') + ' ' + (row.innerHTML || '')).toLowerCase();
    try {
      const imgs = row.querySelectorAll ? row.querySelectorAll('img,[title],[alt]') : [];
      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        s +=
          ' ' +
          (el.title || '') +
          ' ' +
          (el.alt || '') +
          ' ' +
          (el.src || (el.getAttribute && el.getAttribute('src')) || '');
      }
    } catch (e) {}
    return normalizeItemName(s);
  }

  function normalizeItemName(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/ё/g, 'е')
      .trim();
  }

  // kind → инструмент (дерево = топор, руда = кирка)
  const TOOL_MAP = {
    copper: { name: 'кирка', kind: 'pick' },
    iron: { name: 'кирка', kind: 'pick' },
    gold: { name: 'кирка', kind: 'pick' },
    tree: { name: 'топор', kind: 'axe' },
    mushroom: { name: 'корзина грибника', kind: 'basket' },
    herb: { name: 'корзина грибника', kind: 'basket' },
    basket: { name: 'корзина грибника', kind: 'basket' },
  };

  function resolveToolWant(hintTxt, kind) {
    const blob = normalizeItemName(String(hintTxt || '') + ' ' + String(kind || ''));
    const mapped = TOOL_MAP[kind];
    if (mapped) return mapped;
    if (kind === 'basket' || BASKET_NEED_RE.test(blob)) return TOOL_MAP.basket;
    if (/мед|желез|золот|руд|кирк|copper|iron|gold|pick/i.test(blob)) return TOOL_MAP.copper;
    if (/дерев|сосн|дуб|топор|axe|лесоруб|дровосек/i.test(blob)) return TOOL_MAP.tree;
    if (/корзин|гриб|mushroom/i.test(blob)) return TOOL_MAP.mushroom;
    return null;
  }

  function findRowAction(row, re) {
    if (!row || !row.querySelectorAll) return null;
    const els = [...row.querySelectorAll('input,button,a,[onclick]')];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const blob = (
        (el.value || '') +
        ' ' +
        (el.textContent || '') +
        ' ' +
        (el.getAttribute('onclick') || '') +
        ' ' +
        (el.getAttribute('href') || el.href || '')
      ).toLowerCase();
      if (re.test(blob)) return el;
    }
    return null;
  }

  async function withBagPopup(path, fn) {
    // iframe вместо window.open — Chrome часто блокирует popup сумки
    const win = getActWin();
    if (!win) {
      log('bag: нет d_act', 'err');
      return null;
    }
    let hostDoc = null;
    try {
      hostDoc = win.document;
    } catch (eD) {
      hostDoc = getTopDoc();
    }
    let iframe = hostDoc.getElementById('k5-bag');
    if (!iframe) {
      iframe = hostDoc.createElement('iframe');
      iframe.id = 'k5-bag';
      iframe.setAttribute(
        'style',
        'position:fixed;width:900px;height:650px;left:-4500px;top:0;z-index:1;opacity:0;pointer-events:none;border:0'
      );
      (hostDoc.body || hostDoc.documentElement).appendChild(iframe);
    }
    const url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    try {
      iframe.src = 'about:blank';
    } catch (eB) {}
    await sleep(60);
    try {
      const rel = String(url || '').replace(/^https?:\/\/[^/]+/i, '');
      iframe.src = rel.charAt(0) === '/' ? rel.slice(1) : rel;
    } catch (eS) {
      iframe.src = url;
    }
    let bagWin = null;
    for (let i = 0; i < 28; i++) {
      await sleep(220);
      try {
        bagWin = iframe.contentWindow;
        const doc = bagWin && bagWin.document;
        const html = (doc && doc.body && doc.body.innerHTML) || '';
        if (html.length > 300) break;
      } catch (eWait) {}
      bagWin = null;
    }
    if (!bagWin) {
      log('bag iframe не загрузился (' + path + ')', 'err');
      return null;
    }
    let result = null;
    try {
      result = await fn(bagWin);
    } catch (e2) {
      log('bag: ' + (e2.message || e2), 'err');
    }
    try {
      iframe.src = 'about:blank';
    } catch (e3) {}
    return result;
  }

  function bagLooksEquipped(txt) {
    return /снять|снаряж|надет[оаы]|equipped|одет|в\s*руках|экипир/i.test(txt);
  }

  function bagRowIsTool(txt, wantKind) {
    const t = normalizeItemName(txt);
    if (!t) return false;
    if (/шлем|амулет|лат[ыа]|перчатк|пояс|щит|понож|кольц|наруч|оружи|брон|доспех|кираса/i.test(t))
      return false;
    if (wantKind === 'basket') return /корзин/i.test(t) && /гриб/i.test(t);
    if (wantKind === 'pick') {
      return (
        (/кирк/i.test(t) || /kirka|kirk|pickaxe|рудн/i.test(t)) &&
        !/топор|topor|axe/i.test(t.replace(/кирк[^\s]*/gi, ''))
      );
    }
    if (wantKind === 'axe') {
      return (
        (/топор/i.test(t) || /topor|axe|лесоруб|дровосек/i.test(t)) &&
        !/кирк|kirka/i.test(t.replace(/топор[^\s]*/gi, ''))
      );
    }
    return false;
  }

  function findWearTarget(root, wantKind) {
    if (!root) return null;
    const html = String((root.innerHTML || '') + ' ' + (root.outerHTML || ''));
    const wearUrl = /(?:bag_type_17[^"'?\s]*\?|)\s*actUser-Wear=(\d+)/i.exec(html);
    if (wearUrl) return { href: 'bag_type_17.html?actUser-Wear=' + wearUrl[1] };
    const btn = findRowAction(root, /одеть|надеть|wear/i);
    if (btn) return { el: btn };
    const inputs = root.querySelectorAll ? [...root.querySelectorAll('input,button,a')] : [];
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      const blob = ((el.value || '') + ' ' + (el.name || '') + ' ' + (el.getAttribute('onclick') || '')).toLowerCase();
      if (/одеть|надеть|wear/i.test(blob)) return { el: el };
      const v = String(el.value || '');
      if (/actUser-Wear/i.test(blob) && /^\d{2,}$/.test(v)) {
        return { href: 'bag_type_17.html?actUser-Wear=' + v };
      }
    }
    return null;
  }

  function findBagToolWear(doc, wantKind) {
    if (!doc) return null;
    const nodes = [...doc.querySelectorAll('tr,td,div,li')];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (node.querySelector && node.querySelector('tr') && node.tagName === 'TR') continue;
      const txt = bagRowBlob(node);
      if (!bagRowIsTool(txt, wantKind)) continue;
      const wear = findWearTarget(node, wantKind);
      if (wear) return { node: node, txt: txt, wear: wear, equipped: bagLooksEquipped(txt) };
    }
    const imgs = [...doc.querySelectorAll('img,[title],[alt]')];
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i];
      const title = normalizeItemName(el.title || el.alt || '');
      if (!bagRowIsTool(title, wantKind) && !bagRowIsTool(title + ' ' + bagRowBlob(el.parentNode), wantKind)) continue;
      let node = el;
      for (let up = 0; up < 8 && node; up++) {
        const wear = findWearTarget(node, wantKind);
        if (wear) {
          return {
            node: node,
            txt: title || bagRowBlob(node),
            wear: wear,
            equipped: bagLooksEquipped(bagRowBlob(node)),
          };
        }
        node = node.parentNode;
      }
    }
    return null;
  }

  function readEquippedHandTitle() {
    try {
      const tw = getTopWin();
      const names = ['pers', 'persrefr', 'd_pers', 'user'];
      for (let i = 0; i < names.length; i++) {
        try {
          const fr = tw.frames[names[i]];
          const img = fr && fr.document && fr.document.getElementById('IMG_rarm');
          if (img && img.title) return String(img.title);
        } catch (eF) {}
      }
      const img = tw.document && tw.document.getElementById('IMG_rarm');
      if (img && img.title) return String(img.title);
    } catch (e) {}
    return '';
  }

  function handHasTool(wantKind) {
    const t = normalizeItemName(readEquippedHandTitle());
    if (!t) return false;
    return bagRowIsTool(t, wantKind);
  }

  async function equipCraftTool(hintTxt, kind, force) {
    if (!BOT.cfg.forest.equipTool) return false;
    const want = resolveToolWant(hintTxt, kind);
    if (!want) return false;
    const wantKind = want.kind;
    const wantPick = wantKind === 'pick';
    const wantAxe = wantKind === 'axe';
    const wantBasket = wantKind === 'basket';
    if (handHasTool(wantKind)) {
      BOT.state.equippedToolKind = wantKind;
      return true;
    }
    if (BOT.state.equippedToolKind && BOT.state.equippedToolKind !== wantKind) force = true;
    if (!force && BOT.state.equippedToolKind === wantKind) return true;
    if (!force && Date.now() - (BOT.state.lastEquipTryAt || 0) < 8000 && BOT.state.lastEquipTryKind === wantKind) {
      return BOT.state.equippedToolKind === wantKind;
    }
    BOT.state.lastEquipTryAt = Date.now();
    BOT.state.lastEquipTryKind = wantKind;
    const label = want.name;
    log('Инвентарь: ' + label + '…');

    const paths = ['bag_type_17.html', 'bag_type_17_mode_0.html', 'bag.chtml'];
    for (let pi = 0; pi < paths.length; pi++) {
      const ok = await withBagPopup(paths[pi], async function (bagWin) {
        const rows = [...bagWin.document.querySelectorAll('tr')];
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row.querySelector && row.querySelector('tr')) continue;
          const txt = bagRowBlob(row);
          if (!txt || txt.length > 400) continue;
          const wrong =
            (wantPick || wantAxe) && /корзин/i.test(txt)
              ? true
              : wantBasket && (/кирк|топор|kirka|topor/i.test(txt) && !/корзин/i.test(txt))
                ? true
                : wantPick && /топор|topor|axe/i.test(txt) && !/кирк|kirka|рудокоп/i.test(txt)
                  ? true
                  : wantAxe && /кирк|kirka/i.test(txt) && !/топор|topor/i.test(txt);
          if (!wrong) continue;
          const off = findRowAction(row, /снять|unequip|снять\s*в\s*рюкзак/i);
          if (off) {
            off.click();
            log('Снял: ' + txt.replace(/\s+/g, ' ').slice(0, 50));
            await sleep(700);
          }
        }

        const found = findBagToolWear(bagWin.document, wantKind);
        if (found && found.equipped && !found.wear) {
          BOT.state.equippedToolKind = wantKind;
          log('Уже надет: ' + label, 'ok');
          return true;
        }
        if (found && found.wear) {
          if (found.wear.href) {
            try {
              const rel = found.wear.href;
              bagWin.location.href = rel.indexOf('/') === 0 ? rel.slice(1) : rel;
            } catch (eH) {
              try {
                bagWin.location.href = found.wear.href;
              } catch (eH2) {}
            }
          } else if (found.wear.el) {
            found.wear.el.click();
          }
          BOT.state.equippedToolKind = wantKind;
          log('Экипировал: ' + String(found.txt || label).replace(/\s+/g, ' ').slice(0, 70), 'ok');
          await sleep(900);
          return true;
        }
        return false;
      });
      if (ok) return true;
    }
    log('Инструмент в сумке не найден (' + label + ')', 'err');
    return false;
  }

  async function bigForestTryDobycha(win, reason, kind) {
    const me = discoverMeBig(win) || getMe(win);
    const key = me ? me.x + ',' + me.y : 'unk';
    const hintTxtGuard = ((BOT.state.bigForestHint && BOT.state.bigForestHint.txt) || '') + ' ' + (reason || '');
    if (!STRICT_FRONT_RE.test(hintTxtGuard)) {
      log('Большой лес: добыча отмена — нет «прямо перед вами»');
      return false;
    }
    if (BOT.state.bannedAbs.has(key)) {
      log('Большой лес: клетка ' + key + ' в бане — не добываю');
      return false;
    }
    if (BOT.state.lastDobychaKey === key) {
      BOT.state.dobychaFails = (BOT.state.dobychaFails || 0) + 1;
    } else {
      BOT.state.lastDobychaKey = key;
      BOT.state.dobychaFails = 1;
    }
    if (BOT.state.dobychaFails >= 3) {
      BOT.state.bannedAbs.add(key);
      log('Большой лес: бан клетки ' + key + ' (пустая текстура/ошибка)', 'err');
      BOT.state.dobychaFails = 0;
      BOT.state.bigForestHint = null;
      return false;
    }
    const hintTxt = (BOT.state.bigForestHint && BOT.state.bigForestHint.txt) || reason || '';
    const toolKind =
      kind || kindAtCell(win, me && me.x, me && me.y) || craftKindFromHint(BOT.state.bigForestHint);
    let equipped = !BOT.cfg.forest.equipTool;
    try {
      if (BOT.cfg.forest.equipTool) equipped = await equipCraftTool(hintTxt, toolKind, true);
    } catch (eEq) {}
    if (!equipped) {
      log('Большой лес: инструмент не надет — пропускаю добычу @' + key, 'err');
      BOT.state.lastEquipFailAt = Date.now();
      return false;
    }
    log('Большой лес: добыча (' + (reason || 'event') + ') @' + key + (toolKind ? ' ' + toolKind : ''));
    BOT.state.forestTimers.lastCraftAt = Date.now();
    if (typeof win.StartDobycha === 'function') win.StartDobycha();
    else bigForestSend(win, 'actNewMaps-StartDobycha=1');
    await sleep(1500);
    const txt = bigForestReadText(win);
    if (TOOL_NEED_RE.test(txt) && !/нечего добывать/i.test(txt)) {
      log('Большой лес: нужен инструмент — не бан, повтор', 'err');
      BOT.state.equippedToolKind = null;
      BOT.state.dobychaFails = Math.max(0, (BOT.state.dobychaFails || 1) - 1);
      try {
        await equipCraftTool(txt, BASKET_NEED_RE.test(txt) ? 'mushroom' : toolKind || 'copper', true);
      } catch (eEq2) {}
      if (typeof win.StartDobycha === 'function') win.StartDobycha();
      else bigForestSend(win, 'actNewMaps-StartDobycha=1');
      await sleep(1200);
      return true;
    }
    const professionHit = PROFESSION_HINTS.some(function (re) {
      return re.test(txt);
    });
    if (professionHit && !TOOL_NEED_RE.test(txt)) {
      BOT.state.bannedAbs.add(key);
      log('Большой лес: бан ' + key + ' — ' + txt.slice(0, 80), 'err');
      BOT.state.bigForestHint = null;
      return false;
    }
    if (bigForestBusy(win)) {
      BOT.state.dobychaFails = 0;
      // держаться у жилы после добычи
      BOT.state.craftStickUntil = Date.now() + 45000;
      BOT.state.craftStickTarget = {
        x: me ? me.x : null,
        y: me ? me.y : null,
        kind: toolKind || kind || 'copper',
      };
      log('Большой лес: добыча — удерживаю позицию у жилы 45с');
    }
    return true;
  }

  function craftKindFromHint(hint) {
    const t = ((hint && hint.txt) || hint || '') + '';
    const f = BOT.cfg.forest;
    if ((/мед/i.test(t) || t === 'copper') && f.collectCopper) return 'copper';
    if ((/желез/i.test(t) || t === 'iron') && f.collectIron) return 'iron';
    if ((/золот/i.test(t) || t === 'gold') && f.collectGold) return 'gold';
    if ((/сосна|дуб|дерев|ель|листв/i.test(t) || t === 'tree') && f.collectTrees) return 'tree';
    return null;
  }

  /** Поворот по подсказке поиска (слева/справа/сзади) — без ухода с клетки. */
  function naprFromHintDir(win, dir) {
    const cur = currentNapr(win);
    if (dir === 'left') return cur === 1 ? 8 : cur - 1;
    if (dir === 'right') return cur === 8 ? 1 : cur + 1;
    if (dir === 'back') return ((cur + 3) % 8) + 1;
    return cur;
  }

  /** Клик по клетке карты (GotoKletka) — как живой игрок, без кручения на месте. */
  async function clickMapCell(win, x, y) {
    if (x == null || y == null) return false;
    if (isBlockedCell(win, x, y)) {
      const k = kindAtCell(win, x, y);
      if (!(k === 'copper' || k === 'iron' || k === 'gold' || k === 'tree')) return false;
    }
    await gotoWorldCell(win, x, y, 8000);
    return true;
  }

  /** Подойти/развернуться к ресурсу по подсказке поиска через клик по карте. */
  async function faceResourceByHint(win, me, hint, kind) {
    if (!me || !hint) return false;
    const faceN = naprFromHintDir(win, hint.dir);
    const dlt = bigForestNaprDeltas(win);
    const tx = Number(me.x) + dlt.nx[faceN];
    const ty = Number(me.y) + dlt.ny[faceN];
    // если на карте видна жила этого типа рядом — клик к ней
    const near = listBigForestItems(win, 'craft')
      .filter(function (it) {
        if (kind === 'tree') return it.kind === 'tree';
        return it.kind === kind;
      })
      .filter(function (it) {
        return bigForestChebyshev(me.x, me.y, it.x, it.y) <= 3;
      })
      .sort(function (a, b) {
        return bigForestChebyshev(me.x, me.y, a.x, a.y) - bigForestChebyshev(me.x, me.y, b.x, b.y);
      });
    if (near.length) {
      const v = near[0];
      // встать рядом лицом к жиле
      let stand = null;
      for (let n = 1; n <= 8; n++) {
        const sx = Number(v.x) - dlt.nx[n];
        const sy = Number(v.y) - dlt.ny[n];
        if (isBlockedCell(win, sx, sy)) continue;
        const dist = bigForestChebyshev(me.x, me.y, sx, sy);
        if (dist > 3) continue;
        if (!stand || dist < stand.dist) stand = { x: sx, y: sy, n: n, dist: dist };
      }
      if (stand && stand.dist > 0) {
        log('Большой лес: клик к клетке ресурса ' + stand.x + ',' + stand.y + ' (' + kind + ')');
        await clickMapCell(win, stand.x, stand.y);
        turnToFace(win, stand.n);
        BOT.state.wanderNapr = stand.n;
        await sleep(400);
        return true;
      }
      if (stand && stand.dist === 0) {
        turnToFace(win, stand.n);
        BOT.state.wanderNapr = stand.n;
        await sleep(350);
        return true;
      }
    }
    // нет видимой жилы — клик в сторону подсказки + лёгкий поворот
    log('Большой лес: клик по направлению «' + hint.dir + '» → ' + tx + ',' + ty);
    const clicked = await clickMapCell(win, tx, ty);
    turnToFace(win, faceN);
    BOT.state.wanderNapr = faceN;
    await sleep(clicked ? humanDelay(600, 1100) : 400);
    return true;
  }

  async function reactToCraftHint(win, me, hint) {
    if (!hint || !hintFresh(hint, 25000)) return false;
    const kind = craftKindFromHint(hint);
    if (!kind) return false;

    if (hint.front) {
      if (BOT.state.lastEquipFailAt && Date.now() - BOT.state.lastEquipFailAt < 30000) {
        log('Большой лес: нет инструмента, пауза 30с — иду блуждать');
        return false;
      }
      try {
        await equipCraftTool(hint.txt || kind, kind, true);
      } catch (eE) {}
      await bigForestTryDobycha(win, 'перед вами', kind);
      return true;
    }

    // слева / справа / сзади — поворот на месте (givik ChangeNapr), не уход боком
    if (hint.dir === 'left' || hint.dir === 'right' || hint.dir === 'back') {
      const faceN = naprFromHintDir(win, hint.dir);
      log('Большой лес: «' + hint.dir + '» → поворот на месте курс ' + faceN + ' (' + kind + ')');
      try {
        await equipCraftTool(hint.txt || kind, kind, true);
      } catch (eEq) {}
      turnToFace(win, faceN);
      BOT.state.wanderNapr = faceN;
      await sleep(450);
      await bigForestDoSearch(win);
      return true;
    }

    // в радиусе — встать лицом к ближайшей жиле этого типа, потом поиск
    if (hint.dir === 'radius' || hint.dir === 'near' || hint.dir === 'frontish') {
      log('Большой лес: «в радиусе» ' + kind);
      try {
        await equipCraftTool(hint.txt || kind, kind, true);
      } catch (eEq2) {}
      const radius = Math.max(1, Number(BOT.cfg.forest.searchRadius) || 5);
      const veins = listBigForestItems(win, 'craft')
        .filter(function (it) {
          if (kind === 'tree') return it.kind === 'tree';
          if (kind === 'gold') return it.kind === 'gold' || it.kind === 'copper' || it.kind === 'iron';
          return it.kind === kind;
        })
        .filter(function (it) {
          return bigForestChebyshev(me.x, me.y, it.x, it.y) <= radius + 2;
        })
        .sort(function (a, b) {
          return bigForestChebyshev(me.x, me.y, a.x, a.y) - bigForestChebyshev(me.x, me.y, b.x, b.y);
        });
      if (veins.length) {
        const v = veins[0];
        await approachAndFaceVein(win, me, v);
        await bigForestDoSearch(win);
        const after = BOT.state.bigForestHint;
        if (!(after && (after.front || after.dir === 'left' || after.dir === 'right' || after.dir === 'back'))) {
          BOT.state.lastSearchEmpty = true;
        }
        return true;
      }
      // на карте не видно (часто деревья) — поиск с места, без шага на 2 клетки
      await bigForestDoSearch(win);
      return true;
    }
    return false;
  }

  function hookBigForest(win) {
    if (!win) return;
    if (!win.__k5_far_hooked) {
      function ingest(data) {
        if (!data) return;
        const lists = [];
        if (data.add_items && data.add_items.length) lists.push(data.add_items);
        if (data.to_add_items && data.to_add_items.length) lists.push(data.to_add_items);
        for (let L = 0; L < lists.length; L++) {
          const arr = lists[L];
          for (let i = 0; i < arr.length; i++) rememberFarItem(win, arr[i]);
        }
      }
      if (typeof win.Modify_global === 'function') {
        const origG = win.Modify_global;
        win.Modify_global = function (data) {
          try {
            ingest(data);
          } catch (eI) {}
          return origG.apply(this, arguments);
        };
      }
      if (typeof win.Modify_by_flags === 'function') {
        const origF = win.Modify_by_flags;
        win.Modify_by_flags = function (data) {
          try {
            ingest(data);
          } catch (eI2) {}
          return origF.apply(this, arguments);
        };
      }
      win.__k5_far_hooked = true;
    }
    if (win.__k5_om_hooked) return;
    if (typeof win.OpenModal !== 'function') return;
    const orig = win.OpenModal;
    win.OpenModal = function (text, atack, data) {
      try {
        const txt = String(text || '');
        const hint = parseBigForestHint(txt);
        if (hint) {
          BOT.state.bigForestHint = hint;
          log('Большой лес: событие «' + txt.replace(/\s+/g, ' ').slice(0, 90) + '»');
        }
        if (TOOL_NEED_RE.test(txt) || BASKET_NEED_RE.test(txt)) {
          log('Большой лес: ' + txt.replace(/\s+/g, ' ').slice(0, 90), 'err');
          BOT.state.needBasket = BASKET_NEED_RE.test(txt);
        }
      } catch (eH) {}
      return orig.apply(this, arguments);
    };
    win.__k5_om_hooked = true;
  }

  async function newForestTick(win) {
    refreshCfg();
    hookBigForest(win);
    try {
      const modal = win.document && win.document.getElementById('modal_form');
      if (modal && modal.style && modal.style.display === 'block') {
        const mtxt = (modal.innerText || '') + '';
        const hint = parseBigForestHint(mtxt);
        if (hint) BOT.state.bigForestHint = hint;
        if (typeof win.ClickAnswer === 'function') win.ClickAnswer(0);
        else {
          const ov = win.document.getElementById('overlay');
          if (ov) ov.click();
        }
        await sleep(400);
      }
    } catch (eModal) {}

    if (isBattleWin(win)) {
      log('Большой лес: бой');
      await runBattleLoop(win);
      return;
    }

    const me = discoverMeBig(win) || getMe(win);
    if (me) {
      BOT.state.lastStatus = 'NF ' + me.x + ',' + me.y;
      if (!BOT.state.localNapr) setLocalNapr(me.napr || 1);
      updateUi();
    }

    if (bigForestBusy(win)) {
      const we = Number(win.global_data && win.global_data.wait_event);
      BOT.state.craftBusy = we === 3 || we === 4;
      if (!BOT.state.busySince || BOT.state.busyEvent !== we) {
        BOT.state.busySince = Date.now();
        BOT.state.busyEvent = we;
      }
      const age = Date.now() - BOT.state.busySince;
      if (we === 1) {
        log('Большой лес: отмена выхода с карты', 'err');
        bigForestSend(win, 'actNewMaps-CancelEvent=1');
        BOT.state.busySince = 0;
        await sleep(400);
        return;
      }
      const limit = we === 2 ? 45000 : 240000;
      if (age > limit) {
        log('Большой лес: событие wait=' + we + ' зависло — отмена', 'err');
        bigForestSend(win, 'actNewMaps-CancelEvent=' + (we === 4 ? 3 : we));
        BOT.state.busySince = 0;
        await sleep(400);
        return;
      }
      log('Событие wait=' + we + '…');
      BOT.state.idleWatch = { key: '', since: Date.now() };
      await sleep(humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax));
      return;
    }
    BOT.state.craftBusy = false;
    BOT.state.busySince = 0;

    const g = win.global_data && win.global_data.my_group;
    if (g && Number(g.stay) === 0) {
      const meNow = discoverMeBig(win) || getMe(win);
      const key = meNow ? meNow.x + ',' + meNow.y : '';
      if (!BOT.state.moveWatch || BOT.state.moveWatch.key !== key) {
        BOT.state.moveWatch = { key: key, since: Date.now() };
        await sleep(400);
        return;
      }
      if (Date.now() - BOT.state.moveWatch.since < 2800) {
        await sleep(400);
        return;
      }
      log('Большой лес: ход завис (stay=0) — отмена', 'err');
      bigForestSend(win, 'actNewMaps-GotoKletka=0');
      BOT.state.moveWatch = null;
      const bounce = chooseDetour(win, meNow, currentNapr(win));
      BOT.state.wanderNapr = bounce;
      turnToFace(win, bounce);
      await sleep(250);
      return;
    }
    BOT.state.moveWatch = null;

    if (!me) {
      await sleep(1000);
      return;
    }

    adoptManualFacing(win);

    const idleKey = me.x + ',' + me.y;
    if (!BOT.state.idleWatch || BOT.state.idleWatch.key !== idleKey) {
      BOT.state.idleWatch = { key: idleKey, since: Date.now() };
    } else if (Date.now() - BOT.state.idleWatch.since > 12000) {
      if (
        Date.now() < (BOT.state.craftStickUntil || 0) ||
        (hintFresh(BOT.state.bigForestHint, 20000) && BOT.state.bigForestHint && BOT.state.bigForestHint.front)
      ) {
        BOT.state.idleWatch = { key: idleKey, since: Date.now() };
      } else {
        log('Большой лес: стою на месте >12с — срыв и новый курс', 'err');
        bigForestSend(win, 'actNewMaps-GotoKletka=0');
        const bounce = chooseDetour(win, me, currentNapr(win));
        BOT.state.wanderNapr = bounce;
        BOT.state.idleWatch = { key: idleKey, since: Date.now() };
        turnToFace(win, bounce);
        await faceAndStep(win, bounce, 'unstick');
        return;
      }
    }

    await ensureWideView(win);

    const goto = BOT.state.gotoTarget;
    if (goto && goto.x != null && goto.y != null) {
      const gx = Number(goto.x);
      const gy = Number(goto.y);
      let gd = bigForestChebyshev(me.x, me.y, gx, gy);
      if (gd === 0) {
        log('Большой лес: точка ' + gx + ',' + gy + ' достигнута', 'ok');
        BOT.state.gotoTarget = null;
      } else {
        log('Большой лес: к точке ' + gx + ',' + gy + ' (осталось ' + gd + ')');
        let progressed = false;
        // несколько длинных переходов подряд без паузы тика — плавнее, чем шаг-пауза-шаг
        for (let hop = 0; hop < 16 && BOT.state.gotoTarget; hop++) {
          const meHop = discoverMeBig(win) || getMe(win);
          if (!meHop) break;
          gd = bigForestChebyshev(meHop.x, meHop.y, gx, gy);
          if (gd === 0) {
            log('Большой лес: точка ' + gx + ',' + gy + ' достигнута', 'ok');
            BOT.state.gotoTarget = null;
            return;
          }
          const beforeKey = meHop.x + ',' + meHop.y;
          const okGo = await walkToward(
            win,
            { x: gx, y: gy, kind: 'goto', key: gx + ',' + gy },
            'точка',
            false
          );
          if (!okGo) break;
          const meAfter = discoverMeBig(win) || getMe(win);
          if (meAfter && meAfter.x + ',' + meAfter.y !== beforeKey) {
            progressed = true;
          } else {
            break;
          }
        }
        if (BOT.state.gotoTarget && !progressed) {
          log('Большой лес: к точке ' + gx + ',' + gy + ' нет шага — стоп точки', 'err');
          BOT.state.gotoTarget = null;
        }
        return;
      }
    }

    const txtModal = (function () {
      try {
        const modal = win.document.getElementById('modal_form');
        const vis = modal && modal.style && modal.style.display === 'block';
        return vis ? String(modal.innerText || '') : '';
      } catch (eM) {
        return '';
      }
    })();
    const txt = bigForestReadText(win);
    const parsed = parseBigForestHint(txtModal || txt);
    if (parsed) BOT.state.bigForestHint = parsed;
    // корзина — только по модалке/явному флагу, не по чату (иначе ложные срабатывания)
    if (BASKET_NEED_RE.test(txtModal) || BOT.state.needBasket) {
      BOT.state.needBasket = false;
      BOT.state.equippedToolKind = null;
      log('Большой лес: нужна корзина грибника', 'err');
      try {
        await equipCraftTool(txtModal, 'mushroom', true);
      } catch (eBask) {}
    }

    const needCraft = forestNeedsCraftSearch();
    const wantStep = forestWantsStepOn();
    const every = Math.max(1, Number(BOT.cfg.forest.searchEverySteps) || 5);
    const stepItems = wantStep
      ? listAllStepItems(win).filter(function (it) {
          return !forestIsSkipped(stepItemKey(it));
        })
      : [];
    const craftItems = needCraft ? listBigForestItems(win, 'craft') : [];
    const hint = BOT.state.bigForestHint;
    const craftKind = craftKindFromHint(hint);
    const ahead = cellAhead(win, me, currentNapr(win));
    const aheadKind = kindAtCell(win, ahead.x, ahead.y);
    const f = BOT.cfg.forest;

    if (wantStep) {
      const nM = stepItems.filter(function (it) {
        return it.kind === 'mushroom';
      }).length;
      const nH = stepItems.filter(function (it) {
        return it.kind === 'herb';
      }).length;
      if ((nM || nH) && (BOT.state.stepsSinceSearch || 0) % 2 === 0) {
        log(
          'Большой лес: вижу грибы ×' +
            nM +
            (f.collectHerbs ? ', травы ×' + nH : '') +
            (stepItems.some(function (s) {
              return s.fromRadar;
            })
              ? ' (радар)'
              : '')
        );
      }
    }

    // 1) реакция на поиск: «перед вами» / «слева» / «в радиусе» — раньше трав и блуждания
    if (
      needCraft &&
      hintFresh(hint, 25000) &&
      craftKind &&
      !(BOT.state.lastSearchEmpty || (BOT.state.lastEquipFailAt && Date.now() - BOT.state.lastEquipFailAt < 30000))
    ) {
      const reacted = await reactToCraftHint(win, me, hint);
      if (reacted) return;
    }

    // 1b) запас: «прямо перед вами» без распознанного kind — по клетке впереди
    if (needCraft && hintFresh(hint) && hint.front) {
      const mineKind = craftKind || aheadKind;
      if (mineKind === 'copper' || mineKind === 'iron' || mineKind === 'gold' || mineKind === 'tree') {
        if (BOT.state.lastEquipFailAt && Date.now() - BOT.state.lastEquipFailAt < 30000) {
          log('Большой лес: нет инструмента, пауза 30с — иду блуждать');
        } else {
          await bigForestTryDobycha(win, 'перед вами', mineKind);
          return;
        }
      }
    }

    // держаться у жилы после удачной добычи — не уходить бродить / на радар
    if (needCraft && BOT.state.craftStickTarget && Date.now() < (BOT.state.craftStickUntil || 0)) {
      const t = BOT.state.craftStickTarget;
      if (t.x != null && t.y != null) {
        const dStick = bigForestChebyshev(me.x, me.y, t.x, t.y);
        if (dStick === 0) {
          const ak = aheadKind || t.kind;
          if (ak === 'copper' || ak === 'iron' || ak === 'gold' || ak === 'tree') {
            await bigForestDoSearch(win);
            const hStick = parseBigForestHint(bigForestReadText(win)) || BOT.state.bigForestHint;
            if (hStick && hStick.front) {
              BOT.state.bigForestHint = hStick;
              if (BOT.state.lastEquipFailAt && Date.now() - BOT.state.lastEquipFailAt < 30000) {
                log('Большой лес: нет инструмента, пауза 30с — иду блуждать');
              } else {
                await bigForestTryDobycha(win, 'перед вами', t.kind || ak);
              }
            }
            return;
          }
        } else if (dStick <= 2) {
          log('Большой лес: возвращаюсь к жиле @' + t.x + ',' + t.y);
          await approachAndFaceVein(win, me, t);
          return;
        } else {
          BOT.state.craftStickTarget = null;
        }
      }
    } else if (BOT.state.craftStickTarget && Date.now() >= (BOT.state.craftStickUntil || 0)) {
      BOT.state.craftStickTarget = null;
    }

    // 2) Травы/грибы раньше руды. Одна цель до сбора — иначе радар дёргает туда-сюда.
    if (wantStep && stepItems.length) {
      const it = pickStickyStepItem(win, me, stepItems);
      if (it) {
        const d = bigForestChebyshev(me.x, me.y, it.x, it.y);
        const visKind = kindAtCell(win, it.x, it.y);
        if (d === 0) {
          if ((it.kind === 'mushroom' || visKind === 'mushroom') && BOT.state.equippedToolKind !== 'basket') {
            try {
              await equipCraftTool('корзина грибника', 'mushroom');
            } catch (eEqM) {}
          }
          log('Большой лес: стою на ' + it.kind + ' @' + it.key + ' — шаг для подбора');
          forgetStepCell(it, 90000);
          await faceAndStep(win, BOT.state.wanderNapr || currentNapr(win), 'step-on', it);
          return;
        }
        if ((it.kind === 'mushroom' || visKind === 'mushroom') && BOT.state.equippedToolKind !== 'basket') {
          try {
            await equipCraftTool('корзина грибника', 'mushroom');
          } catch (eEqM2) {}
        }
        const ok = await walkToward(win, it, it.kind, false);
        if (ok) return;
        forgetStepCell(it, 30000);
        log('Большой лес: к ' + it.kind + ' @' + it.key + ' нет пути — пропуск');
      }
    }

    // 3) пустой поиск (нет «в радиусе 5») — уходим на 6–8 клеток, не сканируем соседние текстуры
    if (
      needCraft &&
      (BOT.state.lastSearchEmpty ||
        (hintFresh(BOT.state.bigForestHint, 8000) &&
          BOT.state.bigForestHint &&
          BOT.state.bigForestHint.dir === 'radius' &&
          !BOT.state.bigForestHint.front))
    ) {
      await leaveEmptySearchArea(win, me);
      return;
    }

    // 5) Поиск каждые N шагов
    if (needCraft && BOT.cfg.forest.autoSearch && (BOT.state.stepsSinceSearch || 0) >= every) {
      await bigForestDoSearch(win);
      return;
    }

    // 6) Блуждание: держим курс (startDir / holdCourse). Меняем только у перманентного препятствия.
    if (!BOT.state.wanderNapr) BOT.state.wanderNapr = naprFromStartDir(win) || currentNapr(win);
    const hold = BOT.cfg.forest.holdCourse !== false;
    if (!hold && Math.random() < 0.03) {
      BOT.state.wanderNapr = ((BOT.state.wanderNapr + (BOT.state.wanderBias || 1) - 1 + 8) % 8) + 1;
    }
    if (hold && Date.now() > (BOT.state.holdDetourUntil || 0)) {
      const preferred = naprFromStartDir(win);
      if (preferred >= 1 && preferred <= 8 && hopFreeLen(win, me, preferred, 8) >= 6) {
        BOT.state.wanderNapr = preferred;
      }
    }
    let wn = BOT.state.wanderNapr;
    let lastGood = hopFreeEnd(win, me, wn, 8);
    if (lastGood.x === Number(me.x) && lastGood.y === Number(me.y)) {
      const alt = bestEscapeNapr(win, me, wn);
      log('Большой лес: упёрся, скольжение курс ' + wn + ' → ' + alt);
      BOT.state.wanderNapr = alt;
      markHoldDetour();
      wn = alt;
      lastGood = hopFreeEnd(win, me, wn, 8);
    }
    if (lastGood.x !== Number(me.x) || lastGood.y !== Number(me.y)) {
      const after = await gotoWorldCell(win, lastGood.x, lastGood.y);
      if (after && Number(after.x) === Number(me.x) && Number(after.y) === Number(me.y)) {
        const bounce = bestEscapeNapr(win, me, wn);
        log('Большой лес: не сдвинулся к ' + lastGood.x + ',' + lastGood.y + ' — курс ' + bounce, 'err');
        BOT.state.wanderNapr = bounce;
        markHoldDetour();
        turnToFace(win, bounce);
      }
    } else {
      await faceAndStep(win, wn, 'wander');
    }
  }

  function listBots(win) {
    win = win || getActWin();
    const bots = win.gd && win.gd.bots;
    if (!bots) return [];
    if (Array.isArray(bots)) return bots.filter(Boolean);
    return Object.keys(bots)
      .map(function (k) {
        return bots[k];
      })
      .filter(Boolean);
  }

  function botPos(b) {
    if (!b) return null;
    const x = Number(b.stay == 0 && b.n_posx != null ? b.n_posx : b.pos_x);
    const y = Number(b.stay == 0 && b.n_posy != null ? b.n_posy : b.pos_y);
    if (!x || !y) return null;
    return {
      x: x,
      y: y,
      abs: Number(b.abs_pos) || (y - 1) * 25 + x,
      id: b.bot_id || b.id,
      napr: b.napr,
      stay: b.stay,
      lvl: b.lvl,
      imgType: b.imgType,
    };
  }

  function getMe(win) {
    win = win || getActWin();
    if (BOT.state.meId == null) {
      try {
        const saved = GM_getValue('meBotId', null);
        if (saved) BOT.state.meId = saved;
      } catch (e) {}
    }
    if (BOT.state.meId != null) {
      const bots = listBots(win).map(botPos).filter(Boolean);
      const found = bots.find(function (b) {
        return String(b.id) === String(BOT.state.meId);
      });
      if (found) {
        BOT.state.me = found;
        return found;
      }
    }
    return BOT.state.me;
  }

  function setMe(bot) {
    if (!bot) return;
    const p = botPos(bot) || bot;
    BOT.state.me = p;
    BOT.state.meId = p.id || bot.bot_id || bot.id;
    try {
      GM_setValue('meBotId', String(BOT.state.meId));
    } catch (e) {}
    log('Я: id=' + BOT.state.meId + ' @' + p.x + ',' + p.y, 'ok');
  }

  function dismissModal(win) {
    win = win || getActWin();
    try {
      const doc = win.document;
      const modal = doc.getElementById('modal_form');
      const overlay = doc.getElementById('overlay');
      const btn = doc.getElementById('closeBut');
      const visible =
        (modal && modal.style && modal.style.display === 'block') ||
        (overlay && overlay.style && overlay.style.display && overlay.style.display !== 'none');
      if (!visible && !(btn && btn.offsetParent !== null)) return false;
      if (typeof win.cc === 'function') {
        win.cc(0);
        return true;
      }
      if (btn) {
        btn.click();
        return true;
      }
    } catch (e) {}
    return false;
  }

  function hookForest(win) {
    win = win || getActWin();
    if (!win || typeof win.f3 !== 'function' || win.__k5_f3_hooked) return;
    const orig = win.f3;
    win.__k5bot_msgs = win.__k5bot_msgs || [];
    win.f3 = function (data) {
      try {
        if (data && data.txt) {
          const txt = String(data.txt);
          win.__k5bot_msgs.push({ t: Date.now(), txt: txt, type: data.textType });
          if (data.textType === 2 || data.textType === 3) BOT.state.craftBusy = false;
          if (/травм|перелом|вывих|ран/i.test(txt)) {
            BOT.state.injury = true;
            if (!BOT.state.injurySince) BOT.state.injurySince = Date.now();
          }
          if (/перед вами|слева|справа|радиус|не найден|нет ресурс|бревн|руд/i.test(txt)) {
            let dir = null;
            if (/перед вами/i.test(txt)) dir = 'front';
            else if (/слева/i.test(txt)) dir = 'left';
            else if (/справа/i.test(txt)) dir = 'right';
            else if (/радиус/i.test(txt)) dir = 'radius';
            else if (/не найден|нет /i.test(txt)) dir = 'none';
            BOT.state.searchHint = { t: Date.now(), dir: dir, txt: txt };
          }
          if (/введите код с картинки|код с картинки|капча/i.test(txt) && anyCaptchaVisible()) {
            onCaptchaDetected(txt);
          }
          setTimeout(function () {
            dismissModal(win);
          }, 400);
          setTimeout(function () {
            dismissModal(win);
          }, 900);
        }
        if (data && data.craft_start) {
          BOT.state.craftBusy = true;
          log('Крафт: ' + (data.craft_res || '') + ' ~' + data.craft_finished + 'с', 'ok');
        }
        // Свой bot_data после хода → запомнить meId (важно в большом лесу с кучей игроков)
        if (
          data &&
          data.bot_data &&
          data.bot_data.bot_id != null &&
          !data.bot_data.bot_init &&
          BOT.state.expectMoveAt &&
          Date.now() - BOT.state.expectMoveAt < 2500
        ) {
          BOT.state.learnedMeId = data.bot_data.bot_id;
          if (BOT.state.meId == null) {
            try {
              setMe(botPos(data.bot_data) || { id: data.bot_data.bot_id });
            } catch (eMe) {}
          }
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
    win.__k5_f3_hooked = true;
    log('Хук f3 OK', 'ok');
  }

  function pullLogs(win) {
    win = win || getActWin();
    const msgs = win.__k5bot_msgs || [];
    win.__k5bot_msgs = [];
    const errors = [];
    msgs.forEach(function (m) {
      log((m.type === 3 ? '⚠ ' : '· ') + m.txt, m.type === 3 ? 'err' : 'info');
      if (m.type === 3) errors.push(String(m.txt || ''));
    });
    return errors;
  }

  function listTargets(win) {
    win = win || getActWin();
    if (!win.gd) return [];
    const types = selectedTypes();
    const out = [];
    const banned = BOT.state.bannedAbs;
    const bannedTypes = BOT.state.bannedTypes;
    (win.gd.add_items || []).forEach(function (it) {
      if (!it) return;
      const img = Number(it.imgType);
      const abs = parseInt(it.abs_pos, 10);
      if (banned.has(String(abs))) return;
      if (bannedTypes.has(img)) return;
      if (!types.has(img)) return;
      out.push({ abs: abs, x: Number(it.pos_x), y: Number(it.pos_y), imgType: img });
    });
    return out;
  }

  function nearestTarget(mePos, targets) {
    let best = null;
    let bestD = 1e9;
    targets.forEach(function (t) {
      const d = Math.abs(t.x - mePos.x) + Math.abs(t.y - mePos.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    });
    return best;
  }

  function goToAbs(win, abs) {
    win = win || getActWin();
    abs = parseInt(abs, 10);
    if (!forestReady(win) || !abs) return false;
    BOT.state.expectMoveAt = Date.now();
    try {
      win.cu.selected = abs;
      win.cu.send('actHunter-StartCraft=' + abs);
    } catch (e) {
      log('send fail: ' + e.message, 'err');
      return false;
    }
    try {
      const canvas = win.document.getElementById('canvas');
      if (canvas) {
        const idx = abs >= 1 ? abs - 1 : abs;
        const y = Math.floor(idx / 25);
        const x = idx % 25;
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + x * 35 + 17;
        const cy = rect.top + y * 35 + 17;
        const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, view: win };
        canvas.dispatchEvent(new MouseEvent('click', opts));
        canvas.dispatchEvent(new MouseEvent('dblclick', opts));
      }
    } catch (e) {}
    return true;
  }

  async function discoverMe(win) {
    win = win || getActWin();
    if (!forestReady(win)) {
      log('cu/gd нет — зайдите в большой лес (ворота / фортпост / телепорт), затем Старт', 'err');
      return null;
    }
    if (isBigForestWin(win)) {
      const me = discoverMeBig(win);
      if (me) return me;
      log('Большой лес: жду my_group…', 'err');
      return null;
    }
    const existing = getMe(win);
    if (existing) return existing;

    const uid =
      getUserId() ||
      readCookie('UserID', win) ||
      readCookie('UserID', getTopWin()) ||
      (win.cu && (win.cu.UserID || win.cu.user_id));
    const bots = listBots(win);
    const posList = bots.map(botPos).filter(Boolean);

    // 1) bot_id == UserID (так устроен клиент леса)
    if (uid != null) {
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        if (!b) continue;
        const id = b.bot_id != null ? b.bot_id : b.id;
        if (String(id) === String(uid)) {
          setMe(botPos(b) || { id: id, x: b.pos_x, y: b.pos_y });
          return BOT.state.me;
        }
      }
      // иногда bot_id лежит ключом объекта
      try {
        if (win.gd.bots && win.gd.bots[uid]) {
          setMe(botPos(win.gd.bots[uid]));
          return BOT.state.me;
        }
      } catch (e) {}
    }

    if (!posList.length) {
      log('На карте нет персонажей — подождите загрузку леса и нажмите «Найти себя»', 'err');
      return null;
    }
    if (posList.length === 1) {
      setMe(posList[0]);
      return BOT.state.me;
    }

    // 2) движение: кто отреагировал на шаг — тот мы
    const snap = {};
    posList.forEach(function (b) {
      snap[String(b.id)] = b.x + ',' + b.y;
    });
    BOT.state.expectMoveAt = Date.now();
    const destAbs = 314;
    const destX = ((destAbs - 1) % 25) + 1;
    const destY = Math.floor((destAbs - 1) / 25) + 1;
    goToAbs(win, destAbs);
    await sleep(1400);
    const after = listBots(win).map(botPos).filter(Boolean);
    let best = null;
    let bestScore = -1;
    after.forEach(function (b) {
      const prev = snap[String(b.id)];
      if (!prev) return;
      const parts = prev.split(',');
      const px = Number(parts[0]);
      const py = Number(parts[1]);
      if (px === b.x && py === b.y) return;
      const beforeD = Math.abs(px - destX) + Math.abs(py - destY);
      const afterD = Math.abs(b.x - destX) + Math.abs(b.y - destY);
      const score = beforeD - afterD;
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    });
    // 3) bot_data type=1/2 после своего хода
    if (!best && BOT.state.learnedMeId != null) {
      best = after.find(function (b) {
        return String(b.id) === String(BOT.state.learnedMeId);
      });
    }
    if (best) {
      setMe(best);
      return BOT.state.me;
    }
    log('Не удалось определить персонажа — нажмите «Найти себя» ещё раз', 'err');
    return null;
  }

  function applyErrorBans(errors, target) {
    if (!errors.length || !target) return;
    const joined = errors.join(' ');
    if (!PROFESSION_HINTS.some(function (re) {
      return re.test(joined);
    }))
      return;
    BOT.state.bannedAbs.add(String(target.abs));
    if (/рудокоп/i.test(joined)) {
      [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].forEach(function (t) {
        BOT.state.bannedTypes.add(t);
      });
      log('Бан руды (нужен Рудокоп)');
    }
    if (/дровосек|лесоруб/i.test(joined)) {
      [1, 2, 3, 4, 5, 6].forEach(function (t) {
        BOT.state.bannedTypes.add(t);
      });
      log('Бан деревьев (нужен Лесоруб)');
    }
    if (/травник/i.test(joined)) {
      for (let i = 19; i <= 39; i++) BOT.state.bannedTypes.add(i);
      log('Бан трав (нужен Травник)');
    }
  }

  function clickSearchUi(win) {
    win = win || getActWin();
    const nodes = [
      ...win.document.querySelectorAll('input[type=button],input[type=submit],button,a,img,[onclick]'),
    ];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const t = (n.value || '') + ' ' + (n.title || '') + ' ' + (n.alt || '') + ' ' + (n.textContent || '');
      if (/поиск|искать/i.test(t)) {
        n.click();
        return t.trim().slice(0, 60);
      }
    }
    try {
      win.cu.send('actHunter-Search=1');
    } catch (e) {}
    return null;
  }

  async function followSearchHint(win, me, hint) {
    if (!hint || !hint.dir || hint.dir === 'none') return false;
    let napr = me.napr || 1;
    if (hint.dir === 'left') napr = napr === 1 ? 8 : napr - 1;
    if (hint.dir === 'right') napr = napr === 8 ? 1 : napr + 1;
    if (hint.dir === 'front' || hint.dir === 'left' || hint.dir === 'right') {
      if (hint.dir === 'left') {
        try {
          win.cu.send('actHunter-Key=37');
        } catch (e) {}
        await sleep(300);
      } else if (hint.dir === 'right') {
        try {
          win.cu.send('actHunter-Key=39');
        } catch (e) {}
        await sleep(300);
      }
      const x = me.x + (NX[napr] || 0);
      const y = me.y + (NY[napr] || 0);
      if (x < 1 || x > 25 || y < 1 || y > 25) return false;
      const abs = (y - 1) * 25 + x;
      log('Поиск → ' + hint.dir + ' ' + x + ',' + y);
      goToAbs(win, abs);
      return true;
    }
    if (hint.dir === 'radius') {
      const abs = Math.max(1, Math.min(625, me.abs + rand(-5, 5) * 25 + rand(-5, 5)));
      goToAbs(win, abs);
      return true;
    }
    return false;
  }

  /* ---------- inventory (navigate d_act temporarily) ---------- */
  async function withBagPage(path, fn) {
    const win = getActWin();
    if (!win) {
      log('bag: нет d_act', 'err');
      return null;
    }
    let backHref = '';
    try {
      backHref = String(win.location.href || '');
    } catch (e) {}
    const backFile = (backHref.split('/').pop() || 'forest.html').split('#')[0];
    if (!go(win, path)) return null;
    await sleep(1200);
    let result = null;
    try {
      result = await fn(getActWin());
    } catch (e) {
      log('bag: ' + (e.message || e), 'err');
    }
    // Вернуться на ТОТ ЖЕ URL (большой лес), а не форсить городской forest.html
    const restore =
      backHref && /5kings\.ru/i.test(backHref)
        ? backHref.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '') || backFile
        : backFile;
    go(getActWin(), restore);
    await sleep(1800);
    const w2 = getActWin();
    if (w2) hookForest(w2);
    return result;
  }

  async function equipTool() {
    if (!BOT.cfg.forest.equipTool) return false;
    // старый путь (городской лес) — только топор/кирка/корзина, без «любого Одеть»
    return equipCraftTool('инструмент', 'copper', false);
  }

  async function useHealScroll() {
    log('Инвентарь: свиток лечения…');
    return withBagPage('bag_type_12_mode_0.html', async function (win) {
      const rows = [...win.document.querySelectorAll('tr')];
      // предпочитаем «тяжёлой»
      const scored = rows
        .map(function (row) {
          const txt = (row.innerText || '').toLowerCase();
          if (!/лечен|перелом|травм|восстанов|свиток/.test(txt)) return null;
          let score = 1;
          if (/тяжел|тяжёл/.test(txt)) score = 3;
          else if (/средн/.test(txt)) score = 2;
          return { row: row, txt: txt, score: score };
        })
        .filter(Boolean)
        .sort(function (a, b) {
          return b.score - a.score;
        });
      for (let i = 0; i < scored.length; i++) {
        const btn = scored[i].row.querySelector(
          'input[value*="Использовать"], input[value*="Юзать"], a[href*="Use"], *[onclick*="Use"]'
        );
        if (btn) {
          btn.click();
          log('Свиток: ' + scored[i].txt.slice(0, 80), 'ok');
          await sleep(900);
          return true;
        }
      }
      log('Свиток лечения не найден', 'err');
      return false;
    });
  }

  async function tryHealAbility(win) {
    win = win || getActWin();
    const aid = String(BOT.cfg.forest.healAbilityId || '').trim();
    const nodes = [...win.document.querySelectorAll('input,button,a,[onclick],[href]')];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const blob =
        (n.value || '') +
        ' ' +
        (n.title || '') +
        ' ' +
        (n.textContent || '') +
        ' ' +
        (n.getAttribute('onclick') || '') +
        ' ' +
        (n.getAttribute('href') || '');
      const t = blob.toLowerCase();
      if (aid && blob.indexOf(aid) >= 0) {
        n.click();
        log('Абилка лечения id=' + aid, 'ok');
        return true;
      }
      if (!aid && /лечен.*травм|вылеч|исцел/.test(t) && !/свиток/.test(t)) {
        n.click();
        log('Абилка лечения: ' + t.slice(0, 60), 'ok');
        return true;
      }
    }
    return false;
  }

  async function maybeHeal(win) {
    if (!BOT.cfg.forest.autoHeal) return;
    if (!BOT.state.injury) return;
    const mode = BOT.cfg.forest.healMode || 'auto';
    log('Травма — режим ' + mode);
    if (mode === 'wait') {
      const left = BOT.cfg.forest.injuryWaitMs - (Date.now() - (BOT.state.injurySince || Date.now()));
      if (left > 0) {
        log('Жду заживления ~' + Math.ceil(left / 1000) + 'с');
        await sleep(Math.min(left, 15000));
        return;
      }
      BOT.state.injury = false;
      BOT.state.injurySince = 0;
      return;
    }
    if (mode === 'ability' || mode === 'auto') {
      if (await tryHealAbility(win)) {
        BOT.state.injury = false;
        BOT.state.injurySince = 0;
        await sleep(1000);
        return;
      }
      if (mode === 'ability') return;
    }
    // scroll / auto fallback
    const ok = await useHealScroll();
    if (ok) {
      BOT.state.injury = false;
      BOT.state.injurySince = 0;
    } else if (mode === 'auto') {
      log('Нет свитка — жду заживления');
      await sleep(Math.min(BOT.cfg.forest.injuryWaitMs, 20000));
    }
  }

  /* ---------- battle ---------- */
  function readTurnTimerSec(win) {
    win = win || getActWin();
    try {
      const el =
        (win.document && (win.document.getElementById('time_left') || win.document.getElementById('time_left')));
      const t = String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
      if (!t) return null;
      const m = t.match(/(\d+)\s*:\s*(\d+)/);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
      const n = Number(t.replace(',', '.'));
      if (isFinite(n) && n > 0 && n < 600) return Math.floor(n);
    } catch (e) {}
    return null;
  }

  function isBattleWin(win) {
    win = win || getActWin();
    try {
      if (typeof win.MakeTurn !== 'function' || typeof win.ubkick !== 'function') return false;
      if (!win.BID) return false;
      const label = ((win.document.getElementById('TurnLabel') || {}).innerText || '');
      if (/чужой бой|просмотр/i.test(label)) return false;
      return !!(win.ME || win.document.getElementById('mapCanvas') || win.document.getElementById('d_ub'));
    } catch (e) {
      return false;
    }
  }

  function getBattleState(win) {
    win = win || getActWin();
    const me = win.ME || null;
    const unbs = win.UNBS || {};
    const enemies = [];
    const allies = [];
    if (me) {
      Object.keys(unbs).forEach(function (id) {
        const u = unbs[id];
        if (!u || u.hp <= 0) return;
        const row = {
          id: isNaN(Number(id)) ? id : Number(id),
          nk: u.nk,
          hp: u.hp,
          mhp: u.mhp,
          x: u.x,
          y: u.y,
          rrg: u.rrg,
          sd: u.sd,
        };
        if (u.sd === me.sd) allies.push(row);
        else enemies.push(row);
      });
    }
    const turnLabel = ((win.document.getElementById('TurnLabel') || {}).innerText || '');
    const turnLeftSec = readTurnTimerSec(win);
    const yourTurn = /ваш ход/i.test(turnLabel);
    const spectate = /чужой бой|просмотр/i.test(turnLabel);
    const loading = /загрузк/i.test(turnLabel);
    return {
      ready: !!(win.BID && me && !spectate),
      myTurn: !!(me && me.md == 0 && !win.ReloadReq && !loading && !spectate && yourTurn),
      yourTurn: yourTurn,
      spectate: spectate,
      loading: loading,
      battleOver: spectate || /бой окончен|победа|поражение|закончил/i.test(turnLabel),
      turnLabel: turnLabel,
      turnLeftSec: turnLeftSec,
      hp: me ? me.hp : 0,
      mhp: me ? me.mhp : 0,
      mp: me ? me.mp : 0,
      tn: me ? me.tn : 0,
      rrg: me ? me.rrg : 1,
      lrg: me ? me.lrg : 1,
      immobilized: !!(me && me.flg & 0x4000),
      enemies: enemies,
      allies: allies,
    };
  }

  function pickWeightedZone() {
    let sum = 0;
    ZONE_WEIGHTS.forEach(function (w) {
      sum += w;
    });
    let r = Math.random() * sum;
    for (let i = 0; i < ZONES.length; i++) {
      r -= ZONE_WEIGHTS[i];
      if (r <= 0) return ZONES[i];
    }
    return 1;
  }

  function pickSummonHex(win, enemy) {
    const me = win.ME;
    const ub = win.UNBS[enemy.id] || win.UNBS[String(enemy.id)];
    if (!me || !ub || typeof win.HexDistance !== 'function') return null;

    function occupied(x, y) {
      try {
        if (me && Number(me.x) === Number(x) && Number(me.y) === Number(y)) return true;
      } catch (eMe) {}
      try {
        const unbs = win.UNBS || {};
        const ids = Object.keys(unbs);
        for (let i = 0; i < ids.length; i++) {
          const u = unbs[ids[i]];
          if (!u || Number(u.hp) <= 0) continue;
          if (Number(u.x) === Number(x) && Number(u.y) === Number(y)) return true;
        }
      } catch (eU) {}
      if (typeof win.CalcAbsPos === 'function' && win.AbsPosUnbs) {
        try {
          const abs = win.CalcAbsPos({ x: x, y: y });
          const cell = win.AbsPosUnbs[abs];
          if (cell && (cell.objType === 1 || cell.id || cell.unb || cell.bot)) return true;
        } catch (e) {}
      }
      return false;
    }

    const banned = BOT.state.bannedSummonHex || {};
    let best = null;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const x = Number(ub.x) + dx;
        const y = Number(ub.y) + dy;
        if (x < 0 || y < 0) continue;
        const key = x + ',' + y;
        if (banned[key] && Date.now() < banned[key]) continue;
        const occ = BOT.state.occupiedCells || {};
        if (occ[key] && Date.now() < occ[key]) continue;
        let hd = 99;
        try {
          hd = win.HexDistance(x, y, ub.x, ub.y);
        } catch (eH) {
          continue;
        }
        if (hd !== 1) continue;
        if (occupied(x, y)) continue;
        const dMe = win.HexDistance(me.x, me.y, x, y);
        const row = { x: x, y: y, dMe: dMe, dEn: 1 };
        if (!best || dMe < best.dMe || (dMe === best.dMe && Math.random() < 0.35)) best = row;
      }
    }
    return best;
  }

  function banSummonHex(hex, ms) {
    if (!hex || hex.x == null) return;
    if (!BOT.state.bannedSummonHex) BOT.state.bannedSummonHex = {};
    if (!BOT.state.occupiedCells) BOT.state.occupiedCells = {};
    const key = hex.x + ',' + hex.y;
    const until = Date.now() + (ms || 45000);
    BOT.state.bannedSummonHex[key] = until;
    BOT.state.occupiedCells[key] = until;
  }

  async function waitMagselectResult(selWin, battleWin, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 7000);
    while (Date.now() < deadline) {
      try {
        if (!selWin || selWin.closed) return 'closed';
        let body = '';
        let href = '';
        try {
          body = (selWin.document && selWin.document.body && (selWin.document.body.innerText || '')) || '';
        } catch (eB) {}
        try {
          href = String((selWin.location && selWin.location.href) || '');
        } catch (eH) {}
        // overlay = modal only (body UI has «свободн/выбер» на гексах → false positive)
        const overlayTxt = battleOverlayErrorText(selWin) + ' ' + battleOverlayErrorText(battleWin);
        const errTxt = overlayTxt + ' ' + body;
        if (
          isBusyHexError(overlayTxt) ||
          /занят|невозмож|ошибка|error|busy/i.test(errTxt) ||
          consumeBusyAlert()
        ) {
          return 'occupied';
        }
        if (/magbook\.chtml/i.test(href) && !/magselect/i.test(href)) return 'ok';
        if (!/magselect/i.test(href) && body.trim().length < 8) return 'ok';
      } catch (_) {}
      await sleep(300);
    }
    return 'timeout';
  }

  function battleOverlayErrorText(win) {
    // только modal/overlay — не body (в сетке боя слова «свободн/выбер» обычный UI)
    let t = '';
    try {
      const docs = [];
      if (win && win.document) docs.push(win.document);
      try {
        const iframe = win.document && win.document.getElementById('k5-magbook');
        if (iframe && iframe.contentDocument) docs.push(iframe.contentDocument);
      } catch (eI) {}
      for (let d = 0; d < docs.length; d++) {
        const doc = docs[d];
        const modal = doc.getElementById('modal_form') || doc.getElementById('modal') || doc.querySelector('.modal');
        if (modal) t += ' ' + (modal.innerText || modal.textContent || '');
      }
    } catch (e) {}
    return String(t).replace(/\s+/g, ' ');
  }

  function isBusyHexError(txt) {
    return /занят|клетк\w*\s+занят|нельзя\s+поставить|невозможно\s+вызвать|уже\s+стоит|occupied|busy\s*cell|свободн\w*\s*клетк|выбер\w*\s+свобод|выберите\s+свободн/i.test(
      String(txt || '')
    );
  }

  /** alert() в бою/книге блокирует весь JS до клика OK — подменяем, иначе «глухой» зависон. */
  function muteGameDialogs(win) {
    if (!win) return;
    try {
      if (win.__k5_dialogs_muted) {
        // magbook iframe перезагружается — перевешиваем после навигации
        if (win.__k5_mute_href === String((win.location && win.location.href) || '')) return;
      }
    } catch (eH) {}
    try {
      win.__k5_dialogs_muted = true;
      try {
        win.__k5_mute_href = String((win.location && win.location.href) || '');
      } catch (eHref) {
        win.__k5_mute_href = '';
      }
      win.alert = function (msg) {
        const t = String(msg == null ? '' : msg);
        BOT.state.lastGameAlert = t;
        BOT.state.lastGameAlertAt = Date.now();
        log('Бой: alert «' + t.replace(/\s+/g, ' ').slice(0, 90) + '» (авто-закрыт)', 'err');
        if (isBusyHexError(t) || /свободн|выбер/i.test(t)) {
          BOT.state.lastBusyAlertAt = Date.now();
        }
        return undefined;
      };
      const prevConfirm = win.confirm;
      win.confirm = function (msg) {
        const t = String(msg == null ? '' : msg);
        if (t) {
          BOT.state.lastGameAlert = t;
          BOT.state.lastGameAlertAt = Date.now();
        }
        if (isBusyHexError(t) || /свободн|выбер|ошибк|нельзя|невозмож/i.test(t)) {
          log('Бой: confirm «' + t.replace(/\s+/g, ' ').slice(0, 90) + '» → false', 'err');
          BOT.state.lastBusyAlertAt = Date.now();
          return false;
        }
        // MakeTurn и прочее — как раньше auto-OK
        return true;
      };
      win.prompt = function () {
        return null;
      };
      void prevConfirm;
    } catch (e) {}
  }

  function muteBattleAndBook(battleWin, bookWin) {
    muteGameDialogs(battleWin);
    muteGameDialogs(bookWin);
    try {
      const iframe = battleWin && battleWin.document && battleWin.document.getElementById('k5-magbook');
      if (iframe && iframe.contentWindow) muteGameDialogs(iframe.contentWindow);
    } catch (eI) {}
    try {
      muteGameDialogs(getTopWin());
    } catch (eT) {}
    try {
      muteGameDialogs(PAGE);
    } catch (eP) {}
  }

  function consumeBusyAlert() {
    const t = String(BOT.state.lastGameAlert || '');
    const at = BOT.state.lastBusyAlertAt || BOT.state.lastGameAlertAt || 0;
    if (!t || Date.now() - at > 8000) return false;
    if (isBusyHexError(t) || /свободн|выбер/i.test(t)) {
      BOT.state.lastGameAlert = '';
      BOT.state.lastBusyAlertAt = 0;
      return true;
    }
    return false;
  }

  function closeBattlePopup(name) {
    try {
      const pop = PAGE.open('', name);
      if (pop && !pop.closed) pop.close();
    } catch (e) {}
  }

  function magbookBlob(el) {
    if (!el) return '';
    const parts = [(el.innerText || ''), (el.textContent || ''), (el.outerHTML || '')];
    try {
      const nodes = el.querySelectorAll ? el.querySelectorAll('[title],[alt],img') : [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        parts.push(n.title || '', n.alt || '', n.src || (n.getAttribute && n.getAttribute('src')) || '');
      }
    } catch (e) {}
    return parts.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  }

  // HTML-парсер (без DOM) — имя только в той же строке <tr>, иначе hil/helper смешиваются
  function magbookRowSlice(html, index, fallbackBefore, fallbackAfter) {
    const low = html.lastIndexOf('<tr', index);
    const start = low >= 0 ? low : Math.max(0, index - (fallbackBefore || 220));
    const hi = html.indexOf('</tr>', index);
    const end = hi >= 0 ? Math.min(html.length, hi + 5) : Math.min(html.length, index + (fallbackAfter || 40));
    return html.slice(start, end);
  }

  // title/alt картинок — часто единственное имя заклинания; strip тегов их убивает
  function magbookHtmlToBlob(html) {
    let s = String(html || '');
    const attrs = [];
    s.replace(/\b(?:title|alt)\s*=\s*(["'])([\s\S]*?)\1/gi, function (_m, _q, v) {
      if (v) attrs.push(String(v).replace(/\s+/g, ' ').trim());
      return _m;
    });
    s = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return (attrs.join(' ') + ' ' + s).replace(/\s+/g, ' ').trim();
  }

  function collectMagbookSpellsFromHtml(html) {
    html = String(html || '');
    const out = [];
    const seen = {};
    function add(formId, blob, extra) {
      formId = String(formId || '');
      if (!formId || seen[formId]) return;
      seen[formId] = true;
      const rec = {
        formId: formId,
        blob: magbookHtmlToBlob(blob),
      };
      if (extra) {
        if (extra.url) rec.url = extra.url;
        if (extra.kind) rec.kind = extra.kind;
        if (extra.node) rec.node = extra.node;
      }
      out.push(rec);
    }
    const formRe = /<form[^>]*\bid\s*=\s*["']?form(\d+)["']?[^>]*>([\s\S]*?)<\/form>/gi;
    let m;
    while ((m = formRe.exec(html))) {
      add(m[1], magbookRowSlice(html, m.index, 220, 36));
    }
    const castRe = /MakeCast\s*\(\s*(\d+)\s*\)/gi;
    while ((m = castRe.exec(html))) {
      add(m[1], magbookRowSlice(html, m.index, 220, 36));
    }
    const selRe = /goRC\s*\(\s*['"]([^'"]*magselect\.chtml[^'"]*)['"]\s*\)/gi;
    while ((m = selRe.exec(html))) {
      const url = m[1].replace(/&amp;/g, '&');
      const cid = ((url.match(/[?&]cid=(\d+)/i) || [])[1] || url).toString();
      add('sel:' + cid, magbookRowSlice(html, m.index, 320, 20), { kind: 'magselect', url: url });
    }
    return out;
  }

  function mergeMagbookSpells(into, extra) {
    const seen = {};
    for (let i = 0; i < into.length; i++) seen[into[i].formId] = i;
    for (let j = 0; j < (extra || []).length; j++) {
      const s = extra[j];
      if (!s || !s.formId) continue;
      if (seen[s.formId] == null) {
        seen[s.formId] = into.length;
        into.push(s);
      } else {
        const old = into[seen[s.formId]];
        const nb = String(s.blob || '');
        const ob = String(old.blob || '');
        const mixed = /помощник/i.test(nb) && /восстанов/i.test(nb);
        if (!mixed && nb.length > ob.length) old.blob = s.blob;
        if (s.url && !old.url) old.url = s.url;
        if (s.kind && !old.kind) old.kind = s.kind;
        if (s.node && !old.node) old.node = s.node;
      }
    }
    return into;
  }

  function collectMagbookSpells(doc) {
    const out = [];
    const seen = {};
    function add(formId, blob, node, extra) {
      formId = String(formId || '');
      if (!formId || seen[formId]) return;
      seen[formId] = true;
      const rec = { formId: formId, blob: blob, node: node };
      if (extra) {
        if (extra.url) rec.url = extra.url;
        if (extra.kind) rec.kind = extra.kind;
      }
      out.push(rec);
    }
    function ownBlob(form, formId, rootDoc) {
      let blob = magbookBlob(form);
      try {
        const parent = form.parentElement;
        if (parent) {
          const nForms = parent.querySelectorAll ? parent.querySelectorAll('form[id^="form"]').length : 99;
          const nCast = ((parent.innerHTML || '').match(/MakeCast\s*\(/gi) || []).length;
          if (nForms <= 1 && nCast <= 1) blob += ' ' + magbookBlob(parent);
        }
        if (form.previousElementSibling) blob += ' ' + magbookBlob(form.previousElementSibling);
        if (form.nextElementSibling) blob += ' ' + magbookBlob(form.nextElementSibling);
      } catch (eP) {}
      try {
        const html = (rootDoc && rootDoc.body && rootDoc.body.innerHTML) || '';
        const idx = html.search(new RegExp('form' + formId + '|MakeCast\\s*\\(\\s*' + formId + '\\s*\\)', 'i'));
        if (idx >= 0) blob += ' ' + magbookRowSlice(html, idx, 80, 40);
      } catch (eH) {}
      return blob.replace(/\s+/g, ' ');
    }
    function walk(rootDoc) {
      if (!rootDoc) return;
      try {
        const forms = [...rootDoc.querySelectorAll('form[id^="form"]')];
        for (let i = 0; i < forms.length; i++) {
          const form = forms[i];
          const id = String(form.id || '').replace(/^form/i, '');
          add(id, ownBlob(form, id, rootDoc), form);
        }
        const clicks = [...rootDoc.querySelectorAll('[onclick*="MakeCast"],[onclick*="magselect"],[onclick*="goRC"]')];
        for (let j = 0; j < clicks.length; j++) {
          const el = clicks[j];
          const oc = el.getAttribute('onclick') || '';
          const mCast = oc.match(/MakeCast\s*\(\s*(\d+)/i);
          const mSel = oc.match(/goRC\s*\(\s*['"]([^'"]*magselect\.chtml[^'"]*)['"]/i);
          if (mSel) {
            const url = mSel[1].replace(/&amp;/g, '&');
            const cid = ((url.match(/[?&]cid=(\d+)/i) || [])[1] || url).toString();
            add('sel:' + cid, ownBlob(el, cid, rootDoc), el, { kind: 'magselect', url: url });
            continue;
          }
          if (!mCast) continue;
          add(mCast[1], ownBlob(el, mCast[1], rootDoc), el);
        }
        mergeMagbookSpells(out, collectMagbookSpellsFromHtml((rootDoc.body && rootDoc.body.innerHTML) || ''));
      } catch (e) {}
      try {
        const frames = rootDoc.querySelectorAll('iframe,frame');
        for (let f = 0; f < frames.length; f++) {
          try {
            walk(frames[f].contentDocument);
          } catch (eF) {}
        }
      } catch (e2) {}
    }
    walk(doc);
    return out;
  }

  function pickMagbookSpell(spells, matchFn, excludeFn, preferId) {
    const list = spells || [];
    const pref = preferId ? String(preferId) : '';
    function isMagSel(s) {
      return !!(
        s &&
        (s.kind === 'magselect' ||
          /^sel:/i.test(String(s.formId || '')) ||
          (s.url && /magselect/i.test(s.url)))
      );
    }
    function matches(s) {
      if (typeof excludeFn === 'function' && excludeFn(s.blob)) return false;
      if (typeof matchFn === 'function' && !matchFn(s.blob)) return false;
      return true;
    }
    const magHits = list.filter(function (s) {
      return isMagSel(s) && matches(s);
    });
    if (pref && !(!/^sel:/i.test(pref) && magHits.length)) {
      for (let i = 0; i < list.length; i++) {
        if (list[i].formId !== pref) continue;
        if (!matches(list[i])) continue;
        return list[i];
      }
    }
    let best = null;
    let bestScore = -1;
    for (let si = 0; si < list.length; si++) {
      if (!matches(list[si])) continue;
      const t = String(list[si].blob || '');
      const idPos = t.indexOf(String(list[si].formId));
      const keyPos = t.search(/помощник|вызвать|клон|clone|восстанов|лечен|helper|heal/i);
      let score = keyPos >= 0 && idPos >= 0 ? 10000 - Math.abs(keyPos - idPos) : 1;
      if (isMagSel(list[si])) score += 50000;
      if (/MakeCast|form\d+/i.test(t) && /восстанов|лечен/i.test(t) && /помощник/i.test(t)) score -= 30000;
      if (score > bestScore) {
        best = list[si];
        bestScore = score;
      }
    }
    return best;
  }

  function isHelperBlob(blob, spellRe) {
    const t = String(blob || '');
    if (spellRe && spellRe.test(t)) return true;
    if (/вызвать\s*помощник|помощника|\bпомощник\b/i.test(t)) return true;
    if (/helper|familiar|summon\s*help/i.test(t)) return true;
    if (/pomosh|pomosch|vyzvat/i.test(t)) return true;
    if (/їîìîù|Âûçâàòü|ïîìîùíèê/i.test(t)) return true;
    if (/создать\s*клон|\bклон\b|clone/i.test(t) && !/рассеять|тактик клон/i.test(t)) return true;
    if (
      /magselect/i.test(t) &&
      /помощ|вызвать|helper|pomosh|клон|clone|РїРѕРј|Р’С‹Р·|Ð¿Ð¾Ð¼/i.test(t)
    ) {
      return true;
    }
    return false;
  }

  function isHealSpellBlob(blob) {
    const t = normalizeItemName(blob);
    if (/помощник|вызвать\s*помощ|создать\s*клон/i.test(t)) return false;
    if (spellMatchesPattern(t, 'восстанови|восстановить\\s*здоровье|здоровье')) return true;
    if (/здоровье/i.test(t) && /восстанов|лечен|исцел/i.test(t)) return true;
    return /лечен|восстанов|хил|heal|cure|restore\s*health/i.test(t);
  }

  function spellMatchesPattern(spellName, pattern) {
    const name = normalizeItemName(spellName);
    if (!pattern) return false;
    try {
      return new RegExp(String(pattern), 'iu').test(name);
    } catch (_) {
      return name.indexOf(normalizeItemName(pattern)) >= 0;
    }
  }

  function magbookHasSpells(doc) {
    try {
      return !!(
        doc &&
        (doc.querySelector('[onclick*="MakeCast"]') ||
          doc.querySelector('form[id^="form"]') ||
          doc.querySelector('[onclick*="magselect"]'))
      );
    } catch (e) {
      return false;
    }
  }

  async function waitMagbookReady(pop, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 8000)) {
      try {
        if (pop && magbookHasSpells(pop.document)) return true;
      } catch (e) {}
      await sleep(250);
    }
    return false;
  }

  async function waitMagbookStable(pop, ms) {
    let last = -1;
    let same = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 3500)) {
      let n = 0;
      try {
        n = collectMagbookSpells(pop.document).length;
      } catch (e) {}
      if (n > 0 && n === last) same++;
      else same = 0;
      last = n;
      if (same >= 3) return n;
      await sleep(280);
    }
    return last > 0 ? last : 0;
  }

  function magbookClickReveal(doc) {
    if (!doc) return 0;
    let n = 0;
    const els = [...doc.querySelectorAll('a,button,input,img,[onclick],[href]')];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const t = (
        (el.value || '') +
        ' ' +
        (el.textContent || '') +
        ' ' +
        (el.title || '') +
        ' ' +
        (el.alt || '') +
        ' ' +
        (el.getAttribute && el.getAttribute('onclick')) +
        ' ' +
        (el.getAttribute && el.getAttribute('href')) +
        ' ' +
        (el.src || '')
      ).toLowerCase();
      const isMage =
        (/фильтр|filterbutton|все\s*закл|все\s*маг|путь\s*маг|школа\s*маг|\bмаг\b/.test(t) ||
          /magschool_mode_1|mode=1|type=1|school=1|fl=1/.test(t)) &&
        !/боец|рейндж|мороки|боевая\s*маг/.test(t);
      const isFighter =
        (/боец|путь\s*войн|школа\s*войн|все\s*закл|фильтр/.test(t) ||
          /magschool_mode_0|mode=0|type=0|school=0/.test(t)) &&
        !/помощник|клон|mage/.test(t);
      const isHealTab = /восстанов|здоров|лечен|heal|cure/.test(t);
      const isClone = /создать\s*клон|\bклон\b|clone|помощник|helper/.test(t);
      const isPage = /далее|следующ|\bnext\b|page=2|page=\d+|npage|>>|»/.test(t);
      if (!isMage && !isFighter && !isHealTab && !isClone && !isPage) continue;
      try {
        el.click();
        n++;
      } catch (eC) {}
    }
    return n;
  }

  function magbookAbsUrl(path) {
    let origin = 'https://5kings.ru';
    try {
      origin = String(getTopWin().location.origin || origin);
    } catch (e) {}
    const p = String(path || '/magbook.chtml');
    if (/^https?:/i.test(p)) return p;
    return origin + (p.charAt(0) === '/' ? p : '/' + p);
  }

  function magbookIsScrollBag(url) {
    return /mbag/i.test(String(url || ''));
  }

  function magbookScoreUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u || magbookIsScrollBag(u)) return -1;
    let s = 0;
    if (/magbook/.test(u)) s += 30;
    if (/\bmbook/.test(u) && !/magbook/.test(u)) s += 24;
    if (/bmbook/.test(u)) s += 8;
    if (/[?&]bid=/.test(u)) s += 20;
    return s;
  }

  function collectBattleBookUrlsFromDoc(doc, into, seen) {
    if (!doc) return;
    function add(raw) {
      let u = String(raw || '')
        .replace(/&amp;/g, '&')
        .replace(/['"]/g, '')
        .trim();
      if (!u) return;
      if (/^javascript:/i.test(u)) return;
      if (!/magbook|mbook|bmbook/i.test(u)) return;
      if (magbookIsScrollBag(u)) return;
      u = u.replace(/\s+/g, '');
      const key = u.replace(/([?&]xdac=)[^&]*/i, '');
      if (seen[key]) return;
      seen[key] = 1;
      into.push(u);
    }
    try {
      const html = (doc.documentElement && doc.documentElement.innerHTML) || '';
      const re = /(?:open\s*\(\s*|href\s*=\s*|src\s*=\s*)['"]([^'"]*(?:magbook|mbook|bmbook)[^'"]*)/gi;
      let m;
      while ((m = re.exec(html))) add(m[1]);
    } catch (eH) {}
    try {
      const els = doc.querySelectorAll ? doc.querySelectorAll('a,[onclick],[href],img,area') : [];
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        add((el.getAttribute && (el.getAttribute('href') || el.getAttribute('src'))) || '');
        add((el.getAttribute && el.getAttribute('onclick')) || '');
        const blob = ((el.title || '') + ' ' + (el.alt || '') + ' ' + (el.textContent || '')).toLowerCase();
        if (/книг/.test(blob) && el.getAttribute) add(el.getAttribute('onclick') || el.getAttribute('href') || '');
      }
    } catch (eE) {}
  }

  function findLiveBattleBookUrl(battleWin) {
    const into = [];
    const seen = {};
    try {
      collectBattleBookUrlsFromDoc(battleWin && battleWin.document, into, seen);
    } catch (e1) {}
    try {
      const topW = getTopWin();
      const frames = topW.frames || [];
      for (let i = 0; i < frames.length; i++) {
        try {
          collectBattleBookUrlsFromDoc(frames[i].document, into, seen);
        } catch (eF) {}
      }
      collectBattleBookUrlsFromDoc(topW.document, into, seen);
    } catch (e2) {}
    into.sort(function (a, b) {
      return magbookScoreUrl(b) - magbookScoreUrl(a);
    });
    return into[0] || '';
  }

  function magbookCandidateUrls(win, cfg) {
    const bid = win && win.BID;
    const out = [];
    const seen = {};
    function add(path) {
      if (!path) return;
      let s = String(path).replace(/&amp;/g, '&').trim();
      if (!s || magbookIsScrollBag(s)) return;
      if (!/^https?:/i.test(s) && s.charAt(0) !== '/') s = '/' + s;
      s = magbookAbsUrl(s);
      if (bid && !/[?&]bid=/i.test(s)) s += (s.indexOf('?') >= 0 ? '&' : '?') + 'bid=' + bid;
      const key = s.replace(/([?&]xdac=)[^&]*/i, '').replace(/#.*$/, '');
      if (seen[key]) return;
      seen[key] = 1;
      out.push(s);
    }
    // magselect.chtml открывается из книги кнопкой goRC; page=2 — вторая страница MakeCast.
    add(findLiveBattleBookUrl(win));
    add(cfg && cfg.magicBookUrl);
    add('/magbook.chtml');
    add('/mbook.chtml');
    return out.slice(0, 3);
  }

  function looksLikePeaceFighterBook(spells) {
    const t = (spells || [])
      .map(function (s) {
        return s.blob;
      })
      .join(' ');
    return /боевой\s*клич|берсерк|веерн/i.test(t) && !/помощник/i.test(t);
  }

  function isMagbookSpellUsable(blob, node, kind) {
    if (kind === 'magselect') {
      try {
        if (node && node.disabled) return false;
      } catch (eM) {}
      return true;
    }
    const t = String(blob || '');
    if (/недоступн|нельзя\s+использ|запрещен|выключен|disabled|не активн|только вне боя|недоступно в этом бою/i.test(t)) {
      return false;
    }
    try {
      if (node) {
        if (node.disabled) return false;
        if (node.getAttribute && node.getAttribute('disabled') != null) return false;
        // скрытый iframe книги (opacity:0) — не считать заклинания «серыми»
        let inBotBook = false;
        try {
          const view = node.ownerDocument && node.ownerDocument.defaultView;
          const fe = view && view.frameElement;
          if (fe && fe.id === 'k5-magbook') inBotBook = true;
        } catch (eFe) {}
        let el = node;
        for (let i = 0; i < 5 && el; i++) {
          const cls = String(el.className || '');
          if (/disabled|gray|grey|inactive|\boff\b/i.test(cls)) return false;
          if (!inBotBook) {
            try {
              const view = el.ownerDocument && el.ownerDocument.defaultView;
              const cs = view && view.getComputedStyle && view.getComputedStyle(el);
              if (cs && (Number(cs.opacity) < 0.55 || cs.pointerEvents === 'none')) return false;
            } catch (eCs) {}
          }
          el = el.parentElement;
        }
      }
    } catch (eN) {}
    return true;
  }

  /** Только iframe — popup крадёт фокус Chrome и мешает печатать. */
  async function openMagbookWin(win, bookUrl) {
    const full = bookUrl + (bookUrl.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    let hostDoc = null;
    try {
      hostDoc = win.document;
    } catch (e2) {
      hostDoc = getTopDoc();
    }
    let iframe = hostDoc.getElementById('k5-magbook');
    if (!iframe) {
      iframe = hostDoc.createElement('iframe');
      iframe.id = 'k5-magbook';
      iframe.setAttribute(
        'style',
        'position:fixed;width:850px;height:650px;left:-4000px;top:0;z-index:1;opacity:0;pointer-events:none;border:0'
      );
      (hostDoc.body || hostDoc.documentElement).appendChild(iframe);
    }
    function setOpenerNow() {
      try {
        if (iframe.contentWindow) iframe.contentWindow.opener = win;
      } catch (eOp) {}
    }
    try {
      iframe.onload = setOpenerNow;
    } catch (eOn) {}
    try {
      iframe.src = 'about:blank';
    } catch (eB) {}
    await sleep(80);
    setOpenerNow();
    try {
      const rel = String(bookUrl || '').replace(/^https?:\/\/[^/]+/i, '');
      iframe.src =
        (rel.charAt(0) === '/' ? rel.slice(1) : rel) + (rel.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    } catch (e3) {
      iframe.src = full;
    }
    setOpenerNow();
    const frameWin = iframe.contentWindow;
    setOpenerNow();
    await waitMagbookReady(frameWin, 2800);
    setOpenerNow();
    await waitMagbookStable(frameWin, 700);
    setOpenerNow();
    muteGameDialogs(win);
    muteGameDialogs(frameWin);
    return { win: frameWin, via: 'iframe', iframe: iframe, battleWin: win };
  }

  function closeMagbookWin(handle, force) {
    if (!force) {
      try {
        if (handle && handle.win && magselectLooksReady(handle.win)) return;
      } catch (eM) {}
    }
    try {
      if (handle && handle.via === 'popup' && handle.win && !handle.win.closed) handle.win.close();
    } catch (e) {}
    try {
      if (handle && handle.iframe) {
        if (!force) {
          try {
            const fw = handle.iframe.contentWindow;
            if (fw && magselectLooksReady(fw)) return;
          } catch (eFw) {}
        }
        handle.iframe.src = 'about:blank';
      }
    } catch (e2) {}
    try {
      closeBattlePopup('MAGBOOK');
      closeBattlePopup('MAGSELECT');
      closeBattlePopup('magselect');
    } catch (e3) {}
  }

  function dismissBattleDialogs(win) {
    try {
      const docs = [];
      if (win && win.document) docs.push(win.document);
      try {
        const iframe = win.document && win.document.getElementById('k5-magbook');
        if (iframe && iframe.contentDocument) docs.push(iframe.contentDocument);
      } catch (eI) {}
      for (let d = 0; d < docs.length; d++) {
        const doc = docs[d];
        const modalEl =
          doc.getElementById('modal_form') || doc.getElementById('modal') || doc.querySelector('.modal');
        const modalTxt = modalEl ? String(modalEl.innerText || modalEl.textContent || '') : '';
        // только текст модалки — body сетки содержит «свободн/выбер» и давал ложный busy-loop
        const freeCellDlg = /свободн\w*\s*клетк|выбер\w*\s+свобод/i.test(modalTxt);
        const btns = [...doc.querySelectorAll('input[type=button],input[type=submit],button,a')];
        for (let i = 0; i < btns.length; i++) {
          const blob = ((btns[i].value || '') + ' ' + (btns[i].textContent || '')).toLowerCase();
          if (
            /^ok$|закрыть|отмена|cancel|продолж|понятн/i.test(blob) ||
            (freeCellDlg && /^(ok|ок|да|закрыть)$/i.test(blob.trim()))
          ) {
            try {
              btns[i].click();
            } catch (eC) {}
          }
        }
        if (modalEl && modalEl.style) modalEl.style.display = 'none';
        if (freeCellDlg) {
          BOT.state.lastGameAlert = modalTxt.replace(/\s+/g, ' ').slice(0, 120);
          BOT.state.lastBusyAlertAt = Date.now();
        }
      }
    } catch (e) {}
  }

  function isMagselectPick(pick) {
    if (!pick) return false;
    if (pick.kind === 'magselect') return true;
    if (pick.url && /magselect/i.test(pick.url)) return true;
    if (/^sel:/i.test(String(pick.formId || ''))) return true;
    if (/magselect\.chtml/i.test(String(pick.blob || ''))) return true;
    return false;
  }

  function launchMagselect(battleWin, bookWin, pick) {
    try {
      if (typeof battleWin.ab === 'function') battleWin.ab(8);
    } catch (e0) {}
    const url = (pick && pick.url) || '';
    // только location в том же iframe — клики/popup крадут фокус Chrome
    try {
      if (url && bookWin && bookWin.location) {
        bookWin.location.href =
          magselectUrlWithBid(url, battleWin) + (url.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
        return true;
      }
    } catch (eL) {}
    return false;
  }

  function magselectLooksReady(win) {
    if (!win) return false;
    let href = '';
    let html = '';
    try {
      href = String((win.location && win.location.href) || '');
    } catch (eH) {}
    try {
      html = (win.document && win.document.body && win.document.body.innerHTML) || '';
    } catch (eB) {}
    if (/magselect\.chtml/i.test(href)) return true;
    if (/MakeTurn\s*\(/i.test(html) && !/magselect\.chtml/i.test(href)) return false;
    if (/\b(arena|combat|bmode_|arenax)\b/i.test(href) && !/magselect/i.test(href)) return false;
    if (/magselect\.chtml/i.test(html) && !/MakeTurn\s*\(/i.test(html) && !/goRC\s*\(\s*['"][^'"]*magselect/i.test(html)) {
      return true;
    }
    return false;
  }

  function findMagselectWin(battleWin, bookWin) {
    const cands = [];
    if (bookWin) cands.push(bookWin);
    try {
      const iframe = battleWin && battleWin.document && battleWin.document.getElementById('k5-magbook');
      if (iframe && iframe.contentWindow) cands.push(iframe.contentWindow);
    } catch (eI) {}
    try {
      const top = (battleWin && (battleWin.top || battleWin)) || null;
      if (top && top.frames) {
        for (let i = 0; i < top.frames.length; i++) {
          if (top.frames[i] !== battleWin) cands.push(top.frames[i]);
        }
      }
    } catch (eF) {}
    for (let i = 0; i < cands.length; i++) {
      try {
        if (magselectLooksReady(cands[i])) return cands[i];
      } catch (e) {}
    }
    return bookWin;
  }

  function mapCanvasClickAt(win, hex) {
    if (!win || !hex || typeof win.MapClick !== 'function') return false;
    try {
      const canvas = win.document && win.document.getElementById('mapCanvas');
      if (!canvas) return false;
      let left = 0;
      let top = 0;
      let el = canvas;
      while (el) {
        left += el.offsetLeft || 0;
        top += el.offsetTop || 0;
        el = el.offsetParent;
      }
      const row = Number(hex.y);
      const col = Number(hex.x);
      const xLocal = col * 38.5 + (row % 2 === 0 ? 0 : 19) + 19;
      const yLocal = row * 33.5 + 25 + 16;
      const clientX = xLocal + left - (win.pageXOffset || 0);
      const clientY = yLocal + top - (win.pageYOffset || 0);
      win.MapClick({ clientX: clientX, clientY: clientY });
      return true;
    } catch (e) {}
    return false;
  }

  function setMagselectHexVars(win, hex) {
    if (!win || !hex) return;
    try {
      win.EX = hex.x;
      win.EY = hex.y;
      win.ENEMY = 0;
      win.OBST = -1;
    } catch (e) {}
  }

  function clickMagselectHex(selWin, hex, battleWin) {
    if (!hex) return false;
    setMagselectHexVars(selWin, hex);
    setMagselectHexVars(battleWin, hex);
    try {
      const doc = selWin && selWin.document;
      const inputs = doc ? doc.querySelectorAll('input[name="x"],input[name="y"],input[name="EX"],input[name="EY"],input[name="posx"],input[name="posy"]') : [];
      for (let i = 0; i < inputs.length; i++) {
        const nm = String(inputs[i].name || '').toLowerCase();
        if (nm === 'x' || nm === 'ex' || nm === 'posx') inputs[i].value = String(hex.x);
        if (nm === 'y' || nm === 'ey' || nm === 'posy') inputs[i].value = String(hex.y);
      }
    } catch (eI) {}
    if (mapCanvasClickAt(selWin, hex)) return true;
    return !!(battleWin && hex);
  }

  function magselectCidFromPick(pick) {
    const url = String((pick && pick.url) || '');
    let cid = ((url.match(/[?&]cid=(\d+)/i) || [])[1] || '').toString();
    if (!cid && pick && pick.formId) {
      const m = String(pick.formId).match(/^sel:(\d+)$/i);
      if (m) cid = m[1];
    }
    return cid;
  }

  function magselectUrlWithBid(url, battleWin) {
    let s = String(url || 'magselect.chtml').replace(/&amp;/g, '&');
    const bid = battleWin && battleWin.BID;
    if (bid && !/[?&]bid=/i.test(s)) s += (s.indexOf('?') >= 0 ? '&' : '?') + 'bid=' + bid;
    return s;
  }

  function tryDirectMagselectCast(battleWin, hex, pick) {
    if (!battleWin || !hex || !pick) return false;
    const cid = magselectCidFromPick(pick);
    const bid = battleWin.BID;
    if (!cid || !bid || typeof battleWin.PrepareReq !== 'function') return false;
    try {
      battleWin.EX = hex.x;
      battleWin.EY = hex.y;
      battleWin.ENEMY = 0;
      battleWin.OBST = -1;
      battleWin.PrepareReq('bid=' + bid + '&x=' + hex.x + '&y=' + hex.y + '&actBattle-UseCast=' + cid);
      return true;
    } catch (e) {}
    return false;
  }

  function magselectUrlWithHex(url, hex) {
    let s = String(url || '').replace(/&amp;/g, '&');
    if (!s) s = 'magselect.chtml';
    s = s.replace(/([?&])(x|y)=[^&]*/gi, '').replace(/[?&]$/, '');
    s += (s.indexOf('?') >= 0 ? '&' : '?') + 'x=' + hex.x + '&y=' + hex.y;
    return s;
  }

  function confirmMagselect(selWin, battleWin, hex, pick) {
    const url = (pick && pick.url) || '';
    const cid = ((url.match(/[?&]cid=(\d+)/i) || [])[1] || '').toString();
    const bid = (battleWin && battleWin.BID) || ((url.match(/[?&]bid=(\d+)/i) || [])[1] || '');
    try {
      const doc = selWin && selWin.document;
      const els = doc ? [...doc.querySelectorAll('input,button,a,[onclick]')] : [];
      for (let i = 0; i < els.length; i++) {
        const oc = (els[i].getAttribute && els[i].getAttribute('onclick')) || '';
        const val = ((els[i].value || '') + ' ' + (els[i].textContent || '')).toLowerCase();
        const blob = val + ' ' + oc;
        if (/MakeTurn|SwitchAttack|Capitulate|Ходить|Удар/i.test(blob)) continue;
        if (/goRC\s*\(\s*['"][^'"]*magselect\.chtml[^"'?]*['"]/i.test(oc) && !/[?&]x=/i.test(oc)) continue;
        if (/UseCast|actBattle-UseCast|поставить|создать|вызвать|подтверд/i.test(blob)) {
          els[i].click();
          return 'click-cast';
        }
        if (/примен|выбрать клет/i.test(val) && !/MakeTurn/i.test(oc)) {
          els[i].click();
          return 'click-apply';
        }
      }
      for (let j = 0; doc && doc.forms && j < doc.forms.length; j++) {
        const act = String(doc.forms[j].action || '');
        if (/magselect|UseCast/i.test(act)) {
          doc.forms[j].submit();
          return 'form';
        }
      }
    } catch (eC) {}
    try {
      if (hex && url) {
        const go = magselectUrlWithHex(url, hex);
        if (selWin && selWin.location) {
          selWin.location.href = go + (go.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
          return 'href-xy';
        }
      }
    } catch (eG) {}
    try {
      if (cid && hex && battleWin && typeof battleWin.PrepareReq === 'function') {
        battleWin.PrepareReq('bid=' + bid + '&x=' + hex.x + '&y=' + hex.y + '&actBattle-UseCast=' + cid);
        return 'PrepareReq';
      }
    } catch (eP) {}
    return '';
  }

  async function finishMagselect(battleWin, bookWin, hex, pick) {
    const url = magselectUrlWithBid((pick && pick.url) || 'magselect.chtml', battleWin);
    const cid = magselectCidFromPick(pick);
    BOT.state.helperBusy = true;
    BOT.state.helperBusySince = Date.now();
    BOT.state.lastGameAlert = '';
    BOT.state.lastBusyAlertAt = 0;
    muteBattleAndBook(battleWin, bookWin);

    const t0 = Date.now();
    let selWin = bookWin;
    while (Date.now() - t0 < 3500) {
      try {
        if (bookWin && bookWin.opener !== battleWin) bookWin.opener = battleWin;
      } catch (eOp) {}
      selWin = findMagselectWin(battleWin, bookWin);
      muteBattleAndBook(battleWin, selWin);
      if (magselectLooksReady(selWin) && selWin !== battleWin) break;
      await sleep(200);
    }
    if (!magselectLooksReady(selWin) || selWin === battleWin) {
      log('Бой: magselect.chtml не открылось — не жму чужой «Применить»', 'err');
      BOT.state.helperBusy = false;
      return false;
    }
    muteBattleAndBook(battleWin, selWin);
    try {
      if (typeof battleWin.ab === 'function') battleWin.ab(8);
    } catch (eAb) {}
    setMagselectHexVars(battleWin, hex);
    setMagselectHexVars(selWin, hex);
    clickMagselectHex(selWin, hex, battleWin);
    await sleep(350);
    muteBattleAndBook(battleWin, selWin);

    let how = '';
    try {
      how = confirmMagselect(selWin, battleWin, hex, pick);
    } catch (eConf) {
      log('Бой: confirmMagselect exception ' + (eConf && eConf.message), 'err');
    }
    if (consumeBusyAlert()) {
      log('Бой: alert «свободная клетка» — клетка занята, сброс', 'err');
      banSummonHex(hex, 60000);
      dismissBattleDialogs(selWin);
      dismissBattleDialogs(battleWin);
      closeMagbookWin({ via: 'iframe', iframe: battleWin.document && battleWin.document.getElementById('k5-magbook'), win: selWin }, true);
      BOT.state.helperBusy = false;
      BOT.state.helperFailUntil = Date.now() + 10000;
      return false;
    }
    if (!how || /^goRC-xy$|^href-xy$/.test(how)) {
      try {
        if (tryDirectMagselectCast(battleWin, hex, pick)) how = 'PrepareReq';
      } catch (eDir) {}
    }
    if (consumeBusyAlert()) {
      log('Бой: alert после каста — клетка занята, сброс', 'err');
      banSummonHex(hex, 60000);
      dismissBattleDialogs(selWin);
      dismissBattleDialogs(battleWin);
      closeMagbookWin({ via: 'iframe', iframe: battleWin.document && battleWin.document.getElementById('k5-magbook'), win: selWin }, true);
      BOT.state.helperBusy = false;
      BOT.state.helperFailUntil = Date.now() + 10000;
      return false;
    }
    log(
      'Бой: magselect клетка ' +
        (hex ? hex.x + ',' + hex.y : '?') +
        (how ? ' → ' + how : ' без кнопки') +
        (cid ? ' cid=' + cid : ''),
      how && !/^goRC-xy$|^href-xy$/.test(how) ? 'ok' : 'err'
    );
    await sleep(how && !/^goRC-xy$|^href-xy$/.test(how) ? 500 : 300);

    // проверка результата после click-cast (занятая клетка / зависание)
    const castResult = await waitMagselectResult(selWin, battleWin, 7000);
    const busyNow = castResult === 'occupied' || consumeBusyAlert();
    if (busyNow || castResult === 'timeout') {
      log('Бой: magselect — ' + (busyNow ? 'occupied' : castResult) + ', сброс и повтор через 10с', 'err');
      banSummonHex(hex, 60000);
      dismissBattleDialogs(selWin);
      dismissBattleDialogs(battleWin);
      closeMagbookWin({ via: 'iframe', iframe: battleWin.document && battleWin.document.getElementById('k5-magbook'), win: selWin }, true);
      BOT.state.helperBusy = false;
      BOT.state.helperFailUntil = Date.now() + 10000;
      return false;
    }

    const errTxt = battleOverlayErrorText(selWin) + ' ' + battleOverlayErrorText(battleWin);
    if (isBusyHexError(errTxt)) {
      log('Бой: клетка занята для клона — закрываю окна', 'err');
      banSummonHex(hex, 60000);
      dismissBattleDialogs(selWin);
      dismissBattleDialogs(battleWin);
      closeMagbookWin({ via: 'iframe', iframe: battleWin.document && battleWin.document.getElementById('k5-magbook'), win: selWin }, true);
      BOT.state.helperBusy = false;
      BOT.state.helperFailUntil = Date.now() + 10000;
      return false;
    }
    if (/ошибк|неудач|нельзя|невозможно|свободн/i.test(errTxt) && /клон|помощник|клетк/i.test(errTxt)) {
      log('Бой: ошибка каста клона — закрываю окна', 'err');
      banSummonHex(hex, 30000);
      dismissBattleDialogs(selWin);
      dismissBattleDialogs(battleWin);
      closeMagbookWin({ via: 'iframe', iframe: battleWin.document && battleWin.document.getElementById('k5-magbook'), win: selWin }, true);
      BOT.state.helperBusy = false;
      BOT.state.helperFailUntil = Date.now() + 8000;
      return false;
    }
    const ok = !!(how && !/^goRC-xy$|^href-xy$/.test(how)) || castResult === 'ok' || castResult === 'closed';
    BOT.state.helperBusy = false;
    if (ok) BOT.state.occupiedCells = {};
    return ok;
  }

  function castMagbookSpell(battleWin, bookWin, pick) {
    if (typeof pick === 'string') pick = { formId: pick };
    if (!pick) return false;
    if (isMagselectPick(pick)) return launchMagselect(battleWin, bookWin, pick);
    const formId = String(pick.formId || '');
    if (!formId) return false;
    try {
      if (typeof battleWin.ab === 'function') battleWin.ab(8);
    } catch (e0) {}
    try {
      const doc = bookWin.document;
      const form = doc && doc.getElementById('form' + formId);
      if (form) {
        if (typeof bookWin.jQuery === 'function') {
          try {
            bookWin.jQuery('#form' + formId).submit();
            return true;
          } catch (eJ) {}
        }
        form.submit();
        return true;
      }
      if (typeof bookWin.MakeCast === 'function') {
        try {
          bookWin.MakeCast(formId);
          return true;
        } catch (eM) {}
      }
    } catch (e) {}
    return false;
  }

  // Универсальный каст из книги магии (magbook.chtml): и «Вызвать помощника», и «Восстановление здоровья».
  async function castMagbookByPredicate(win, state, opts) {
    const cfg = BOT.cfg.battle;
    const failKey = opts.failKey;
    const formKey = opts.formIdKey;
    if (Date.now() < (BOT.state[failKey] || 0)) return false;

    const tLeft0 = readTurnTimerSec(win);
    if (tLeft0 != null && tLeft0 <= 12) {
      log('Бой: ' + opts.logName + ' пропуск — таймер ' + tLeft0 + 'с');
      return false;
    }

    // без маны заклинание не прочитать
    try {
      if (win.ME && Number(win.ME.mp) <= 0) {
        BOT.state[failKey] = Date.now() + 90000;
        log('Бой: ' + opts.logName + ' пропуск — мана 0 (mp)');
        return false;
      }
    } catch (eMp) {}

    // цель: помощник — свободная клетка рядом с врагом; лечение — на себя
    let hex = null;
    if (opts.needHex) {
      const withDist = (state.enemies || []).map(function (e) {
        let hd = 99;
        try {
          if (typeof win.HexDistance === 'function' && win.ME) hd = win.HexDistance(win.ME.x, win.ME.y, e.x, e.y);
        } catch (err) {}
        return Object.assign({}, e, { hd: hd });
      });
      withDist.sort(function (a, b) {
        return a.hd - b.hd || a.hp - b.hp;
      });
      for (let i = 0; i < withDist.length; i++) {
        hex = pickSummonHex(win, withDist[i]);
        if (hex) break;
      }
      if (!hex) {
        BOT.state[failKey] = Date.now() + 8000;
        return false;
      }
      win.EX = hex.x;
      win.EY = hex.y;
      win.ENEMY = 0;
      win.OBST = -1;
    } else {
      try {
        win.EX = win.ME.x;
        win.EY = win.ME.y;
        win.ENEMY = win.ME.id != null ? win.ME.id : 0;
        win.OBST = -1;
      } catch (eSelf) {}
    }

    const preferId = (opts.preferFormId && String(opts.preferFormId).trim()) || BOT.state[formKey] || '';
    const urls = magbookCandidateUrls(win, cfg);
    if (!urls.length) urls.push(magbookAbsUrl(cfg.magicBookUrl || '/magbook.chtml'));
    log('Бой: книги ' + urls.map(function (u) { return u.replace(/^https?:\/\/[^/]+/i, ''); }).join(' → '));

    let handle = null;
    let cast = false;
    let lastSample = '';
    let lastCount = 0;

    function usableSpells(list, doc) {
      const out = [];
      for (let i = 0; i < (list || []).length; i++) {
        const s = list[i];
        if (!isMagbookSpellUsable(s.blob, s.node, s.kind)) continue;
        out.push(s);
      }
      return out;
    }

    try {
      for (let ui = 0; ui < urls.length && !cast; ui++) {
        const bookUrl = urls[ui];
        closeMagbookWin(handle);
        handle = null;
        try {
          handle = await openMagbookWin(win, bookUrl);
        } catch (eOpen) {
          handle = null;
        }
        if (!handle || !handle.win) continue;
        const pop = handle.win;
        if (handle.via === 'iframe' && ui === 0) log('Бой: magbook iframe (popup блокирован)');
        log('Бой: открыл книгу ' + bookUrl.replace(/^https?:\/\/[^/]+/i, ''));

        async function harvest() {
          try {
            if (handle.iframe && handle.iframe.contentWindow) handle.iframe.contentWindow.opener = win;
          } catch (eOp) {}
          const doc = pop.document;
          const list = doc && doc.body ? collectMagbookSpells(doc) : [];
          mergeMagbookSpells(
            list,
            collectMagbookSpellsFromHtml((doc && doc.documentElement && doc.documentElement.innerHTML) || '')
          );
          return usableSpells(list, doc);
        }

        let spells = await harvest();
        if (!pickMagbookSpell(spells, opts.match, opts.exclude, preferId)) {
          const clicked = magbookClickReveal(pop.document);
          if (clicked) {
            log('Бой: книга — фильтр/страница (' + clicked + ')');
            await sleep(500);
            await waitMagbookStable(pop, 1200);
            mergeMagbookSpells(spells, await harvest());
            spells = usableSpells(spells);
          }
        }

        lastCount = spells.length;
        lastSample = spells
          .map(function (s) {
            return s.formId + ':' + String(s.blob || '').replace(/\s+/g, ' ').slice(0, 40);
          })
          .join(' | ');

        if (!spells.length) {
          log('Бой: книга пуста ' + bookUrl.replace(/^https?:\/\/[^/]+/i, '') + ' — следующая');
          continue;
        }

        const pick = pickMagbookSpell(spells, opts.match, opts.exclude, preferId);
        if (!pick) {
          log(
            'Бой: ' +
              opts.logName +
              ' нет на ' +
              bookUrl.replace(/^https?:\/\/[^/]+/i, '') +
              ' (' +
              lastCount +
              ' закл.)'
          );
          if (spells.length) break;
          continue;
        }
        if (isMagselectPick(pick)) {
          log('Бой: ' + opts.logName + ' через magselect ' + (pick.url || pick.formId));
          const launched = launchMagselect(win, pop, pick);
          if (launched) {
            const done = await finishMagselect(win, pop, hex, pick);
            if (done) {
              cast = true;
              BOT.state[formKey] = String(pick.formId);
              BOT.state.helperMissCount = 0;
              log(
                'Бой: ' + opts.logName + ' magselect ' + pick.formId + (hex ? ' @' + hex.x + ',' + hex.y : ''),
                'ok'
              );
            } else {
              log('Бой: magselect не подтвердился — сброс окон, бью дальше', 'err');
              banSummonHex(hex, 45000);
              dismissBattleDialogs(win);
              closeMagbookWin(handle, true);
              BOT.state[failKey] = Date.now() + 5000;
              return false;
            }
          } else {
            log('Бой: magselect не открылся из книги', 'err');
          }
        } else {
          cast = castMagbookSpell(win, pop, pick);
          if (cast) {
            BOT.state[formKey] = String(pick.formId);
            BOT.state.helperMissCount = 0;
            log(
              'Бой: ' + opts.logName + ' каст form ' + pick.formId + (hex ? ' @' + hex.x + ',' + hex.y : ' (на себя)'),
              'ok'
            );
          } else {
            log('Бой: каст ' + opts.logName + ' не сработал (form ' + pick.formId + ')');
          }
        }
      }
    } catch (e) {
      BOT.state[failKey] = Date.now() + 20000;
      log('Бой: magbook ошибка (' + opts.logName + ') ' + (e.message || e), 'err');
      dismissBattleDialogs(win);
      closeMagbookWin(handle, true);
      handle = null;
    }

    if (!handle || !handle.win) {
      BOT.state[failKey] = Date.now() + 60000;
      log('Бой: magbook недоступен (' + opts.logName + ') — повтор через ~60с', 'err');
      dismissBattleDialogs(win);
      return false;
    }

    if (!cast) {
      BOT.state.helperMissCount = (BOT.state.helperMissCount || 0) + 1;
      BOT.state[failKey] = Date.now() + 8000;
      log(
        'Бой: ' +
          opts.logName +
          ' не найден среди ' +
          lastCount +
          ' закл. после всех книг [' +
          lastSample +
          ']',
        'err'
      );
      dismissBattleDialogs(win);
      closeMagbookWin(handle, true);
      return false;
    }

    if (cast) await sleep(humanDelay(1400, 2200));
    closeMagbookWin(handle, true);
    return cast;
  }

  function battleHasOwnHelper(win, state) {
    const me = win && win.ME;
    if (!me) return false;
    const myNick = String(me.nk || me.nick || '').replace(/\s*клон\s*\d+\s*$/i, '').trim();
    const allies = (state && state.allies) || [];
    for (let i = 0; i < allies.length; i++) {
      const nk = String(allies[i].nk || '');
      if (!/клон|помощник|helper|familiar/i.test(nk)) continue;
      if (myNick && nk.indexOf(myNick) >= 0) return true;
    }
    return false;
  }

  async function trySummonHelper(win, state) {
    const cfg = BOT.cfg.battle;
    if (!cfg.summonHelper || !flagGet(FLAG.chaos)) return false;
    if (!state.enemies.length) return false;
    if (BOT.state.helperBusy) {
      if (Date.now() - (BOT.state.helperBusySince || 0) > 20000) {
        log('Бой: helperBusy завис — сброс окон', 'err');
        BOT.state.helperBusy = false;
        dismissBattleDialogs(win);
        try {
          closeMagbookWin({ via: 'iframe', iframe: win.document && win.document.getElementById('k5-magbook') }, true);
        } catch (eC) {}
      } else {
        return false;
      }
    }
    const seq = BOT.state.battleTurnSeq || 0;
    // один каст клона на ЭТОТ наш ход; следующий раунд seq++ и снова можно
    if (seq && BOT.state.helperCastSeq === seq) return false;
    const spellRe = new RegExp(
      cfg.helperSpell && String(cfg.helperSpell).trim() ? cfg.helperSpell : 'помощник|вызвать\\s*помощ|helper',
      'i'
    );
    BOT.state.helperBusySince = Date.now();
    const ok = await castMagbookByPredicate(win, state, {
      logName: 'помощник',
      needHex: true,
      formIdKey: 'helperFormId',
      failKey: 'helperFailUntil',
      preferFormId: cfg.helperFormId,
      match: function (blob) {
        return isHelperBlob(blob, spellRe);
      },
      exclude: function (blob) {
        return isHealSpellBlob(blob);
      },
    });
    BOT.state.helperBusy = false;
    if (ok) {
      BOT.state.helperCastSeq = seq;
      log('Бой: клон в этом ходу уже кинут (ход #' + seq + ') — дальше удар/блок');
    }
    return ok;
  }

  // Лечение — это заклинание в книге магии (не свиток из сумки)
  async function trySummonHealSpell(win, state) {
    const cfg = BOT.cfg.battle;
    if (!cfg.useMagic) return false;
    const healPat =
      cfg.healSpell && String(cfg.healSpell).trim()
        ? cfg.healSpell
        : 'восстанови|восстановить\\s*здоровье|здоровье|лечен|исцел|heal|cure|restore';
    return castMagbookByPredicate(win, state, {
      logName: 'лечение',
      needHex: false,
      formIdKey: 'healFormId',
      failKey: 'healSpellMissUntil',
      match: function (blob) {
        return isHealSpellBlob(blob) || spellMatchesPattern(blob, healPat);
      },
      exclude: function (blob) {
        return isHelperBlob(blob, null);
      },
    });
  }

  function battleHpInfo(win, state) {
    let hp = Number(state && state.hp);
    let mhp = Number(state && state.mhp);
    try {
      const val = win.document && win.document.getElementById('VAL_hp');
      const t = (val && (val.innerText || val.textContent)) || '';
      const m = t.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) {
        hp = Number(m[1]);
        mhp = Number(m[2]);
      }
    } catch (e) {}
    if (!isFinite(hp)) hp = 0;
    if (!isFinite(mhp) || mhp <= 0) return { hp: hp, mhp: mhp, pct: 100, missing: true };
    return { hp: hp, mhp: mhp, pct: (100 * hp) / mhp, missing: false };
  }

  function shouldBattleHeal(win, state) {
    refreshCfg();
    const cfg = BOT.cfg.battle;
    if (!cfg.useMagic) return false;
    if (!state || Number(state.hp) <= 0) return false;
    const inf = battleHpInfo(win, state);
    if (inf.missing) return false;
    if (!(inf.hp < inf.mhp)) return false;
    const thr = Number(cfg.healBelowHpPct || 30);
    const hpPct = inf.pct;
    return hpPct <= thr && hpPct < 99.5;
  }

  async function tryBattleHealOrMagic(win, state) {
    refreshCfg();
    const cfg = BOT.cfg.battle;
    // «магия/хил в бою» выкл → ничего не трогаем (и не открываем сумку)
    if (!cfg.useMagic) return false;
    if (!state || state.hp <= 0) return false;

    const inf = battleHpInfo(win, state);
    const thr = Number(cfg.healBelowHpPct || 30);
    const needHeal = shouldBattleHeal(win, state);
    const inChaos = flagGet(FLAG.chaos);
    const wantMagic = !inChaos && Math.random() < Number(cfg.magicChance || 0);

    if (!needHeal && !wantMagic) return false;
    if (needHeal) log('Бой: HP ' + Math.round(inf.pct) + '% ≤ ' + thr + '% — хил');

    const nodes = [...win.document.querySelectorAll('input[type=button],button,a')];
    let opened = null;
    for (let i = 0; i < nodes.length; i++) {
      const v = (nodes[i].value || nodes[i].textContent || '').trim();
      if (needHeal && /рюкзак|сумк/i.test(v)) {
        nodes[i].click();
        opened = 'bag';
        break;
      }
      if (wantMagic && /маг/i.test(v)) {
        nodes[i].click();
        opened = 'magic';
        break;
      }
    }
    if (!opened) {
      try {
        if (needHeal) win.open('/bag.chtml?xdac=' + Math.random(), 'BAG', 'width=850,height=650');
        else if (wantMagic) win.open('/mbag.chtml?xdac=' + Math.random(), 'MAGIC', 'width=850,height=650');
        opened = needHeal ? 'bag' : wantMagic ? 'magic' : null;
      } catch (e) {}
    }
    if (!opened) return false;
    await sleep(humanDelay(600, 1200));

    try {
      const name = opened === 'bag' ? 'BAG' : 'MAGIC';
      const pop = PAGE.open('', name);
      if (pop && pop.document) {
        const rows = [...pop.document.querySelectorAll('tr, a, input')];
        for (let i = 0; i < rows.length; i++) {
          const t = ((rows[i].innerText || rows[i].value || '') + '').toLowerCase();
          if (needHeal && /свиток.*лечен|лечен.*свиток|восстановлен\w*\s*жизн|зелье.*лечен/.test(t)) {
            const btn =
              rows[i].querySelector &&
              rows[i].querySelector('input[value*="Использовать"],*[onclick*="Use"],a[href*="Use"]');
            (btn || rows[i]).click();
            log('Бой: хил через ' + opened, 'ok');
            await sleep(800);
            try {
              pop.close();
            } catch (e) {}
            return true;
          }
          if (!needHeal && wantMagic && /огн|замороз|панцир|клон|проклят|удар|маг|bolt|fire/.test(t)) {
            const btn =
              rows[i].querySelector &&
              rows[i].querySelector('input[value*="Использовать"],*[onclick*="Use"],a');
            (btn || rows[i]).click();
            log('Бой: заклинание', 'ok');
            await sleep(800);
            try {
              pop.close();
            } catch (e) {}
            return true;
          }
        }
      }
    } catch (e) {}
    return false;
  }

  function playHumanTurn(win, state) {
    if (!state.enemies.length) return { ok: false, why: 'no-enemies' };

    const withDist = state.enemies.map(function (e) {
      let hd = 99;
      try {
        if (typeof win.HexDistance === 'function' && win.ME) hd = win.HexDistance(win.ME.x, win.ME.y, e.x, e.y);
      } catch (err) {}
      return Object.assign({}, e, { hd: hd });
    });
    withDist.sort(function (a, b) {
      return a.hd - b.hd || a.hp - b.hp;
    });

    const atkRange = Math.max(Number(state.rrg) || 1, Number(state.lrg) || 1, 1);
    const inRange = withDist.filter(function (e) {
      return e.hd <= atkRange;
    });

    const tacticRaw = String((BOT.cfg.battle && BOT.cfg.battle.tactic) || 'standard').toLowerCase();
    const tactic = /def|защит/.test(tacticRaw)
      ? 'defense'
      : /aggro|агресс/.test(tacticRaw)
        ? 'aggressive'
        : 'standard';

    // сначала бьём/блокируем по цели в радиусе; к случайной дальней — только если все далеко
    let target = inRange.length ? inRange[0] : withDist[0];
    if (inRange.length > 1 && Math.random() < 0.25) {
      target = inRange[rand(0, Math.min(2, inRange.length - 1))];
    }

    const me = win.ME;
    if (!me || win.ReloadReq) return { ok: false, why: 'no-me' };

    const ub = win.UNBS[target.id] || win.UNBS[String(target.id)];
    if (!ub) return { ok: false, why: 'no-unb' };
    win.ENEMY = target.id;
    win.EX = ub.x;
    win.EY = ub.y;
    win.OBST = -1;
    try {
      if (typeof win.SelectUB === 'function') win.SelectUB(target.id);
    } catch (e) {}
    win.ENEMY = target.id;
    win.EX = ub.x;
    win.EY = ub.y;

    const hd = typeof win.HexDistance === 'function' ? win.HexDistance(me.x, me.y, ub.x, ub.y) : target.hd;

    // Перемещение в бою по умолчанию ВЫКЛЮЧЕНО: бот не успевает обновлять поле и подставляется.
    // Вместо этого при отсутствии врага в радиусе — 4 блока (см. ниже).
    if (BOT.cfg.battle.moveInBattle && hd > atkRange && !(me.flg & 0x4000) && me.tn && me.tn >= 1) {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ];
      let best = null;
      let bestHd = hd;
      for (let i = 0; i < dirs.length; i++) {
        const nx = me.x + dirs[i][0];
        const ny = me.y + dirs[i][1];
        if (nx < 0 || ny < 0) continue;
        const d2 = win.HexDistance(nx, ny, ub.x, ub.y);
        const stepCost = win.HexDistance(me.x, me.y, nx, ny);
        if (stepCost < 1 || stepCost > me.tn) continue;
        if (d2 < bestHd) {
          bestHd = d2;
          best = { x: nx, y: ny, d2: d2 };
        }
      }
      if (best) {
        win.EX = best.x;
        win.EY = best.y;
        try {
          win.MakeMove();
          return { ok: true, moved: true, hd: hd, to: [best.x, best.y] };
        } catch (e) {
          /* fall through to kick/block */
        }
      }
    }

    try {
      win.SwitchAttack(1);
    } catch (e) {
      for (let i = 0; i < 10; i++) {
        win.KICKS[i] = 0;
        win.BLOCKS[i] = 0;
      }
    }

    function clearHandLocal(side) {
      for (let i = 0; i < 5; i++) {
        if (win.KICKS[side * 5 + i] === 1) {
          win.KICKS[side * 5 + i] = 0;
          const el = win.document.getElementById('kk' + side + i);
          if (el) el.className = 'bchk0';
        }
        if (win.BLOCKS[side * 5 + i] === 1) {
          win.BLOCKS[side * 5 + i] = 0;
          const el = win.document.getElementById('bl' + side + i);
          if (el) el.className = 'bchk0';
        }
      }
    }
    function blocksCount(side) {
      let n = 0;
      for (let i = 0; i < 5; i++) if (win.BLOCKS[side * 5 + i] === 1) n++;
      return n;
    }

    // Нет врага в радиусе удара — 4 блока только для защиты / если врагов нет.
    // Агрессивная/стандартная при врагах «рядом» всё равно бьют (не уходят в чистые блоки).
    if (inRange.length === 0 && (tactic === 'defense' || !withDist.length)) {
      clearHandLocal(0);
      clearHandLocal(1);
      [0, 1].forEach(function (side) {
        const order = ZONES.slice().sort(function () {
          return Math.random() - 0.5;
        });
        for (let i = 0; i < order.length && blocksCount(side) < 2; i++) {
          try {
            win.ubblock(side, order[i]);
          } catch (e2) {}
        }
      });
      const realConfirmD = win.confirm;
      win.confirm = function () {
        return true;
      };
      let turnedD = false;
      try {
        win.MakeTurn();
        turnedD = true;
      } finally {
        win.confirm = realConfirmD;
      }
      return { ok: turnedD, defense: true, hd: hd, blocks: [blocksCount(0), blocksCount(1)], tactic: tactic };
    }

    function clearHand(side) {
      for (let i = 0; i < 5; i++) {
        if (win.KICKS[side * 5 + i] === 1) {
          win.KICKS[side * 5 + i] = 0;
          const el = win.document.getElementById('kk' + side + i);
          if (el) el.className = 'bchk0';
        }
        if (win.BLOCKS[side * 5 + i] === 1) {
          win.BLOCKS[side * 5 + i] = 0;
          const el = win.document.getElementById('bl' + side + i);
          if (el) el.className = 'bchk0';
        }
      }
    }
    function handKickEnabled(side) {
      for (let i = 0; i < 5; i++) if (win.KICKS[side * 5 + i] === 0) return true;
      return false;
    }
    function applyKick(side) {
      const z = pickWeightedZone();
      try {
        win.ubkick(side, z);
      } catch (e) {}
      if (win.KICKS[side * 5 + z] === 1) return { type: 'kick', z: z };
      for (let i = 0; i < 5; i++) {
        try {
          win.ubkick(side, i);
        } catch (e) {}
        if (win.KICKS[side * 5 + i] === 1) return { type: 'kick', z: i };
      }
      return { type: 'kick', z: -1 };
    }
    function applyBlocks(side, count) {
      const used = [];
      const order = ZONES.slice().sort(function () {
        return Math.random() - 0.5;
      });
      for (let i = 0; i < order.length && used.length < count; i++) {
        const z = order[i];
        try {
          win.ubblock(side, z);
        } catch (e) {}
        if (win.BLOCKS[side * 5 + z] === 1) used.push(z);
      }
      return { type: 'block', z: used };
    }
    function forceKick(side) {
      const z = pickWeightedZone();
      win.KICKS[side * 5 + z] = 1;
      const el = win.document.getElementById('kk' + side + z);
      if (el) el.className = 'bchk1';
      return { type: 'kick', z: z };
    }

    clearHand(0);
    clearHand(1);
    let right;
    let left;
    if (tactic === 'defense') {
      right = applyBlocks(0, 2);
      left = applyBlocks(1, 2);
    } else if (tactic === 'aggressive') {
      right = applyKick(0);
      left = applyKick(1);
      if (right.z < 0) right = forceKick(0);
      if (left.z < 0) left = forceKick(1);
    } else {
      // standard: 1 удар + 2 блока
      if (handKickEnabled(0)) {
        right = applyKick(0);
        if (right.z < 0) right = forceKick(0);
        left = applyBlocks(1, 2);
      } else if (handKickEnabled(1)) {
        left = applyKick(1);
        if (left.z < 0) left = forceKick(1);
        right = applyBlocks(0, 2);
      } else {
        right = forceKick(0);
        left = applyBlocks(1, 2);
      }
    }

    function points(side) {
      let p = 0;
      for (let i = 0; i < 5; i++) {
        if (win.BLOCKS[side * 5 + i] === 1) p += 1;
        if (win.KICKS[side * 5 + i] === 1) p += 2;
      }
      return p;
    }
    [0, 1].forEach(function (side) {
      if (points(side) >= 2) return;
      clearHand(side);
      if (tactic === 'defense') {
        applyBlocks(side, 2);
      } else if (tactic === 'aggressive') {
        // только удары — без добивания блоками
        forceKick(side);
        if (points(side) < 2) forceKick(side);
      } else {
        if (side === 0) forceKick(side);
        else applyBlocks(side, 2);
      }
      // добить до 2 очков блоками ТОЛЬКО не на aggressive
      if (tactic !== 'aggressive') {
        if (points(side) < 2) applyBlocks(side, 2);
        if (points(side) < 2) forceKick(side);
      }
    });

    const realConfirm = win.confirm;
    win.confirm = function () {
      return true;
    };
    let turned = false;
    try {
      win.MakeTurn();
      turned = true;
    } finally {
      win.confirm = realConfirm;
    }
    return {
      ok: turned,
      hd: hd,
      enemy: target.nk || target.id,
      tactic: tactic,
      right: right,
      left: left,
      pts: [points(0), points(1)],
      outOfRange: inRange.length === 0,
    };
  }

  async function runBattleLoop(win) {
    win = win || getActWin();
    log('=== Боевой AI ===');
    if (!BOT.state.fightSessionStart) BOT.state.fightSessionStart = Date.now();
    let lastTurnAt = 0;
    let idle = 0;
    BOT.state.turnReadySince = 0;
    BOT.state.lastBattleRound = null;
    BOT.state.wasOurTurn = false;
    BOT.state.battleTurnSeq = 0;
    BOT.state.helperCastSeq = 0;
    BOT.state.helperFailUntil = 0;
    BOT.state.helperBusy = false;
    BOT.state.lastTickAt = Date.now();
    muteBattleAndBook(win, null);

    while (flagGet(FLAG.chaos) && !flagGet(FLAG.captcha)) {
      BOT.state.lastTickAt = Date.now();
      muteBattleAndBook(win, null);
      refreshCfg();
      watchCaptcha();
      // watchdog: зависшие magbook/helper — сброс; cooldown 3с против re-entrancy с dismiss
      if (
        (BOT.state.helperBusy && Date.now() - (BOT.state.helperBusySince || 0) > 25000) ||
        (BOT.state.lastBusyAlertAt &&
          Date.now() - BOT.state.lastBusyAlertAt < 2000 &&
          Date.now() - (BOT.state.lastWatchdogAt || 0) > 3000)
      ) {
        if (BOT.state.helperBusy || consumeBusyAlert()) {
          log('Watchdog: helper/magselect/alert — сброс окон', 'err');
          BOT.state.lastWatchdogAt = Date.now();
          BOT.state.helperBusy = false;
          BOT.state.helperFailUntil = Date.now() + 8000;
          dismissBattleDialogs(win);
          try {
            closeMagbookWin(
              { via: 'iframe', iframe: win.document && win.document.getElementById('k5-magbook') },
              true
            );
          } catch (eW) {}
        }
      }
      if (!isBattleWin(win)) {
        log('Бой завершён');
        BOT.state.lastFightEnd = Date.now();
        BOT.state.helperBusy = false;
        return 'done';
      }
      const st = getBattleState(win);
      if (st.spectate || st.battleOver) {
        BOT.state.lastFightEnd = Date.now();
        return 'done';
      }
      if (!win.ME || Number(win.ME.hp) <= 0) {
        if (idle === 0 || idle % 20 === 0) log('Бой: мёртв/без HP — жду конец боя');
        idle++;
        BOT.state.turnReadySince = 0;
        await sleep(3000);
        continue;
      }
      if (!st.ready || st.loading || (!st.myTurn && !st.yourTurn)) {
        idle++;
        BOT.state.turnReadySince = 0;
        BOT.state.wasOurTurn = false;
        if (idle % 8 === 1) log('Бой: жду… ' + st.turnLabel);
        await sleep(humanDelay(800, 1500));
        continue;
      }
      if (Number(win.ME.md) !== 0 && !/ваш ход/i.test(st.turnLabel || '')) {
        BOT.state.turnReadySince = 0;
        BOT.state.wasOurTurn = false;
        await sleep(900);
        continue;
      }

      if (!BOT.state.wasOurTurn) {
        BOT.state.battleTurnSeq = (BOT.state.battleTurnSeq || 0) + 1;
        BOT.state.helperFailUntil = 0;
        BOT.state.wasOurTurn = true;
        log('Бой: ход #' + BOT.state.battleTurnSeq + ' — можно клонить');
      }

      const dMin = Math.max(200, Number(BOT.cfg.battle.delayMin) || 700);
      const dMax = Math.max(dMin, Number(BOT.cfg.battle.delayMax) || dMin);
      const tClock = st.turnLeftSec != null ? st.turnLeftSec : readTurnTimerSec(win);
      if (tClock != null && idle % 6 === 0) log('Бой: таймер ' + tClock + 'с · ' + (st.turnLabel || ''));

      // новый наш ход — запоминаем момент, чтобы выдержать паузу хода
      const roundKey =
        String(win.ROUND != null ? win.ROUND : '') +
        '|' +
        String(st.yourTurn ? 1 : 0) +
        '|' +
        String(win.ME && win.ME.tn);
      if (!BOT.state.turnReadySince || BOT.state.lastBattleRound !== roundKey) {
        BOT.state.turnReadySince = Date.now();
        BOT.state.lastBattleRound = roundKey;
        log('Бой: ваш ход — пауза ' + Math.round(dMin / 1000) + '–' + Math.round(dMax / 1000) + 'с');
      }

      const waited = Date.now() - BOT.state.turnReadySince;
      const hurry = tClock != null && tClock <= 14;
      if (!hurry && waited < dMin) {
        const left = dMin - waited;
        if (left > 2500 && left % 5000 < 2100) log('Бой: пауза хода ещё ~' + Math.round(left / 1000) + 'с');
        await sleep(Math.min(left, 2000));
        continue;
      }
      if (Date.now() - lastTurnAt < 1800) {
        await sleep(400);
        continue;
      }
      idle = 0;
      const pauseMs = humanDelay(dMin, dMax);
      // уже ждали dMin с начала хода — добиваем до случайной паузы в диапазоне
      const extra = hurry ? 0 : Math.max(0, pauseMs - waited);
      if (extra > 0) await sleep(extra);

      const live = getBattleState(win);
      if (!live.myTurn && !live.yourTurn) continue;
      if (!win.ME || Number(win.ME.hp) <= 0) continue;

      const needHeal = shouldBattleHeal(win, live);
      const tLive = live.turnLeftSec != null ? live.turnLeftSec : readTurnTimerSec(win);
      const skipBook = tLive != null && tLive <= 12;

      // Приоритет в хаосе: 1) вызвать помощника; 2) лечение (заклинание из книги магии) при HP ≤ порога.
      // Одно действие за ход (continue) — чтобы не кастовать И бить в одну секунду.
      if (skipBook) {
        log('Бой: мало времени (' + tLive + 'с) — без книги, сразу удар');
      }
      const summoned = skipBook ? false : await trySummonHelper(win, live);
      if (summoned) {
        lastTurnAt = Date.now();
        BOT.state.turnReadySince = 0;
        await sleep(humanDelay(600, 1200));
        continue;
      }

      if (needHeal && !skipBook) {
        // лечение — это заклинание в книге магии (magbook), а НЕ свиток из сумки
        const healed = await trySummonHealSpell(win, live);
        if (healed) {
          lastTurnAt = Date.now();
          BOT.state.turnReadySince = 0;
          await sleep(humanDelay(600, 1200));
          continue;
        }
        // вне хаоса как запасной вариант можно попробовать сумку/магию; в хаосе просто продолжаем бить
        if (!flagGet(FLAG.chaos)) {
          const healedBag = await tryBattleHealOrMagic(win, live);
          if (healedBag) {
            lastTurnAt = Date.now();
            BOT.state.turnReadySince = 0;
            await sleep(humanDelay(600, 1200));
            continue;
          }
        }
      }

      const live2 = getBattleState(win);
      if (!live2.myTurn && !live2.yourTurn) continue;
      if (!win.ME || Number(win.ME.hp) <= 0) continue;

      const result = playHumanTurn(win, live2);
      BOT.state.turnReadySince = 0;
      if (result.defense) {
        log('Бой: нет врага в радиусе — 4 блока ' + JSON.stringify(result.blocks || []));
        lastTurnAt = Date.now();
      } else if (result.moved) {
        log('Бой: сближение hd=' + result.hd);
        lastTurnAt = Date.now();
      } else if (result.ok) {
        log(
          'Бой ход → ' +
            result.enemy +
            ' hd=' +
            result.hd +
            (result.tactic ? ' [' + result.tactic + ']' : '') +
            ' R=' +
            JSON.stringify(result.right) +
            ' L=' +
            JSON.stringify(result.left)
        );
        lastTurnAt = Date.now();
      } else {
        log('Бой: ход не принят ' + (result.why || ''), 'err');
        try {
          if (typeof win.SwitchAttack === 'function') win.SwitchAttack(0, 1);
        } catch (e) {}
        await sleep(1000);
      }
      await sleep(humanDelay(400, 900));
    }
    return 'stopped';
  }

  /* ---------- workshop / chaos ---------- */
  async function getWorkshopStatus(win) {
    const text = win.document.body ? win.document.body.innerText : '';
    const needItems = /составлен не правильно|необходимо создать следующие/i.test(text);
    const wearBtns = [...win.document.querySelectorAll('input[type=button], input[type=submit]')].filter(
      function (b) {
        return /надеть/i.test(b.value || '');
      }
    );
    return {
      needItems: needItems,
      hasKit: /ваши комплекты/i.test(text) || wearBtns.length > 0,
      kits: wearBtns,
      text: text.replace(/\s+/g, ' ').slice(0, 400),
    };
  }

  async function createKhItem(win, itype) {
    go(win, 'arena_room_1_bmode_36_itype_' + itype + '_smode_1.html');
    await sleep(1800);
    win = getActWin();
    if (typeof win.Calc !== 'function') return { ok: false, why: 'no-calc' };
    win.document.querySelectorAll('input[id^="f_"]').forEach(function (el) {
      el.value = '0';
    });
    const spendEl = win.document.getElementById('f_con') || win.document.getElementById('f_str');
    if (!spendEl) return { ok: false, why: 'no-stat' };
    let best = 0;
    for (let v = 0; v <= 400; v++) {
      spendEl.value = String(v);
      if (win.Calc() === 0) {
        best = v;
        break;
      }
    }
    spendEl.value = String(best);
    if (win.Calc() !== 0) return { ok: false, why: 'points' };

    const params = new URLSearchParams();
    params.set('actBattleField-EditWeaponOnKH', '1');
    const ttype = win.document.querySelector('input[name="ttype"]');
    if (ttype) params.set('ttype', ttype.value);
    win.document.querySelectorAll('input[name^="Item"]').forEach(function (el) {
      params.set(el.name, el.value || '0');
    });
    let action = 'arena_room_1_bmode_36_smode_1.html';
    const form = win.document.forms['newitem'];
    if (form && form.getAttribute('action')) action = form.getAttribute('action');
    if (action === 'arena_bmode_36_smode_1.html') action = WORKSHOP_URL;
    if (!/^https?:/i.test(action)) action = new URL(action, win.location.href).href;

    const res = await win.fetch(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      credentials: 'same-origin',
    });
    await sleep(600);
    return { ok: res.status === 200, status: res.status };
  }

  async function ensureWorkshopKit() {
    let win = getActWin();
    log('Мастерская: проверяю комплект…');
    go(win, WORKSHOP_URL);
    await sleep(2000);
    win = getActWin();
    let st = await getWorkshopStatus(win);
    if (!st.needItems) {
      BOT.state.kitReady = true;
      log('Мастерская: комплект готов', 'ok');
      return true;
    }
    if (!st.hasKit) {
      log('Мастерская: создаю оболочку…');
      const name = win.document.querySelector('input[name="name"]');
      if (name) name.value = 'BotKit';
      const form = win.document.querySelector('input[name="actBattleField-SaveNewHaotComplect"]');
      if (form && form.form) form.form.submit();
      else {
        const btn = [...win.document.querySelectorAll('input[type=submit]')].find(function (b) {
          return /сохран/i.test(b.value || '');
        });
        if (btn) btn.click();
      }
      await sleep(2500);
      win = getActWin();
    }
    st = await getWorkshopStatus(win);
    if (st.kits.length) {
      log('Мастерская: надеваю оболочку…');
      win.confirm = function () {
        return true;
      };
      const btn = st.kits[0];
      const oc = btn.getAttribute('onclick');
      if (oc) {
        try {
          win.eval(oc);
        } catch (e) {
          btn.click();
        }
      } else btn.click();
      await sleep(2500);
    }
    for (let i = 0; i < KH_ITEM_TYPES.length; i++) {
      win = getActWin();
      go(win, WORKSHOP_URL);
      await sleep(1500);
      win = getActWin();
      st = await getWorkshopStatus(win);
      if (!st.needItems) break;
      log('Мастерская: ' + KH_ITEM_TYPES[i].name);
      await createKhItem(win, KH_ITEM_TYPES[i].itype);
    }
    go(getActWin(), WORKSHOP_URL);
    await sleep(1500);
    st = await getWorkshopStatus(getActWin());
    BOT.state.kitReady = !st.needItems;
    log(BOT.state.kitReady ? 'Мастерская: готово' : 'Мастерская: ещё невалидно', BOT.state.kitReady ? 'ok' : 'err');
    return BOT.state.kitReady;
  }

  function getAppsSnapshot(win) {
    win = win || getActWin();
    let href = '';
    try {
      href = String(win.location.href || '');
    } catch (e) {}
    const onChaos = /bmode_36/i.test(href);
    const text = win.document.body ? win.document.body.innerText : '';
    const joins = onChaos
      ? [...win.document.querySelectorAll('input[name="actBattle-Join"]')].map(function (j) {
          return { id: j.value, form: j.form };
        })
      : [];
    const cancel = onChaos
      ? [...win.document.querySelectorAll('input, button')].find(function (b) {
          return /отмен|покинуть|отказаться|выйти из заяв/i.test((b.value || '') + ' ' + (b.textContent || ''));
        })
      : null;
    const canCreate = onChaos && !!win.document.querySelector('input[name="actBattle-CreateHeader"]');
    const waitingCard = /\d+\s*\/\s*\d+/.test(text) && /ур\.|на ход/i.test(text);
    const inApp =
      onChaos &&
      (!!cancel ||
        /вы в заявке|ожидайте начала|покинуть заявку|отказаться|вы участвуете/i.test(text) ||
        (joins.length === 0 && !canCreate && waitingCard));
    return {
      joins: joins,
      inApp: inApp,
      canCreate: canCreate,
      needWorkshop: /мастерск|комплект/i.test(text) && /не правильно|необходимо/i.test(text),
      text: text.replace(/\s+/g, ' ').slice(0, 300),
    };
  }

  function joinFirstApp(win) {
    let href = '';
    try {
      href = String(win.location.href || '');
    } catch (e) {}
    if (!/bmode_36/i.test(href)) return { ok: false, why: 'not-bmode-36' };
    const joins = [...win.document.querySelectorAll('input[name="actBattle-Join"]')];
    if (!joins.length) return { ok: false };
    const join = joins[0];
    const form = join.form;
    if (!form) return { ok: false };
    const btn = [...form.querySelectorAll('input[type=submit]')].find(function (b) {
      return /принять|войти/i.test(b.value || '');
    });
    if (btn && form.requestSubmit) form.requestSubmit(btn);
    else if (btn) btn.click();
    else form.submit();
    return { ok: true, id: join.value };
  }

  function createApp(win) {
    const cfg = BOT.cfg.chaos;
    let href = '';
    try {
      href = String(win.location.href || '');
    } catch (e) {}
    if (!/bmode_36/i.test(href)) {
      return { ok: false, why: 'not-bmode-36', href: href.split('/').pop() };
    }
    const min = win.document.querySelector('[name="Battle{minlvl}"]');
    const max = win.document.querySelector('[name="Battle{maxlvl}"]');
    const mp = win.document.querySelector('[name="Battle{maxp}"]');
    if (min) min.value = String(cfg.minlvl);
    if (max) max.value = String(cfg.maxlvl);
    if (mp) mp.value = String(cfg.maxp || 6);
    const btn = win.document.querySelector(
      'input[name="actBattle-CreateHeader"], input[type=submit][name*="Create"]'
    );
    if (!btn) {
      return { ok: false, why: 'no-CreateHeader', href: href.split('/').pop() };
    }
    let form = btn.form || win.document.querySelector('form[action*="bmode_36"]');
    if (form) {
      win.document.querySelectorAll('input[name^="Battle{"], select[name^="Battle{"]').forEach(function (el) {
        try {
          form.appendChild(el);
        } catch (e) {}
      });
      try {
        form.appendChild(btn);
      } catch (e) {}
      if (form.requestSubmit) form.requestSubmit(btn);
      else btn.click();
    } else btn.click();
    return { ok: true };
  }

  async function reloadApps(win) {
    if (isBigForestUi(win)) {
      await ensureChaosAppsPage();
      return;
    }
    try {
      win.refreshed = false;
      if (typeof win.actReload === 'function') win.actReload();
      else goDact(APPS_URL);
    } catch (e) {
      try {
        goDact(APPS_URL);
      } catch (e2) {}
    }
    await sleep(2000);
  }

  function shouldStopSession(win) {
    if (!(BOT.state.fightSessionLimit > 0 && BOT.state.fightSessionStart)) return false;
    if (Date.now() - BOT.state.fightSessionStart <= BOT.state.fightSessionLimit) return false;
    // НЕ останавливаться, если персонаж в бою — доигрываем
    if (isBattleWin(win || getActWin())) {
      if (!BOT.state.sessionExpirePending) {
        BOT.state.sessionExpirePending = true;
        log('Сессия: время вышло, но идёт бой — доигрываем');
      }
      return false;
    }
    return true;
  }

  async function chaosTick() {
    if (!flagGet(FLAG.chaos) || flagGet(FLAG.captcha)) return;
    BOT.state.lastTickAt = Date.now();
    watchCaptcha();
    let win = getActWin();

    if (isBattleWin(win)) {
      BOT.state.emptyAppsSince = 0;
      if (BOT.cfg.chaos.fight) {
        const pauseNeed = BOT.state.lastFightEnd
          ? rand(BOT.cfg.battle.pauseBetweenFightsMinMs, BOT.cfg.battle.pauseBetweenFightsMaxMs) -
            (Date.now() - BOT.state.lastFightEnd)
          : 0;
        if (pauseNeed > 0 && BOT.state.lastFightEnd) {
          /* уже в бою — не ждём */
        }
        shouldStopSession(win);
        await runBattleLoop(win);
        if (BOT.state.sessionExpirePending) {
          log('Бой окончен — стоп по лимиту сессии', 'ok');
          BOT.state.sessionExpirePending = false;
          flagSet(FLAG.chaos, false);
          updateUi();
          return;
        }
        const pause = humanDelay(
          BOT.cfg.battle.pauseBetweenFightsMinMs,
          BOT.cfg.battle.pauseBetweenFightsMaxMs
        );
        log('Пауза между боями ' + Math.round(pause / 1000) + 'с');
        await sleep(pause);
        goDact(APPS_URL);
        await sleep(2000);
      }
      return;
    }

    if (BOT.state.sessionExpirePending || shouldStopSession(win)) {
      log('Лимит сессии — стоп хаосов (вне боя)');
      BOT.state.sessionExpirePending = false;
      flagSet(FLAG.chaos, false);
      updateUi();
      return;
    }

    if (isBigForestUi(win)) {
      await ensureChaosAppsPage();
      return;
    }

    // Только королевские хаосы (bmode_36). Обычная арена arena_room_1.html — другой режим.
    if (!/bmode_36/i.test(win.location.href)) {
      await ensureChaosAppsPage();
      return;
    }

    if (BOT.cfg.chaos.ensureKit && !BOT.state.kitChecked) {
      BOT.state.kitChecked = true;
      try {
        await ensureWorkshopKit();
      } catch (e) {
        log('Мастерская: ' + (e.message || e), 'err');
        BOT.state.kitReady = false;
      }
      goDact(APPS_URL);
      await sleep(2200);
      return;
    }

    // Мастерская = smode_1. Список заявок тоже бывает с itype_0 (smode_0) — не путать!
    if (/smode_1/i.test(win.location.href) && !isBigForestUi(win)) {
      log('Хаос: мастерская → заявки');
      goDact(APPS_URL);
      await sleep(2000);
      return;
    }

    const snap = getAppsSnapshot(win);
    if (snap.needWorkshop || (BOT.cfg.chaos.ensureKit && !BOT.state.kitReady)) {
      BOT.state.kitChecked = false;
      await sleep(1500);
      return;
    }

    if (snap.inApp) {
      BOT.state.emptyAppsSince = 0;
      log('Хаос: в заявке, жду…');
      if (BOT.cfg.chaos.fight) {
        const deadline = Date.now() + 300000;
        while (Date.now() < deadline && flagGet(FLAG.chaos) && !flagGet(FLAG.captcha)) {
          await sleep(4000);
          win = getActWin();
          if (isBattleWin(win)) {
            await runBattleLoop(win);
            break;
          }
          await reloadApps(win);
          const s2 = getAppsSnapshot(getActWin());
          if (!s2.inApp) break;
        }
      }
      return;
    }

    if (!snap.canCreate && !snap.joins.length) {
      if (Date.now() - (BOT.state.lastChaosNavAt || 0) < 8000) {
        await sleep(1200);
        return;
      }
      BOT.state.lastChaosNavAt = Date.now();
      await ensureChaosAppsPage();
      return;
    }

    if (!snap.joins.length) {
      if (!BOT.state.emptyAppsSince) BOT.state.emptyAppsSince = Date.now();
      const emptyFor = Date.now() - BOT.state.emptyAppsSince;
      if (emptyFor >= (BOT.cfg.chaos.reloadEmptyMs || 15000)) {
        log('Хаос: нет заявок ' + Math.round(emptyFor / 1000) + 'с — обновляю');
        await reloadApps(win);
        BOT.state.emptyAppsSince = Date.now();
        return;
      }
    } else BOT.state.emptyAppsSince = 0;

    let action = null;
    if (Date.now() - (BOT.state.lastJoinAt || 0) < 10000) {
      log('Хаос: жду подтверждение входа…');
      await sleep(2000);
      return;
    }
    if (BOT.cfg.chaos.autoJoin && snap.joins.length) {
      action = joinFirstApp(win);
      log('Хаос: join ' + JSON.stringify(action));
    } else if (BOT.cfg.chaos.autoCreate && !snap.joins.length) {
      action = createApp(win);
      log('Хаос: create ' + JSON.stringify(action));
    }

    if (action && action.ok) {
      BOT.state.emptyAppsSince = 0;
      BOT.state.lastJoinAt = Date.now();
      await sleep(3500);
      const after = getAppsSnapshot(getActWin());
      if (after.inApp) return;
      if (!after.inApp && after.joins.some(function (j) {
        return j.id === action.id;
      })) {
        log('Хаос: вход не принят — перепроверю мастерскую', 'err');
        BOT.state.kitChecked = false;
        BOT.state.kitReady = false;
        BOT.state.lastJoinAt = 0;
      }
    }
  }

  /* ---------- forest loop ---------- */
  async function forestTick() {
    if (!flagGet(FLAG.forest) || flagGet(FLAG.captcha)) return;
    refreshCfg();
    watchCaptcha();
    const win = getActWin();
    if (!forestReady(win)) {
      log('Жду cu/gd / newforest…');
      return;
    }
    if (isCityForest(win)) {
      log('Остановка: городской лес. Нужен большой лес (ворота / фортпост / телепорт).', 'err');
      flagSet(FLAG.forest, false);
      if (forestSched) {
        clearTimeout(forestSched);
        forestSched = null;
      }
      updateUi();
      return;
    }
    try {
      const href = forestHref(win);
      if (href && !/bag_|bmode_|arena_|battle/i.test(href)) BOT.state.lastForestHref = href;
    } catch (eHref) {}

    // —— Большой лес (newforest2) ——
    if (isBigForestWin(win)) {
      try {
        await newForestTick(win);
      } catch (e) {
        log('newforest: ' + (e.message || e), 'err');
      }
      return;
    }

    hookForest(win);
    dismissModal(win);

    if (isBattleWin(win)) {
      log('Лес: бой (дух?)');
      await runBattleLoop(win);
      // Вернуться в тот же лес (фортпост/телепорт), не в городской forest.html
      const back = BOT.state.lastForestHref;
      const restore =
        back && /5kings\.ru/i.test(back)
          ? back.replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '')
          : (back.split('/').pop() || '').split('#')[0] || 'forest.html';
      go(getActWin(), restore);
      await sleep(2500);
      return;
    }

    const errors = pullLogs(win);
    await maybeHeal(win);

    if (BOT.state.craftBusy) {
      await maybeHeal(win);
      await sleep(humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax));
      return;
    }

    let me = getMe(win);
    if (!me) {
      me = await discoverMe(win);
      if (!me) return;
    }

    const targets = listTargets(win);
    const target = nearestTarget(me, targets);

    // поиск — только для деревьев/руды; травы/грибы — без скана
    const needSearch =
      forestNeedsCraftSearch() &&
      BOT.cfg.forest.autoSearch &&
      Date.now() - (BOT.state.forestTimers.lastSearchAt || 0) > BOT.cfg.forest.searchWaitMs + 5000 &&
      targets.some(function (t) {
        return isCraftType(t.imgType);
      });

    if (needSearch) {
      log('Поиск ресурса (~30с)…');
      BOT.state.forestTimers.lastSearchAt = Date.now();
      clickSearchUi(win);
      const until = Date.now() + BOT.cfg.forest.searchWaitMs;
      while (Date.now() < until && flagGet(FLAG.forest) && !flagGet(FLAG.captcha)) {
        await sleep(2000);
        dismissModal(win);
        pullLogs(win);
        await maybeHeal(win);
        if (isBattleWin(getActWin())) break;
      }
      if (BOT.state.searchHint) {
        me = getMe(win) || me;
        await followSearchHint(win, me, BOT.state.searchHint);
      }
      return;
    }

    if (!target) {
      if (
        forestNeedsCraftSearch() &&
        BOT.cfg.forest.autoSearch &&
        Date.now() - (BOT.state.forestTimers.lastSearchAt || 0) > BOT.cfg.forest.searchWaitMs
      ) {
        BOT.state.forestTimers.lastSearchAt = Date.now();
        clickSearchUi(win);
        await sleep(BOT.cfg.forest.searchWaitMs);
      } else {
        log('Нет целей, жду…');
        await sleep(humanDelay(2000, 4000));
      }
      return;
    }

    if (errors.length) applyErrorBans(errors, target);

    if (me.x === target.x && me.y === target.y) {
      const mode = isStepOnType(target.imgType) ? 'наступление' : 'крафт';
      log('Добыча (' + mode + ') abs=' + target.abs + ' img=' + target.imgType);
      BOT.state.craftBusy = true;
      goToAbs(win, target.abs);
      await sleep(humanDelay(800, 1400));
      dismissModal(win);
      const err2 = pullLogs(win);
      applyErrorBans(err2, target);
      await maybeHeal(win);
      if (err2.some(function (e) {
        return PROFESSION_HINTS.some(function (re) {
          return re.test(e);
        });
      })) {
        BOT.state.craftBusy = false;
      } else if (isStepOnType(target.imgType)) {
        await sleep(humanDelay(600, 1200));
        BOT.state.craftBusy = false;
        BOT.state.bannedAbs.add(String(target.abs));
      } else {
        setTimeout(function () {
          if (BOT.state.craftBusy) {
            BOT.state.craftBusy = false;
            try {
              getActWin().cu.send('actHunter-DropCraft=1');
            } catch (e) {}
            log('Крафт: таймаут');
          }
        }, 200000);
      }
      return;
    }

    log('Иду к abs=' + target.abs + ' img=' + target.imgType);
    goToAbs(win, target.abs);
    await sleep(humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax));
    dismissModal(win);
    applyErrorBans(pullLogs(win), target);
  }

  /* ---------- schedulers ---------- */
  let forestSched = null;
  let chaosSched = null;

  function scheduleForest(immediate) {
    if (!isController()) return;
    if (forestSched) clearTimeout(forestSched);
    if (!flagGet(FLAG.forest)) return;
    let delay = immediate ? 300 : humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax);
    // к точке — без длинной паузы между сегментами пути
    if (!immediate && BOT.state.gotoTarget) delay = Math.min(delay, 220);
    forestSched = setTimeout(async function () {
      try {
        await forestTick();
      } catch (e) {
        log('forest: ' + (e.message || e), 'err');
      }
      scheduleForest(false);
    }, delay);
  }

  function scheduleChaos(immediate) {
    if (!isController()) return;
    if (chaosSched) clearTimeout(chaosSched);
    if (!flagGet(FLAG.chaos)) return;
    const delay = immediate ? 500 : BOT.cfg.chaos.pollMs || 4000;
    chaosSched = setTimeout(async function () {
      try {
        await chaosTick();
      } catch (e) {
        log('chaos: ' + (e.message || e), 'err');
      }
      scheduleChaos(false);
    }, delay);
  }

  async function startForest() {
    try {
      if (!checkLicense()) {
        log('Лицензия блокирует старт — снимите галку «привязка UserID»', 'err');
        return;
      }
      if (flagGet(FLAG.captcha) || BOT.state.captchaPaused) {
        if (!clearCaptchaIfGone(false)) {
          log('Сначала нажмите «Продолжить после капчи» (или решите капчу на экране)', 'err');
          return;
        }
      }
      // Ждём появления d_act (game.html грузит iframe с задержкой)
      let win = getActWin();
      if (!win && /game\.html/i.test(getTopWin().location.href)) {
        log('Жду кадр d_act…');
        for (let i = 0; i < 25; i++) {
          await sleep(400);
          if (document.getElementById('d_act') || getActWin()) break;
        }
        win = getActWin();
      }
      if (!isGameShell() && !forestReady(PAGE)) {
        if (!/game\.html/i.test(String(getTopWin().location.href || location.href))) {
          log('Откройте game.html, зайдите в большой лес, затем Старт.', 'err');
          return;
        }
        log('Нет кадра d_act. Вы вошли в игру? F5 на game.html', 'err');
        return;
      }
      win = getActWin();
      if (!win) {
        log('Кадр d_act не найден. F5 на game.html.', 'err');
        return;
      }

      // НЕ форсим forest.html — это городской лес с площади.
      // Большой лес (ворота / фортпост / телепорт) уже открыт в d_act — ждём cu/gd.
      if (!forestReady(win)) {
        log('Жду загрузку леса (cu/gd)… Не уходите с карты.');
        for (let i = 0; i < 30; i++) {
          await sleep(500);
          win = getActWin();
          if (forestReady(win)) break;
          refreshDiag();
        }
      }
      if (!forestReady(getActWin())) {
        log(
          'Лес не готов (нет cu/gd). Зайдите в БОЛЬШОЙ лес через ворота / фортпост / телепорт, дождитесь карты и снова Старт. Не жмите «Лес» на площади — это городской.',
          'err'
        );
        flagSet(FLAG.forest, false);
        updateUi();
        refreshDiag();
        return;
      }
      win = getActWin();
      if (isCityForest(win)) {
        log(
          'Сейчас городской лес (кнопка «На улицу»). Бот рассчитан на большой лес: выйдите через ворота/фортпост/телепорт и нажмите Старт там.',
          'err'
        );
        flagSet(FLAG.forest, false);
        if (forestSched) {
          clearTimeout(forestSched);
          forestSched = null;
        }
        updateUi();
        return;
      }

      flagSet(FLAG.forest, true);
      BOT.state.bannedAbs = new Set();
      BOT.state.bannedTypes = new Set();

      // —— Большой лес newforest2 ——
      if (isBigForestWin(win)) {
        if (!forestReady(win)) {
          log('Жду WS/my_group большого леса…');
          for (let i = 0; i < 40; i++) {
            await sleep(500);
            win = getActWin();
            if (forestReady(win)) break;
          }
        }
        if (!forestReady(getActWin())) {
          log('Большой лес не готов (нет Client/my_group). Подождите карту и снова Старт.', 'err');
          flagSet(FLAG.forest, false);
          updateUi();
          return;
        }
        if (BOT.cfg.forest.equipTool) {
          log('Инструмент: кирка/топор надеваются из popup-сумки, карта не сбрасывается');
        }
        hookBigForest(getActWin());
        await discoverMe(getActWin());
        const startN = naprFromStartDir(getActWin());
        BOT.state.wanderNapr = startN;
        BOT.state.localNapr = startN;
        BOT.state.lastSeenGroupNapr = startN;
        BOT.state.stuckCount = 0;
        BOT.state.moveWatch = null;
        BOT.state.idleWatch = null;
        BOT.state.busySince = 0;
        BOT.state.radarCalibrated = false;
        BOT.state.stepTarget = null;
        turnToFace(getActWin(), startN);
        log(
          'Лес СТАРТ v' +
            VERSION +
            ' BIG @ ' +
            forestHref(getActWin()).split('/').pop() +
            ' курс ' +
            startN +
            (String(BOT.cfg.forest.startDir || 'face') === 'face' ? ' (как стоит)' : ''),
          'ok'
        );
        scheduleForest(true);
        updateUi();
        return;
      }

      discoverMushroomTypes(win);
      hookForest(win);
      if (BOT.cfg.forest.equipTool) {
        try {
          await equipTool();
          win = getActWin();
          if (!forestReady(win)) {
            log('После сумки лес пропал — вернитесь на карту большого леса и Старт', 'err');
            flagSet(FLAG.forest, false);
            updateUi();
            return;
          }
          hookForest(win);
        } catch (e) {
          log('Инструмент: ' + (e.message || e), 'err');
        }
      }
      await discoverMe(getActWin());
      log('Лес СТАРТ v' + VERSION + ' @ ' + forestHref(getActWin()).split('/').pop(), 'ok');
      scheduleForest(true);
      updateUi();
    } catch (e) {
      log('Старт леса: ' + (e && e.message ? e.message : e), 'err');
      try {
        console.error('[5k-bot]', e);
      } catch (e2) {}
    }
  }

  function stopForest() {
    flagSet(FLAG.forest, false);
    BOT.state.craftBusy = false;
    BOT.state.gotoTarget = null;
    if (forestSched) clearTimeout(forestSched);
    log('Лес СТОП');
    updateUi();
  }

  function startChaos() {
    if (!checkLicense()) return;
    if (flagGet(FLAG.captcha) || BOT.state.captchaPaused) {
      if (!clearCaptchaIfGone(false)) {
        log('Сначала снимите капчу (кнопка «Продолжить после капчи»)', 'err');
        return;
      }
    }
    flagSet(FLAG.chaos, true);
    BOT.state.kitChecked = false;
    BOT.state.emptyAppsSince = 0;
    BOT.state.helperDisabled = false;
    BOT.state.helperFailUntil = 0;
    BOT.state.helperMissCount = 0;
    BOT.state.helperCastRound = '';
    BOT.state.helperCastSeq = 0;
    BOT.state.battleTurnSeq = 0;
    BOT.state.wasOurTurn = false;
    BOT.state.healFailUntil = 0;
    BOT.state.healSpellMissUntil = 0;
    BOT.state.fightSessionStart = Date.now();
    BOT.state.sessionExpirePending = false;
    let limMin = Number(BOT.cfg.battle.sessionMaxMin) || 0;
    const lo = Math.max(20, Number(BOT.cfg.battle.sessionMinMin) || 20);
    const hi = Math.max(lo, Number(BOT.cfg.battle.sessionMaxCap) || 120);
    if (limMin > 0) limMin = Math.min(hi, Math.max(lo, limMin));
    BOT.state.fightSessionLimit = limMin > 0 ? limMin * 60000 : rand(lo, hi) * 60000;
    log('Хаосы СТАРТ v' + VERSION + ' сессия ~' + Math.round(BOT.state.fightSessionLimit / 60000) + ' мин', 'ok');
    scheduleChaos(true);
    updateUi();
  }

  function stopChaos() {
    flagSet(FLAG.chaos, false);
    if (chaosSched) clearTimeout(chaosSched);
    log('Хаосы СТОП');
    updateUi();
  }

  /* ---------- UI ---------- */
  function shouldShowUi() {
    // почти на любой странице игры после логина
    try {
      const href = String((getTopWin().location && getTopWin().location.href) || location.href || '');
      if (/5kings\.ru/i.test(href)) return true;
    } catch (e) {}
    return true;
  }

  function injectUi() {
    const doc = getTopDoc();
    if (doc.getElementById('k5-panel')) return;
    if (!shouldShowUi()) return;
    if (!doc.body) {
      setTimeout(injectUi, 400);
      return;
    }

    // Стили в тот же document, что и панель (GM_addStyle иначе не попадает в top)
    const css =
      '#k5-panel{position:fixed;top:8px;right:8px;z-index:2147483646;width:320px;background:#1b2418;color:#e8e0c8;' +
      'border:1px solid #6b5a32;font:12px/1.35 Tahoma,Verdana,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.45)}' +
      '#k5-panel header{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#2a3324;cursor:move}' +
      '#k5-panel header strong{color:#d4b56a}' +
      '#k5-panel .k5-body{padding:8px 10px;max-height:78vh;overflow:auto}' +
      '#k5-panel.k5-collapsed .k5-body{display:none}' +
      '#k5-panel label{display:flex;gap:6px;align-items:center;margin:3px 0}' +
      '#k5-panel .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}' +
      '#k5-panel button{background:#3d4a30;color:#f0e6c8;border:1px solid #7a6a3a;padding:5px 8px;cursor:pointer}' +
      '#k5-panel button.on{background:#2f5a2f;border-color:#6a9a4a}' +
      '#k5-panel button.danger{background:#5a3030}' +
      '#k5-status{margin:6px 0;padding:6px;background:#12180f;border:1px solid #3a4530;min-height:32px}' +
      '#k5-log{margin-top:8px;max-height:160px;overflow:auto;background:#12180f;padding:6px;border:1px solid #3a4530}' +
      '#k5-log div{margin:0 0 4px;word-break:break-word}' +
      '.k5-log-err{color:#f0a0a0}.k5-log-ok{color:#a0d0a0}.k5-log-info{color:#c8c0a8}' +
      '#k5-cap-badge{display:none;background:#a33;color:#fff;padding:2px 6px;margin-left:6px;font-size:11px}' +
      '#k5-diag{opacity:.85;font-size:11px;margin-top:4px}' +
      '#k5-panel select,#k5-panel input[type=number],#k5-panel input[type=text]{background:#12180f;color:#e8e0c8;border:1px solid #3a4530;padding:2px 4px;width:100%}';
    const style = doc.createElement('style');
    style.id = 'k5-style';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
    try {
      GM_addStyle(css);
    } catch (e) {}

    const panel = doc.createElement('div');
    panel.id = 'k5-panel';
    if (BOT.cfg.ui.collapsed) panel.classList.add('k5-collapsed');
    panel.innerHTML =
      '<header><strong>5Kings Bot v' +
      VERSION +
      '</strong><span id="k5-cap-badge">КАПЧА</span><button type="button" id="k5-toggle">_</button></header>' +
      '<div class="k5-body">' +
      '<div id="k5-status">инициализация…</div><div id="k5-diag"></div>' +
      '<div><b>Лес</b></div>' +
      '<label><input type="checkbox" data-cfg="forest.collectTrees"> деревья</label>' +
      '<label><input type="checkbox" data-cfg="forest.collectCopper"> медь</label>' +
      '<label><input type="checkbox" data-cfg="forest.collectIron"> железо</label>' +
      '<label><input type="checkbox" data-cfg="forest.collectGold"> золото</label>' +
      '<label><input type="checkbox" data-cfg="forest.collectHerbs"> травы</label>' +
      '<label><input type="checkbox" data-cfg="forest.collectMushrooms"> грибы</label>' +
      '<label style="margin-left:12px"><input type="checkbox" data-cfg="forest.mushroomCat1"> грибы 1 кат. (статы)</label>' +
      '<label style="margin-left:12px"><input type="checkbox" data-cfg="forest.mushroomCat2"> грибы 2 кат. (+обереги)</label>' +
      '<label style="margin-left:12px"><input type="checkbox" data-cfg="forest.mushroomCat3"> грибы 3 кат. (−обереги)</label>' +
      '<label><input type="checkbox" data-cfg="forest.autoSearch"> автопоиск (деревья/руда, каждые N шагов)</label>' +
      '<label>поиск каждые N шагов <input type="number" min="1" max="20" data-cfg-num="forest.searchEverySteps"></label>' +
      '<label><input type="checkbox" data-cfg="forest.equipTool"> надеть инструмент</label>' +
      '<label><input type="checkbox" data-cfg="forest.autoHeal"> лечение травм</label>' +
      '<label>режим хила <select data-cfg-val="forest.healMode"><option value="auto">auto</option><option value="scroll">свиток</option><option value="ability">абилка</option><option value="wait">ожидание</option></select></label>' +
      '<label>ID абилки лечения <input type="text" data-cfg-val="forest.healAbilityId" placeholder="пусто = по названию"></label>' +
      '<label>ждать заживления, мин <input type="number" min="1" data-cfg-num="forest.injuryWaitMs" data-scale="60000"></label>' +
      '<label>курс при старте <select data-cfg-val="forest.startDir"><option value="face">как стоит персонаж</option><option value="5">север</option><option value="6">северо-восток</option><option value="7">восток</option><option value="8">юго-восток</option><option value="1">юг</option><option value="2">юго-запад</option><option value="3">запад</option><option value="4">северо-запад</option></select></label>' +
      '<label><input type="checkbox" data-cfg="forest.holdCourse"> держать курс (менять только у препятствия)</label>' +
      '<label><input type="checkbox" data-cfg="forest.useRadar"> радар (грибы/травы вне видимости)</label>' +
      '<div>идти к точке (X Y)</div>' +
      '<div class="row"><input type="number" id="k5-goto-x" placeholder="X" style="width:42%"><input type="number" id="k5-goto-y" placeholder="Y" style="width:42%"></div>' +
      '<div class="row"><button type="button" id="k5-goto">Гоу</button><button type="button" id="k5-goto-stop" class="danger">Стоп точки</button></div>' +
      '<div class="row">' +
      '<button type="button" id="k5-forest-start">Старт лес</button>' +
      '<button type="button" id="k5-forest-stop" class="danger">Стоп</button>' +
      '<button type="button" id="k5-discover">Найти себя</button></div>' +
      '<hr style="border-color:#3a4530;margin:10px 0">' +
      '<div><b>Хаосы 3×3</b></div>' +
      '<label><input type="checkbox" data-cfg="chaos.autoJoin"> авто-вход</label>' +
      '<label><input type="checkbox" data-cfg="chaos.autoCreate"> авто-создание</label>' +
      '<label><input type="checkbox" data-cfg="chaos.ensureKit"> комплект KH</label>' +
      '<label><input type="checkbox" data-cfg="chaos.fight"> бой AI (удары/блоки)</label>' +
      '<label><input type="checkbox" data-cfg="battle.moveInBattle"> перемещаться в бою (иначе 4 блока вне радиуса)</label>' +
      '<label>тактика боя <select data-cfg-val="battle.tactic"><option value="defense">защитный (4 блока)</option><option value="standard">стандартный (2 блока + 1 удар)</option><option value="aggressive">агрессивный (2 удара)</option></select></label>' +
      '<label><input type="checkbox" data-cfg="battle.summonHelper"> вызывать помощника (1 раз за раунд)</label>' +
      '<label>имя закл. помощника <input type="text" data-cfg-val="battle.helperSpell"></label>' +
      '<label>ID формы помощника (если пусто — поиск по имени) <input type="text" data-cfg-val="battle.helperFormId" placeholder="например 10003"></label>' +
      '<label>ссылка боевой книги (из адресной строки книги в хаосе) <input type="text" data-cfg-val="battle.magicBookUrl" placeholder="/magbook.chtml"></label>' +
      '<label><input type="checkbox" data-cfg="battle.useMagic"> хил в бою (заклинание из книги магии)</label>' +
      '<label>имя закл. хила <input type="text" data-cfg-val="battle.healSpell" placeholder="Восстановить здоровье"></label>' +
      '<label>хил если HP% ≤ <input type="number" min="1" max="99" data-cfg-num="battle.healBelowHpPct"></label>' +
      '<label>пауза ПЕРЕД действием в ходу, мс мин/макс</label>' +
      '<div class="row"><input type="number" min="200" data-cfg-num="battle.delayMin" style="width:48%"><input type="number" min="200" data-cfg-num="battle.delayMax" style="width:48%"></div>' +
      '<label>шанс случ.магии вне хаоса 0–1 <input type="number" min="0" max="1" step="0.05" data-cfg-num="battle.magicChance"></label>' +
      '<label>шанс кривого хода (рандом зон) 0–1 <input type="number" min="0" max="1" step="0.05" data-cfg-num="battle.suboptimalChance"></label>' +
      '<label>лимит сессии, мин (0 = случайно 20–120) <input type="number" min="0" max="120" data-cfg-num="battle.sessionMaxMin"></label>' +
      '<div class="row">' +
      '<button type="button" id="k5-chaos-open">Комната</button>' +
      '<button type="button" id="k5-chaos-start">Старт</button>' +
      '<button type="button" id="k5-chaos-stop" class="danger">Стоп</button></div>' +
      '<hr style="border-color:#3a4530;margin:10px 0">' +
      '<div><b>Безопасность</b></div>' +
      '<label><input type="checkbox" data-cfg="captcha.detect"> детект капчи</label>' +
      '<label><input type="checkbox" data-cfg="captcha.beep"> звук</label>' +
      '<label><input type="checkbox" data-cfg="license.enabled"> привязка UserID</label>' +
      '<label>разрешённые ID (через запятую)<input type="text" id="k5-license-ids"></label>' +
      '<div class="row"><button type="button" id="k5-cap-resume">Продолжить после капчи</button></div>' +
      '<div class="row"><button type="button" id="k5-add-uid">Добавить текущий UserID</button></div>' +
      '<div id="k5-log"></div></div>';

    doc.body.appendChild(panel);

    panel.querySelector('#k5-toggle').onclick = function () {
      panel.classList.toggle('k5-collapsed');
      BOT.cfg.ui.collapsed = panel.classList.contains('k5-collapsed');
      saveCfg();
    };
    panel.querySelector('#k5-forest-start').onclick = function () {
      startForest();
    };
    panel.querySelector('#k5-forest-stop').onclick = stopForest;
    panel.querySelector('#k5-goto').onclick = function () {
      const x = Number(panel.querySelector('#k5-goto-x').value);
      const y = Number(panel.querySelector('#k5-goto-y').value);
      if (!isFinite(x) || !isFinite(y)) {
        log('Точка: введите X и Y', 'err');
        return;
      }
      BOT.state.gotoTarget = { x: Math.round(x), y: Math.round(y) };
      log('Точка: иду к ' + BOT.state.gotoTarget.x + ',' + BOT.state.gotoTarget.y, 'ok');
      if (!flagGet(FLAG.forest)) startForest();
    };
    panel.querySelector('#k5-goto-stop').onclick = function () {
      BOT.state.gotoTarget = null;
      log('Точка: отмена');
    };
    panel.querySelector('#k5-discover').onclick = function () {
      discoverMe(getActWin());
    };
    panel.querySelector('#k5-chaos-open').onclick = function () {
      (async function () {
        await ensureChaosAppsPage();
      })();
    };
    panel.querySelector('#k5-chaos-start').onclick = startChaos;
    panel.querySelector('#k5-chaos-stop').onclick = stopChaos;
    panel.querySelector('#k5-cap-resume').onclick = resumeAfterCaptcha;
    panel.querySelector('#k5-add-uid').onclick = function () {
      const uid = getUserId();
      if (!uid) return log('UserID не найден', 'err');
      const list = BOT.cfg.license.allowedUserIds || [];
      if (list.indexOf(String(uid)) < 0) list.push(String(uid));
      BOT.cfg.license.allowedUserIds = list;
      saveCfg();
      syncLicenseInput();
      log('Добавлен UserID ' + uid, 'ok');
    };

    panel.querySelectorAll('[data-cfg]').forEach(function (input) {
      const path = input.getAttribute('data-cfg').split('.');
      let ref = BOT.cfg;
      for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]];
      const key = path[path.length - 1];
      input.checked = !!ref[key];
      input.onchange = function () {
        // всегда пишем в актуальный BOT.cfg (после refreshCfg объект мог смениться)
        let r = BOT.cfg;
        for (let i = 0; i < path.length - 1; i++) r = r[path[i]];
        r[path[path.length - 1]] = input.checked;
        saveCfg();
        log('Настройка ' + path.join('.') + ' = ' + input.checked);
      };
    });
    panel.querySelectorAll('[data-cfg-val]').forEach(function (input) {
      const path = input.getAttribute('data-cfg-val').split('.');
      let ref = BOT.cfg;
      for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]];
      const key = path[path.length - 1];
      input.value = ref[key] == null ? '' : ref[key];
      input.onchange = function () {
        ref[key] = input.value;
        saveCfg();
      };
    });
    panel.querySelectorAll('[data-cfg-num]').forEach(function (input) {
      const path = input.getAttribute('data-cfg-num').split('.');
      const scale = Number(input.getAttribute('data-scale')) || 1;
      let ref = BOT.cfg;
      for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]];
      const key = path[path.length - 1];
      const raw = Number(ref[key]);
      input.value = scale !== 1 && isFinite(raw) ? raw / scale : raw;
      function commitNum() {
        const n = Number(input.value);
        ref[key] = isFinite(n) ? n * scale : 0;
        saveCfg();
      }
      input.onchange = commitNum;
      input.onblur = commitNum;
    });

    function syncLicenseInput() {
      const el = panel.querySelector('#k5-license-ids');
      if (!el) return;
      el.value = (BOT.cfg.license.allowedUserIds || []).join(', ');
      el.onchange = function () {
        BOT.cfg.license.allowedUserIds = el.value
          .split(',')
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        saveCfg();
      };
    }
    syncLicenseInput();

    const header = panel.querySelector('header');
    let drag = null;
    const topView = doc.defaultView || getTopWin();
    header.addEventListener('mousedown', function (e) {
      drag = { x: e.clientX - panel.offsetLeft, y: e.clientY - panel.offsetTop };
      e.preventDefault();
    });
    topView.addEventListener('mousemove', function (e) {
      if (!drag) return;
      panel.style.left = e.clientX - drag.x + 'px';
      panel.style.top = e.clientY - drag.y + 'px';
      panel.style.right = 'auto';
    });
    topView.addEventListener('mouseup', function () {
      drag = null;
    });

    // hook point for future captcha solver
    try {
      getTopWin().__k5_captchaSolverHook = function (fn) {
        getTopWin().__k5_captchaSolver = fn;
        log('Captcha solver hook установлен', 'ok');
      };
    } catch (e) {}

    log('UI v' + VERSION + ' готов. Большой лес: ворота / фортпост / телепорт → Старт.', 'ok');
    updateUi();
  }

  function refreshDiag() {
    const el = getTopDoc().getElementById('k5-diag');
    if (!el) return;
    const win = getActWin();
    let me = null;
    let botsN = 0;
    let addN = 0;
    try {
      if (win) me = getMe(win);
    } catch (e) {}
    try {
      if (win) {
        botsN = listBots(win).length;
        addN = (win.gd && win.gd.add_items && win.gd.add_items.length) || 0;
      }
    } catch (e) {}
    let dactHref = '-';
    try {
      const elAct = getTopDoc().getElementById('d_act');
      dactHref = elAct && elAct.contentWindow ? String(elAct.contentWindow.location.href).split('/').pop() : 'нет';
    } catch (e) {
      dactHref = 'err';
    }
    el.textContent =
      'shell=' +
      isGameShell() +
      ' d_act=' +
      dactHref +
      ' cu=' +
      !!(win && win.cu) +
      ' battle=' +
      (win ? isBattleWin(win) : false) +
      ' bots=' +
      botsN +
      ' add=' +
      addN +
      ' me=' +
      (BOT.state.meId || '-') +
      (me ? ' @' + me.x + ',' + me.y : '') +
      ' uid=' +
      (getUserId() || '-') +
      ' F=' +
      flagGet(FLAG.forest) +
      ' C=' +
      flagGet(FLAG.chaos) +
      ' CAP=' +
      flagGet(FLAG.captcha);
  }

  function updateUi() {
    const doc = getTopDoc();
    const fs = doc.getElementById('k5-forest-start');
    const cs = doc.getElementById('k5-chaos-start');
    if (fs) fs.classList.toggle('on', flagGet(FLAG.forest));
    if (cs) cs.classList.toggle('on', flagGet(FLAG.chaos));
    const badge = doc.getElementById('k5-cap-badge');
    if (badge) badge.style.display = flagGet(FLAG.captcha) || BOT.state.captchaPaused ? 'inline-block' : 'none';
    refreshDiag();
  }

  function migrateOnce() {
    try {
      const prev = GM_getValue('bot_ver', '');
      if (prev !== VERSION) {
        // сброс залипшей капчи и лицензии после обновления
        flagSet(FLAG.captcha, false);
        BOT.state.captchaPaused = false;
        if (BOT.cfg.license) BOT.cfg.license.enabled = false;
        if (BOT.cfg.forest) BOT.cfg.forest.useRadar = true;
        try {
          GM_setValue('run_shadow', false);
        } catch (e2) {}
        saveCfg();
        GM_setValue('bot_ver', VERSION);
      }
    } catch (e) {}
  }

  function boot() {
    try {
      showBeacon('5Kings Bot v' + VERSION + ': UI…');
      migrateOnce();
      BOT.state.captchaPaused = flagGet(FLAG.captcha);
      claimController();
      injectUi();
      // Сразу сбросить ложный CAP из localStorage, если капчи нет
      try {
        clearCaptchaIfGone(true);
      } catch (eCap) {}
      showBeacon('5Kings Bot v' + VERSION + ': панель справа. Нужен game.html → лес');
      let tries = 0;
      const iv = setInterval(function () {
        tries++;
        try {
          injectUi();
          if (isController()) refreshDiag();
        } catch (e) {}
        if (tries > 60 || getTopDoc().getElementById('k5-panel')) clearInterval(iv);
      }, 400);

      try {
        discoverMushroomTypes(getActWin());
      } catch (e) {}

      if (!isController()) {
        showBeacon('5Kings Bot v' + VERSION + ': кадр-помощник (контроллер в top)');
        return;
      }

      if (flagGet(FLAG.forest)) {
        if (isCityForest(getActWin())) {
          flagSet(FLAG.forest, false);
          log('Автостарт сброшен: сейчас городской лес', 'err');
        } else {
          scheduleForest(true);
        }
      }
      if (flagGet(FLAG.chaos)) scheduleChaos(true);

      setInterval(function () {
        watchCaptcha();
        refreshDiag();
        if (flagGet(FLAG.forest) && !forestSched) {
          if (isCityForest(getActWin())) {
            flagSet(FLAG.forest, false);
            updateUi();
          } else {
            scheduleForest(true);
          }
        }
        if (flagGet(FLAG.chaos) && !chaosSched) scheduleChaos(true);
      }, 2500);
    } catch (e) {
      showBeacon('5Kings Bot ERROR: ' + (e && e.message ? e.message : e), true);
      try {
        console.error('[5k-bot] boot fail', e);
      } catch (e2) {}
    }
  }

  function startWhenReady() {
    try {
      if (document.body) boot();
      else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
        // запасной путь
        setTimeout(function () {
          try {
            if (!getTopDoc().getElementById('k5-panel')) boot();
          } catch (e) {
            boot();
          }
        }, 1500);
      } else boot();
    } catch (e) {
      showBeacon('5Kings Bot start ERROR: ' + (e && e.message ? e.message : e), true);
    }
  }
  
  startWhenReady();
})();