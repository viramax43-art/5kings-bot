// ==UserScript==
// @name         5Kings Bot
// @namespace    https://5kings.ru/
// @version      1.2.11
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

  const VERSION = '1.2.11';

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
    copper: [74, 75, 104, 105, 106],
    iron: [70, 71, 72, 73, 107, 108, 109, 110, 111, 112, 113],
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

  const PROFESSION_HINTS = [
    /рудокоп/i,
    /дровосек/i,
    /лесоруб/i,
    /травник/i,
    /только/i,
    /нечего добывать/i,
    /не можете/i,
  ];
  const TOOL_NEED_RE = /необходим|инструмент|наденьте|экипир|нужна\s*кирк|нужен\s*топор/i;

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
        autoSearch: true,
        searchEverySteps: 5,
        searchWaitMs: 32000,
        searchRadius: 5,
        equipTool: true,
        autoHeal: true,
        injuryWaitMs: 300000,
        healMode: 'auto',
        healAbilityId: '',
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
        sessionMaxMin: 0,
        // хаосы: «Вызвать помощника» из magbook.chtml (не mbag/bmbook)
        summonHelper: true,
        helperSpell: 'помощник|вызвать\\s*помощ',
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
      helperFailUntil: 0,
      helperDisabled: false,
      helperFormId: '',
      healFailUntil: 0,
      lastCfgRefresh: 0,
      lastChaosNavAt: 0,
      lastJoinAt: 0,
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
      return deepMerge(defaultCfg(), raw);
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
    return String(t).replace(/\s+/g, ' ').slice(0, 1200);
  }

  const CRAFT_EVENT_RE = /сосна|дуб|красн\w*\s*дерев|медь|желез|золот|дерев[оа]|в\s+радиусе/i;
  const FRONT_EVENT_RE = /прямо\s+перед\s+вами|перед\s+вами/i;

  function parseBigForestHint(text) {
    if (!text) return null;
    if (!CRAFT_EVENT_RE.test(text) && !FRONT_EVENT_RE.test(text)) return null;
    let dir = null;
    if (FRONT_EVENT_RE.test(text) || /прямо/i.test(text)) dir = 'front';
    else if (/слева/i.test(text)) dir = 'left';
    else if (/справа/i.test(text)) dir = 'right';
    else if (/сзади|позади/i.test(text)) dir = 'back';
    else if (/радиус/i.test(text)) dir = 'radius';
    else dir = 'near';
    return { t: Date.now(), dir: dir, front: FRONT_EVENT_RE.test(text), txt: text.slice(0, 200) };
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

  function nfTypeKind(type, win) {
    type = Number(type);
    const meta = nfImgMeta(win, type);
    if (/griby\//i.test(meta) || /гриб/i.test(meta)) return 'mushroom';
    if (/travy\//i.test(meta) || /трав/i.test(meta)) return 'herb';
    if (/skala_med/i.test(meta)) return 'copper';
    if (/skala_zhelezn/i.test(meta)) return 'iron';
    if (NF.herbs.indexOf(type) >= 0) return 'herb';
    if (NF.mushrooms.indexOf(type) >= 0) return 'mushroom';
    if (NF.copper.indexOf(type) >= 0) return 'copper';
    if (NF.iron.indexOf(type) >= 0) return 'iron';
    if (NF.chests.indexOf(type) >= 0) return 'chest';
    if (NF.rocks.indexOf(type) >= 0 || NF.blockers.indexOf(type) >= 0) return 'block';
    return 'other';
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
        if (BOT.state.bannedAbs.has(String(abs)) || BOT.state.bannedAbs.has(it.posx + ',' + it.posy)) return;
        const x = Number(it.posx);
        const y = Number(it.posy);
        if (!isFinite(x) || !isFinite(y)) return;
        const kind = nfTypeKind(type, win);
        const f = BOT.cfg.forest;
        if (mode === 'step') {
          if (kind === 'herb' && !f.collectHerbs) return;
          else if (kind === 'mushroom' && !f.collectMushrooms) return;
          else if (kind === 'chest') {
            /* сундук — step-on */
          } else return;
        }
        if (mode === 'craft') {
          if (kind === 'copper' && !f.collectCopper) return;
          else if (kind === 'iron' && !f.collectIron) return;
          else if (!(kind === 'copper' || kind === 'iron')) return;
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

  function kindAtCell(win, x, y) {
    try {
      const gd = win.global_data;
      if (!gd || !gd.abs_poses) return null;
      const keys = Object.keys(gd.abs_poses);
      for (let i = 0; i < keys.length; i++) {
        const it = gd.abs_poses[keys[i]];
        if (!it || it === 0) continue;
        if (Number(it.posx) === Number(x) && Number(it.posy) === Number(y)) {
          return nfTypeKind(it.type, win);
        }
      }
    } catch (e) {}
    return null;
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

  function setLocalNapr(n) {
    BOT.state.localNapr = ((Number(n) - 1 + 8) % 8) + 1;
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
    // поворачиваем сразу на нужный угол (не по одному тику — иначе «вертится на месте»)
    let cur = currentNapr(win);
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
    return steps;
  }

  function cellAhead(win, me, napr) {
    const d = bigForestNaprDeltas(win);
    const n = napr || currentNapr(win);
    return { x: Number(me.x) + d.nx[n], y: Number(me.y) + d.ny[n] };
  }

  function isBlockedCell(win, x, y) {
    try {
      const gd = win.global_data;
      if (!gd || !gd.abs_poses) return false;
      const keys = Object.keys(gd.abs_poses);
      for (let i = 0; i < keys.length; i++) {
        const it = gd.abs_poses[keys[i]];
        if (!it || it === 0) continue;
        if (Number(it.posx) === Number(x) && Number(it.posy) === Number(y)) {
          const kind = nfTypeKind(it.type, win);
          if (kind === 'block') return true;
        }
      }
    } catch (e) {}
    return false;
  }

  async function faceAndStep(win, wantNapr, reason) {
    const turns = turnToFace(win, wantNapr);
    if (turns) await sleep(180 + turns * 120);
    const me = discoverMeBig(win) || getMe(win);
    if (me) {
      const ahead = cellAhead(win, me, currentNapr(win));
      if (isBlockedCell(win, ahead.x, ahead.y) && reason !== 'step-on' && reason !== 'craft-event') {
        // препятствие впереди — сменить курс, не долбиться
        const alt = ((currentNapr(win) + (Math.random() < 0.5 ? 2 : 6) - 1) % 8) + 1;
        log('Большой лес: препятствие → курс ' + alt + (reason ? ' (' + reason + ')' : ''));
        turnToFace(win, alt);
        BOT.state.wanderNapr = alt;
        await sleep(250);
      }
    }
    await bigForestStepForward(win);
    // stuck detection
    const after = discoverMeBig(win) || getMe(win);
    const key = after ? after.x + ',' + after.y : '';
    if (key && key === BOT.state.lastWalkPos) {
      BOT.state.stuckCount = (BOT.state.stuckCount || 0) + 1;
    } else {
      BOT.state.stuckCount = 0;
      BOT.state.lastWalkPos = key;
    }
    if (BOT.state.stuckCount >= 2) {
      const bounce = ((currentNapr(win) + 3 + Math.floor(Math.random() * 3) - 1) % 8) + 1;
      log('Большой лес: застрял — разворот на ' + bounce, 'err');
      turnToFace(win, bounce);
      BOT.state.wanderNapr = bounce;
      BOT.state.stuckCount = 0;
      await sleep(300);
    }
  }

  async function bigForestStepForward(win) {
    BOT.state.stepsSinceSearch = (BOT.state.stepsSinceSearch || 0) + 1;
    BOT.state.forestTimers.lastMoveAt = Date.now();
    log('Большой лес: шаг (' + BOT.state.stepsSinceSearch + '/' + (BOT.cfg.forest.searchEverySteps || 5) + ')');
    bigForestSend(win, 'actNewMaps-GotoKletka=-1');
    await sleep(humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax));
  }

  async function bigForestDoSearch(win) {
    BOT.state.stepsSinceSearch = 0;
    BOT.state.forestTimers.lastSearchAt = Date.now();
    log('Большой лес: поиск…', 'ok');
    if (typeof win.StartSearch === 'function') win.StartSearch();
    else bigForestSend(win, 'actNewMaps-StartSearch=1');
    await sleep(1200);
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
    return s;
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
    const win = getActWin();
    if (!win) {
      log('bag: нет d_act', 'err');
      return null;
    }
    const popName = 'K5BAG';
    let pop = null;
    try {
      const url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
      pop = win.open(url, popName, 'width=950,height=650,scrollbars=1,resizable=1');
    } catch (e) {
      log('bag popup: ' + (e.message || e), 'err');
      return null;
    }
    if (!pop) {
      log('bag popup заблокирован браузером', 'err');
      return null;
    }
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      try {
        if (pop.document && pop.document.body && (pop.document.body.innerHTML || '').length > 400) break;
      } catch (eWait) {}
    }
    let result = null;
    try {
      result = await fn(pop);
    } catch (e2) {
      log('bag popup: ' + (e2.message || e2), 'err');
    }
    try {
      if (pop && !pop.closed) pop.close();
    } catch (e3) {}
    return result;
  }

  async function equipCraftTool(hintTxt, kind) {
    if (!BOT.cfg.forest.equipTool) return false;
    const blob = String(hintTxt || '') + ' ' + String(kind || '');
    const wantPick =
      kind === 'copper' ||
      kind === 'iron' ||
      kind === 'gold' ||
      /мед|желез|золот|руд|кирк|copper|iron|gold/i.test(blob);
    const prefer = wantPick
      ? [
          [/золот|gold/i, /кирк|kirka|kirk/i],
          [/кирк|kirka|kirk/i, /рудокоп/i],
          [/кирк|kirka|kirk/i, null],
        ]
      : [
          [/золот|gold/i, /топор|topor|axe/i],
          [/топор|topor|axe/i, /лесоруб/i],
          [/топор|topor|axe/i, null],
        ];
    log('Инвентарь: ' + (wantPick ? 'кирка' : 'топор') + ' (popup, без ухода с карты)…');
    return withBagPopup('bag_type_17_mode_0.html', async function (bagWin) {
      const rows = [...bagWin.document.querySelectorAll('tr')];
      for (let p = 0; p < prefer.length; p++) {
        const a = prefer[p][0];
        const b = prefer[p][1];
        for (let i = 0; i < rows.length; i++) {
          const txt = bagRowBlob(rows[i]);
          if (!a.test(txt)) continue;
          if (b && !b.test(txt)) continue;
          const btn = findRowAction(rows[i], /одеть|надеть|wear/i);
          if (btn) {
            btn.click();
            log('Экипировал: ' + txt.replace(/\s+/g, ' ').slice(0, 70), 'ok');
            await sleep(900);
            return true;
          }
        }
      }
      log('Инструмент в сумке не найден (' + (wantPick ? 'кирка' : 'топор') + ')', 'err');
      return false;
    });
  }

  async function bigForestTryDobycha(win, reason, kind) {
    const me = discoverMeBig(win) || getMe(win);
    const key = me ? me.x + ',' + me.y : 'unk';
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
    const toolKind = kind || craftKindFromHint(BOT.state.bigForestHint) || kindAtCell(win, me && me.x, me && me.y);
    try {
      await equipCraftTool(hintTxt, toolKind);
    } catch (eEq) {}
    log('Большой лес: добыча (' + (reason || 'event') + ') @' + key + (toolKind ? ' ' + toolKind : ''));
    BOT.state.forestTimers.lastCraftAt = Date.now();
    if (typeof win.StartDobycha === 'function') win.StartDobycha();
    else bigForestSend(win, 'actNewMaps-StartDobycha=1');
    await sleep(1500);
    const txt = bigForestReadText(win);
    if (TOOL_NEED_RE.test(txt) && !/рудокоп|дровосек|лесоруб|травник|нечего добывать/i.test(txt)) {
      log('Большой лес: нужен инструмент — не бан, повтор с киркой/топором', 'err');
      try {
        await equipCraftTool(txt, toolKind || 'copper');
      } catch (eEq2) {}
      if (typeof win.StartDobycha === 'function') win.StartDobycha();
      else bigForestSend(win, 'actNewMaps-StartDobycha=1');
      await sleep(1200);
      return true;
    }
    if (PROFESSION_HINTS.some(function (re) {
      return re.test(txt);
    })) {
      BOT.state.bannedAbs.add(key);
      log('Большой лес: бан ' + key + ' — ' + txt.slice(0, 80), 'err');
      BOT.state.bigForestHint = null;
      return false;
    }
    if (bigForestBusy(win)) {
      BOT.state.dobychaFails = 0;
      BOT.state.bigForestHint = null;
    }
    return true;
  }

  function craftKindFromHint(hint) {
    const t = ((hint && hint.txt) || hint || '') + '';
    if (/мед/i.test(t) || t === 'copper') return 'copper';
    if (/желез/i.test(t) || t === 'iron') return 'iron';
    if (/золот/i.test(t) || t === 'gold') return 'gold';
    if (/сосна|дуб|дерев/i.test(t) || t === 'tree') return 'tree';
    return null;
  }

  function hookBigForest(win) {
    if (!win || win.__k5_om_hooked) return;
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
        if (TOOL_NEED_RE.test(txt)) log('Большой лес: ' + txt.replace(/\s+/g, ' ').slice(0, 90), 'err');
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
      const we = win.global_data && win.global_data.wait_event;
      BOT.state.craftBusy = we === 3 || we === 4;
      log('Событие wait=' + we + '…');
      await sleep(humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax));
      return;
    }
    BOT.state.craftBusy = false;

    const g = win.global_data && win.global_data.my_group;
    if (g && Number(g.stay) === 0) {
      await sleep(600);
      return;
    }

    if (!me) {
      await sleep(1000);
      return;
    }

    const txt = bigForestReadText(win);
    const parsed = parseBigForestHint(txt);
    if (parsed) BOT.state.bigForestHint = parsed;

    const needCraft = forestNeedsCraftSearch();
    const wantStep = forestWantsStepOn();
    const every = Math.max(1, Number(BOT.cfg.forest.searchEverySteps) || 5);
    const radius = Math.max(1, Number(BOT.cfg.forest.searchRadius) || 5);
    const stepItems = wantStep ? listBigForestItems(win, 'step') : [];
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
        log('Большой лес: вижу грибы ×' + nM + (f.collectHerbs ? ', травы ×' + nH : ''));
      }
    }

    // 1) клетка впереди — медь/железо: кирка + добыча, не уходя с карты
    if (
      needCraft &&
      ((aheadKind === 'copper' && f.collectCopper) || (aheadKind === 'iron' && f.collectIron))
    ) {
      await bigForestTryDobycha(win, 'перед вами (' + aheadKind + ')', aheadKind);
      return;
    }

    // 2) Травы/грибы в зоне видимости — сразу идём (грибы приоритетнее трав)
    if (wantStep && stepItems.length) {
      const mush = f.collectMushrooms
        ? stepItems.filter(function (it) {
            return it.kind === 'mushroom';
          })
        : [];
      const stepTarget = nearestBigItem(me, mush.length ? mush : stepItems, null, 'mushroom');
      if (stepTarget) {
        if (stepTarget.d === 0) {
          log('Большой лес: стою на ' + stepTarget.kind + ' @' + stepTarget.key + ' — шаг для подбора');
          await faceAndStep(win, BOT.state.wanderNapr || currentNapr(win), 'step-on');
          return;
        }
        const want = naprToward(win, me.x, me.y, stepTarget.x, stepTarget.y);
        log('Большой лес: к ' + stepTarget.kind + ' d=' + stepTarget.d + ' @' + stepTarget.x + ',' + stepTarget.y);
        await faceAndStep(win, want, 'step-on');
        return;
      }
    }

    // 3) свежее «прямо перед вами» из модалки
    if (needCraft && hintFresh(hint) && hint.front) {
      await bigForestTryDobycha(win, 'перед вами', craftKind || aheadKind);
      return;
    }

    // 4) Сообщение «медь/руда в радиусе 5» — подойти к каждой видимой жиле и искать
    if (needCraft && hintFresh(hint) && !hint.front && craftKind && craftKind !== 'tree') {
      const matching = craftItems.filter(function (it) {
        return it.kind === craftKind || (craftKind === 'gold' && it.kind === 'copper');
      });
      const target = nearestBigItem(me, matching.length ? matching : craftItems, radius);
      if (target) {
        if (target.d === 0) {
          await bigForestDoSearch(win);
          return;
        }
        const want = naprToward(win, me.x, me.y, target.x, target.y);
        log('Большой лес: к ' + (target.kind || 'руде') + ' d=' + target.d + ' (событие)');
        await faceAndStep(win, want, 'craft-event');
        const me2 = discoverMeBig(win) || me;
        const d2 = bigForestChebyshev(me2.x, me2.y, target.x, target.y);
        if (d2 <= 1) await bigForestDoSearch(win);
        return;
      }
      if (hint.dir === 'left') {
        turnToFace(win, currentNapr(win) === 1 ? 8 : currentNapr(win) - 1);
        await sleep(200);
        await faceAndStep(win, currentNapr(win), 'hint-left');
        return;
      }
      if (hint.dir === 'right') {
        turnToFace(win, currentNapr(win) === 8 ? 1 : currentNapr(win) + 1);
        await sleep(200);
        await faceAndStep(win, currentNapr(win), 'hint-right');
        return;
      }
    }

    // 5) Поиск каждые N шагов
    if (needCraft && BOT.cfg.forest.autoSearch && (BOT.state.stepsSinceSearch || 0) >= every) {
      await bigForestDoSearch(win);
      return;
    }

    // 6) Блуждание: идём вперёд выбранным курсом, без кручения на месте
    if (!BOT.state.wanderNapr) BOT.state.wanderNapr = currentNapr(win);
    if (Math.random() < 0.04) {
      BOT.state.wanderNapr = ((BOT.state.wanderNapr + (Math.random() < 0.5 ? 1 : 7) - 1) % 8) + 1;
    }
    await faceAndStep(win, BOT.state.wanderNapr, 'wander');
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
    log('Инвентарь: инструменты…');
    return withBagPage('bag_type_17_mode_0.html', async function (win) {
      const keys = ['топор', 'кирк', 'серп', 'инструмент', 'пил', 'мотыг'];
      const rows = [...win.document.querySelectorAll('tr')];
      for (let i = 0; i < rows.length; i++) {
        const txt = (rows[i].innerText || '').toLowerCase();
        if (!keys.some(function (k) {
          return txt.indexOf(k) >= 0;
        }))
          continue;
        const btn = rows[i].querySelector(
          'input[value*="Одеть"], input[value*="одеть"], a[href*="Wear"], *[onclick*="Wear"]'
        );
        if (btn) {
          btn.click();
          log('Экипировал: ' + txt.slice(0, 60), 'ok');
          await sleep(800);
          return true;
        }
      }
      const any = win.document.querySelector(
        'input[value*="Одеть"], a[href*="actUser-Wear"], *[onclick*="actUser-Wear"]'
      );
      if (any) {
        any.click();
        return true;
      }
      log('Инструмент не найден', 'err');
      return false;
    });
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
    const yourTurn = /ваш ход/i.test(turnLabel);
    const spectate = /чужой бой|просмотр/i.test(turnLabel);
    const loading = /загрузк/i.test(turnLabel);
    return {
      ready: !!(win.BID && me && !spectate),
      myTurn: !!(me && me.md == 0 && !win.ReloadReq && !loading && !spectate && (yourTurn || me.md == 0)),
      yourTurn: yourTurn,
      spectate: spectate,
      loading: loading,
      battleOver: spectate || /бой окончен|победа|поражение|закончил/i.test(turnLabel),
      turnLabel: turnLabel,
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
      if (typeof win.CalcAbsPos !== 'function' || !win.AbsPosUnbs) return false;
      try {
        const abs = win.CalcAbsPos({ x: x, y: y });
        const cell = win.AbsPosUnbs[abs];
        return !!(cell && cell.objType === 1);
      } catch (e) {
        return false;
      }
    }

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
    for (let i = 0; i < dirs.length; i++) {
      const x = ub.x + dirs[i][0];
      const y = ub.y + dirs[i][1];
      if (x < 0 || y < 0) continue;
      if (occupied(x, y)) continue;
      if (win.HexDistance(x, y, ub.x, ub.y) !== 1) continue;
      const dMe = win.HexDistance(me.x, me.y, x, y);
      const row = { x: x, y: y, dMe: dMe, dEn: 1 };
      if (!best || dMe < best.dMe || (dMe === best.dMe && Math.random() < 0.35)) best = row;
    }
    return best;
  }

  function closeBattlePopup(name) {
    try {
      const pop = PAGE.open('', name);
      if (pop && !pop.closed) pop.close();
    } catch (e) {}
  }

  function magbookBlob(el) {
    if (!el) return '';
    const parts = [(el.innerText || ''), (el.textContent || '')];
    try {
      const nodes = el.querySelectorAll ? el.querySelectorAll('[title],[alt],img') : [];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        parts.push(n.title || '', n.alt || '', n.src || (n.getAttribute && n.getAttribute('src')) || '');
      }
    } catch (e) {}
    return parts.join(' ').replace(/\s+/g, ' ');
  }

  function collectMagbookSpells(doc) {
    const out = [];
    const seen = {};
    function add(formId, blob, node) {
      formId = String(formId || '');
      if (!formId || seen[formId]) return;
      seen[formId] = true;
      out.push({ formId: formId, blob: blob, node: node });
    }
    try {
      const forms = [...doc.querySelectorAll('form[id^="form"]')];
      for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        const id = String(form.id || '').replace(/^form/i, '');
        const row = form.closest && form.closest('tr');
        const node = row || form;
        add(id, magbookBlob(node), node);
      }
      const clicks = [...doc.querySelectorAll('[onclick*="MakeCast"]')];
      for (let j = 0; j < clicks.length; j++) {
        const el = clicks[j];
        const m = (el.getAttribute('onclick') || '').match(/MakeCast\s*\(\s*(\d+)/i);
        if (!m) continue;
        const row = el.closest && el.closest('tr');
        const nCast = row ? ((row.innerHTML || '').match(/MakeCast\s*\(/gi) || []).length : 99;
        const node = row && nCast <= 1 ? row : el;
        add(m[1], magbookBlob(node), node);
      }
    } catch (e) {}
    return out;
  }

  function isHelperBlob(blob, spellRe) {
    const t = String(blob || '');
    if (spellRe && spellRe.test(t)) return true;
    if (/помощник|вызвать\s*помощ|helper|familiar|summon/i.test(t)) return true;
    if (/pomosh|pomosch|vyzvat/i.test(t)) return true;
    if (/ïîìîù|Âûçâàòü/i.test(t)) return true;
    return false;
  }

  function isHealSpellBlob(blob) {
    const t = String(blob || '');
    if (/помощник|вызвать\s*помощ/i.test(t)) return false;
    return /лечен|восстанов|хил|heal|cure/i.test(t);
  }

  async function waitMagbookReady(pop, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 5500)) {
      try {
        const doc = pop.document;
        if (
          doc &&
          (doc.querySelector('[onclick*="MakeCast"]') || doc.querySelector('form[id^="form"]'))
        )
          return true;
      } catch (e) {}
      await sleep(250);
    }
    return false;
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

  /** Popup часто режет Chrome; iframe в кадре боя — без жеста + тот же origin. */
  async function openMagbookWin(win, bookUrl) {
    const full = bookUrl + (bookUrl.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    let pop = null;
    try {
      pop = win.open(full, 'MAGBOOK', 'width=850,height=650,scrollbars=1,resizable=1');
    } catch (e) {
      pop = null;
    }
    if (pop) {
      await waitMagbookReady(pop, 5500);
      return { win: pop, via: 'popup' };
    }

    // iframe внутри d_act (бой), не в top — ближе к native open()
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
        'position:fixed;width:1px;height:1px;right:0;bottom:0;z-index:1;opacity:0;border:0;pointer-events:none'
      );
      (hostDoc.body || hostDoc.documentElement).appendChild(iframe);
    }
    // относительный URL, если бой на 5kings.ru
    try {
      const rel = String(bookUrl || '').replace(/^https?:\/\/[^/]+/i, '');
      iframe.src = (rel.charAt(0) === '/' ? rel.slice(1) : rel) + (rel.indexOf('?') >= 0 ? '&' : '?') + 'xdac=' + Math.random();
    } catch (e3) {
      iframe.src = full;
    }
    const frameWin = iframe.contentWindow;
    await waitMagbookReady(frameWin, 7000);
    return { win: frameWin, via: 'iframe', iframe: iframe, battleWin: win };
  }

  function closeMagbookWin(handle) {
    try {
      if (handle && handle.via === 'popup' && handle.win && !handle.win.closed) handle.win.close();
    } catch (e) {}
    try {
      if (handle && handle.iframe) handle.iframe.src = 'about:blank';
    } catch (e2) {}
  }

  function castMagbookSpell(battleWin, bookWin, formId) {
    formId = String(formId || '');
    if (!formId) return false;
    try {
      if (typeof battleWin.ab === 'function') battleWin.ab(8);
    } catch (e0) {}
    try {
      const doc = bookWin.document;
      const form = doc && doc.getElementById('form' + formId);
      // MakeCast из magbook3d.js требует opener.top.frames.d_act — у iframe opener нет
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
        // fallback: подменить opener-путь через прямой submit уже выше; MakeCast может кинуть
        try {
          bookWin.MakeCast(formId);
          return true;
        } catch (eM) {}
      }
    } catch (e) {}
    return false;
  }

  async function trySummonHelper(win, state) {
    const cfg = BOT.cfg.battle;
    if (!cfg.summonHelper || !flagGet(FLAG.chaos)) return false;
    if (BOT.state.helperDisabled) return false;
    if (!state.enemies.length) return false;
    if (Date.now() < (BOT.state.helperFailUntil || 0)) return false;

    // без маны книга обычно пустая / каст бесполезен
    try {
      if (win.ME && Number(win.ME.mp) <= 0) {
        BOT.state.helperFailUntil = Date.now() + 120000;
        log('Бой: помощник пропуск — мана 0 (mp). Нужна мана + заклинание в книге');
        return false;
      }
    } catch (eMp) {}

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

    let hex = null;
    for (let i = 0; i < withDist.length; i++) {
      hex = pickSummonHex(win, withDist[i]);
      if (hex) break;
    }
    if (!hex) return false;

    win.EX = hex.x;
    win.EY = hex.y;
    win.ENEMY = 0;
    win.OBST = -1;

    const bookBase = magbookAbsUrl(cfg.magicBookUrl || '/magbook.chtml');
    const bookUrl =
      bookBase + (win.BID ? (bookBase.indexOf('?') >= 0 ? '&' : '?') + 'bid=' + win.BID : '');

    let handle = null;
    try {
      handle = await openMagbookWin(win, bookUrl);
    } catch (eOpen) {
      handle = null;
    }
    if (!handle || !handle.win) {
      BOT.state.helperFailUntil = Date.now() + 90000;
      log('Бой: magbook недоступен — повтор через ~90с', 'err');
      return false;
    }
    if (handle.via === 'iframe') log('Бой: magbook iframe (popup блокирован)');

    const pop = handle.win;
    const spellRe = new RegExp(
      cfg.helperSpell && String(cfg.helperSpell).trim()
        ? cfg.helperSpell
        : 'помощник|вызвать\\s*помощ|helper',
      'i'
    );
    let cast = false;
    try {
      const doc = pop.document;
      if (!doc || !doc.body) {
        BOT.state.helperDisabled = true;
        log('Бой: magbook пуст — помощник выключен до перезагрузки. Выучите «Вызвать помощника» в книгу магии', 'err');
        closeMagbookWin(handle);
        return false;
      }
      const spells = collectMagbookSpells(doc);
      if (!spells.length) {
        BOT.state.helperDisabled = true;
        log(
          'Бой: в книге 0 заклинаний — помощник выключен. Нужно выучить «Вызвать помощника» (magbook), не свиток из «Магия»',
          'err'
        );
        closeMagbookWin(handle);
        return false;
      }
      let pick = null;
      if (BOT.state.helperFormId) {
        pick = spells.filter(function (s) {
          return s.formId === String(BOT.state.helperFormId) && isHelperBlob(s.blob, spellRe) && !isHealSpellBlob(s.blob);
        })[0];
      }
      if (!pick) {
        for (let si = 0; si < spells.length; si++) {
          if (isHealSpellBlob(spells[si].blob)) continue;
          if (isHelperBlob(spells[si].blob, spellRe)) {
            pick = spells[si];
            break;
          }
        }
      }
      if (pick) {
        cast = castMagbookSpell(win, pop, pick.formId);
        if (cast) {
          BOT.state.helperFormId = String(pick.formId);
          log('Бой: помощник MakeCast(' + pick.formId + ') @' + hex.x + ',' + hex.y, 'ok');
        }
      } else {
        const sample = spells
          .slice(0, 4)
          .map(function (s) {
            return s.formId + ':' + String(s.blob || '').slice(0, 40);
          })
          .join(' | ');
        BOT.state.helperFailUntil = Date.now() + 120000;
        log('Бой: помощник не найден среди ' + spells.length + ' закл. [' + sample + '] — пауза 2м', 'err');
      }
    } catch (e) {
      BOT.state.helperFailUntil = Date.now() + 60000;
      log('Бой: magbook ошибка ' + (e.message || e), 'err');
    }

    if (cast) await sleep(humanDelay(1200, 2000));
    closeMagbookWin(handle);
    return cast;
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

    // Вне радиуса — шаг ближе, если есть очки хода. Иначе всё равно бьём/блокируем (ход нельзя «пропустить»).
    if (hd > atkRange && !(me.flg & 0x4000) && me.tn && me.tn >= 1) {
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
    function planAndApply(side) {
      clearHand(side);
      const suboptimal = Math.random() < BOT.cfg.battle.suboptimalChance;
      const preferKick = suboptimal ? Math.random() < 0.35 : Math.random() < 0.72;
      if (handKickEnabled(side) && preferKick) {
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
      }
      const used = [];
      const order = ZONES.slice().sort(function () {
        return Math.random() - 0.5;
      });
      for (let i = 0; i < order.length && used.length < 2; i++) {
        const z = order[i];
        try {
          win.ubblock(side, z);
        } catch (e) {}
        if (win.BLOCKS[side * 5 + z] === 1) used.push(z);
      }
      return { type: 'block', z: used };
    }

    const right = planAndApply(0);
    const left = planAndApply(1);

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
      let n = 0;
      for (let z = 0; z < 5 && n < 2; z++) {
        try {
          win.ubblock(side, z);
        } catch (e) {}
        if (win.BLOCKS[side * 5 + z] === 1) n++;
      }
      if (points(side) < 2) {
        win.KICKS[side * 5 + 1] = 1;
        const el = win.document.getElementById('kk' + side + '1');
        if (el) el.className = 'bchk1';
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
      right: right,
      left: left,
      pts: [points(0), points(1)],
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

    while (flagGet(FLAG.chaos) && !flagGet(FLAG.captcha)) {
      refreshCfg();
      watchCaptcha();
      if (!isBattleWin(win)) {
        log('Бой завершён');
        BOT.state.lastFightEnd = Date.now();
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
        if (idle % 8 === 1) log('Бой: жду… ' + st.turnLabel);
        await sleep(humanDelay(800, 1500));
        continue;
      }
      if (Number(win.ME.md) !== 0 && !/ваш ход/i.test(st.turnLabel || '')) {
        BOT.state.turnReadySince = 0;
        await sleep(900);
        continue;
      }

      const dMin = Math.max(200, Number(BOT.cfg.battle.delayMin) || 700);
      const dMax = Math.max(dMin, Number(BOT.cfg.battle.delayMax) || dMin);

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
      if (waited < dMin) {
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
      const extra = Math.max(0, pauseMs - waited);
      if (extra > 0) await sleep(extra);

      const live = getBattleState(win);
      if (!live.myTurn && !live.yourTurn) continue;
      if (!win.ME || Number(win.ME.hp) <= 0) continue;

      const needHeal = shouldBattleHeal(win, live) && Date.now() >= (BOT.state.healFailUntil || 0);

      // хаосы: хил только при реальном HP < max и ≤ порога; иначе «Вызвать помощника»
      if (needHeal) {
        const healed = await tryBattleHealOrMagic(win, live);
        if (healed) {
          lastTurnAt = Date.now();
          BOT.state.turnReadySince = 0;
          BOT.state.healFailUntil = 0;
          await sleep(humanDelay(600, 1200));
          continue;
        }
        BOT.state.healFailUntil = Date.now() + 25000;
        log('Бой: хил не сработал — пауза 25с (нет свитка/сумки?)');
      }

      const summoned = await trySummonHelper(win, live);
      if (summoned) {
        lastTurnAt = Date.now();
        BOT.state.turnReadySince = 0;
        await sleep(humanDelay(600, 1200));
        const afterCast = getBattleState(win);
        if (!afterCast.myTurn && !afterCast.yourTurn) continue;
      }

      const live2 = getBattleState(win);
      if (!live2.myTurn && !live2.yourTurn) continue;
      if (!win.ME || Number(win.ME.hp) <= 0) continue;

      const result = playHumanTurn(win, live2);
      BOT.state.turnReadySince = 0;
      if (result.moved) {
        log('Бой: сближение hd=' + result.hd);
        lastTurnAt = Date.now();
      } else if (result.ok) {
        log(
          'Бой ход → ' +
            result.enemy +
            ' hd=' +
            result.hd +
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

  async function chaosTick() {
    if (!flagGet(FLAG.chaos) || flagGet(FLAG.captcha)) return;
    watchCaptcha();
    let win = getActWin();

    if (isBattleWin(win)) {
      BOT.state.emptyAppsSince = 0;
      if (BOT.cfg.chaos.fight) {
        // пауза между боями
        const pauseNeed = BOT.state.lastFightEnd
          ? rand(BOT.cfg.battle.pauseBetweenFightsMinMs, BOT.cfg.battle.pauseBetweenFightsMaxMs) -
            (Date.now() - BOT.state.lastFightEnd)
          : 0;
        if (pauseNeed > 0 && BOT.state.lastFightEnd) {
          /* уже в бою — не ждём */
        }
        if (BOT.state.fightSessionLimit > 0 && BOT.state.fightSessionStart) {
          if (Date.now() - BOT.state.fightSessionStart > BOT.state.fightSessionLimit) {
            log('Лимит боевой сессии — стоп хаосов');
            flagSet(FLAG.chaos, false);
            updateUi();
            return;
          }
        }
        await runBattleLoop(win);
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
    const delay = immediate ? 300 : humanDelay(BOT.cfg.forest.delayMin, BOT.cfg.forest.delayMax);
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
        log('Лес СТАРТ v' + VERSION + ' BIG @ ' + forestHref(getActWin()).split('/').pop(), 'ok');
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
    BOT.state.healFailUntil = 0;
    BOT.state.fightSessionStart = Date.now();
    const limMin = Number(BOT.cfg.battle.sessionMaxMin) || 0;
    BOT.state.fightSessionLimit = limMin > 0 ? limMin * 60000 : rand(40, 90) * 60000;
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
      '<label><input type="checkbox" data-cfg="forest.autoSearch"> автопоиск (деревья/руда, каждые N шагов)</label>' +
      '<label>поиск каждые N шагов <input type="number" min="1" max="20" data-cfg-num="forest.searchEverySteps"></label>' +
      '<label><input type="checkbox" data-cfg="forest.equipTool"> надеть инструмент</label>' +
      '<label><input type="checkbox" data-cfg="forest.autoHeal"> лечение травм</label>' +
      '<label>режим хила <select data-cfg-val="forest.healMode"><option value="auto">auto</option><option value="scroll">свиток</option><option value="ability">абилка</option><option value="wait">ожидание</option></select></label>' +
      '<label>ID абилки лечения <input type="text" data-cfg-val="forest.healAbilityId" placeholder="пусто = по названию"></label>' +
      '<label>ждать заживления, мин <input type="number" min="1" data-cfg-num="forest.injuryWaitMs" data-scale="60000"></label>' +
      '<div class="row">' +
      '<button type="button" id="k5-forest-start">Старт лес</button>' +
      '<button type="button" id="k5-forest-stop" class="danger">Стоп</button>' +
      '<button type="button" id="k5-discover">Найти себя</button></div>' +
      '<hr style="border-color:#3a4530;margin:10px 0">' +
      '<div><b>Хаосы 3×3</b></div>' +
      '<label><input type="checkbox" data-cfg="chaos.autoJoin"> авто-вход</label>' +
      '<label><input type="checkbox" data-cfg="chaos.autoCreate"> авто-создание</label>' +
      '<label><input type="checkbox" data-cfg="chaos.ensureKit"> комплект KH</label>' +
      '<label><input type="checkbox" data-cfg="chaos.fight"> бой AI (удары/блоки/ход)</label>' +
      '<label><input type="checkbox" data-cfg="battle.useMagic"> хил в бою + случ.магия вне хаоса</label>' +
      '<label>хил если HP% ≤ <input type="number" min="1" max="99" data-cfg-num="battle.healBelowHpPct"></label>' +
      '<label>пауза ПЕРЕД действием в ходу, мс мин/макс</label>' +
      '<div class="row"><input type="number" min="200" data-cfg-num="battle.delayMin" style="width:48%"><input type="number" min="200" data-cfg-num="battle.delayMax" style="width:48%"></div>' +
      '<label>шанс случ.магии вне хаоса 0–1 <input type="number" min="0" max="1" step="0.05" data-cfg-num="battle.magicChance"></label>' +
      '<label>шанс кривого хода (рандом зон) 0–1 <input type="number" min="0" max="1" step="0.05" data-cfg-num="battle.suboptimalChance"></label>' +
      '<label>лимит сессии, мин (0 = случайно 40–90) <input type="number" min="0" data-cfg-num="battle.sessionMaxMin"></label>' +
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