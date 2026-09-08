// ==UserScript==
// @name         5Kings Bot
// @namespace    https://5kings.ru/
// @version      1.1.0
// @description  Лес + хаосы 5kings.ru. Локальный userscript.
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
  
    try {
      console.log('%c[5k-bot] executed v1.1.0 @ ' + location.href, 'background:#1a5c1a;color:#fff;padding:4px');
      showBeacon('5Kings Bot v1.1.0: скрипт запущен…');
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
  
    const VERSION = '1.1.0';
    const CFG_KEY = 'cfg_v3';
    const FLAG = {
      forest: 'run_forest',
      chaos: 'run_chaos',
      shadow: 'run_shadow',
      captcha: 'captcha_pause',
    };
  
    const COLOSSEUM_URL = 'arenax.html';
    // запасная карта: если arenax не распарсился (см. кнопки «Для уровней: X-Y»)
    const SHADOW_ROOMS_FALLBACK = [
      { min: 0, max: 1, url: 'arena_room_1.html', name: 'Начинающих #1', roomNo: 1 },
      { min: 0, max: 1, url: 'arena_room_2.html', name: 'Начинающих #2', roomNo: 2 },
      { min: 2, max: 4, url: 'arena_room_3.html', name: 'Воинов', roomNo: 3 },
      { min: 5, max: 7, url: 'arena_room_4.html', name: 'Наемников', roomNo: 4 },
      { min: 8, max: 10, url: 'arena_room_5.html', name: 'Ветеранов', roomNo: 5 },
      { min: 11, max: 13, url: 'arena_room_6.html', name: 'Профессионалов', roomNo: 6 },
      { min: 14, max: 17, url: 'arena_room_7.html', name: 'Элиты', roomNo: 7 },
      { min: 18, max: 23, url: 'arena_room_8.html', name: 'Магов', roomNo: 8 },
    ];
    const SHADOW_ROOM_URL = 'arena_room_1.html';
    const SHADOW_START_URL = 'arena_mode_1.html?actBattle-StartBattleWithShadow=1';
  
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
      crystals: [40, 41, 42],
      chests: [43, 44, 45, 46],
      // грибы: динамически из ij / неизвестные step-on
      mushrooms: [],
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
    const APPS_URL = 'arena_room_1_bmode_36_smode_0.html';
    const ROOM_URL = 'arena_room_1_bmode_36.html';
  
    const PROFESSION_HINTS = [
      /рудокоп/i,
      /дровосек/i,
      /лесоруб/i,
      /травник/i,
      /только/i,
      /нечего добывать/i,
      /необходим/i,
      /не можете/i,
      /инструмент/i,
    ];
  
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
          collectCrystals: true,
          collectChests: true,
          collectAllAddItems: false,
          autoSearch: true,
          searchWaitMs: 32000,
          // equip tool opens bag in d_act and briefly loses forest — optional
        equipTool: false,
          autoHeal: true,
          injuryWaitMs: 300000,
          healMode: 'scroll', // scroll | wait | ability | auto
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
        shadow: {
          // Колизей → комната по уровню → Бой с тенью
          roomUrl: '', // пусто = автовыбор по уровню
          startUrl: SHADOW_START_URL,
          pauseMinMs: 2500,
          pauseMaxMs: 6000,
          fight: true,
          loop: true,
        },
        battle: {
          delayMin: 700,
          delayMax: 2200,
          healBelowHpPct: 45,
          useMagic: true,
          magicChance: 0.22,
          suboptimalChance: 0.12,
          pauseBetweenFightsMinMs: 8000,
          pauseBetweenFightsMaxMs: 25000,
          sessionMaxMs: 0, // 0 = без лимита
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
        lastFightEnd: 0,
        forestTimers: {},
        charLevel: null,
        charLevelAt: 0,
        shadowRoom: null,
        shadowRoomAt: 0,
      },
    };
  
    function loadCfg() {
      try {
        const raw = GM_getValue(CFG_KEY, null);
        if (!raw) return defaultCfg();
        return deepMerge(defaultCfg(), JSON.parse(raw));
      } catch (e) {
        return defaultCfg();
      }
    }
    function saveCfg() {
      try {
        GM_setValue(CFG_KEY, JSON.stringify(BOT.cfg));
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
  
    function getActWin() {
      // 1) текущий фрейм уже лес/бой
      if (PAGE.cu && PAGE.gd) return PAGE;
      if (typeof PAGE.MakeTurn === 'function' && PAGE.BID) return PAGE;
  
      const topW = getTopWin();
  
      // 2) iframe#d_act — главный игровой кадр (надёжнее, чем frames.d_act в sandbox TM)
      try {
        const el = topW.document && topW.document.getElementById('d_act');
        if (el && el.contentWindow) return el.contentWindow;
      } catch (e) {}
      try {
        if (topW.frames && topW.frames.d_act) return topW.frames.d_act;
      } catch (e) {}
  
      // 3) любой фрейм с cu/gd или боевым API
      try {
        const frames = topW.frames || [];
        for (let i = 0; i < frames.length; i++) {
          try {
            const f = frames[i];
            if (!f) continue;
            if (f.cu && f.gd) return f;
            if (typeof f.MakeTurn === 'function' && f.BID) return f;
          } catch (e) {}
        }
      } catch (e) {}
  
      // 4) standalone forest/battle page (редко)
      if (/forest\.html|bmode_36|arena_room|battle/i.test(PAGE.location && PAGE.location.href)) return PAGE;
      return null;
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
      flagSet(FLAG.shadow, false);
      // chaos оставляем выключенным до ручного продолжения
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
      if (f.collectCrystals) t = t.concat(RES.crystals);
      if (f.collectChests) t = t.concat(RES.chests);
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
      return !!(win && win.cu && typeof win.cu.send === 'function' && win.gd);
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
        let ok = false;
        if (BOT.cfg.forest.collectAllAddItems) {
          ok = !bannedTypes.has(img);
          // руда по умолчанию только если явно включена
          if (isCraftType(img) && !types.has(img) && !BOT.cfg.forest.collectTrees) {
            /* keep if type selected below */
          }
        }
        if (types.has(img)) ok = true;
        if (BOT.cfg.forest.collectMushrooms && !isCraftType(img) && !types.has(img)) {
          // неизвестный step-on (в т.ч. грибы без записи в ij)
          if (img > 46 || (RES.mushrooms.length && RES.mushrooms.indexOf(img) >= 0)) ok = true;
          if (BOT.cfg.forest.collectAllAddItems && !isCraftType(img)) ok = true;
        }
        if (!ok) return;
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
        log('cu/gd нет — откройте лес в d_act', 'err');
        return null;
      }
      const existing = getMe(win);
      if (existing) return existing;
      const bots = listBots(win).map(botPos).filter(Boolean);
      if (!bots.length) {
        log('На карте нет персонажей', 'err');
        return null;
      }
      if (bots.length === 1) {
        setMe(bots[0]);
        return BOT.state.me;
      }
      const snap = {};
      bots.forEach(function (b) {
        snap[String(b.id)] = b.x + ',' + b.y;
      });
      const destAbs = 314;
      const destX = ((destAbs - 1) % 25) + 1;
      const destY = Math.floor((destAbs - 1) / 25) + 1;
      goToAbs(win, destAbs);
      await sleep(1200);
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
      if (best) {
        setMe(best);
        return BOT.state.me;
      }
      log('Не удалось определить персонажа автоматически', 'err');
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
      const back = (win.location && win.location.pathname) || 'forest.html';
      const backFile = back.split('/').pop() || 'forest.html';
      if (!go(win, path)) return null;
      await sleep(1200);
      let result = null;
      try {
        result = await fn(getActWin());
      } catch (e) {
        log('bag: ' + (e.message || e), 'err');
      }
      go(getActWin(), /forest/i.test(backFile) ? 'forest.html' : backFile);
      await sleep(1500);
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
      const nodes = [...win.document.querySelectorAll('input,button,a,[onclick]')];
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const t = ((n.value || '') + ' ' + (n.title || '') + ' ' + (n.textContent || '')).toLowerCase();
        if (/лечен.*травм|вылеч|исцел/.test(t) && !/свиток/.test(t)) {
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
  
    async function tryBattleHealOrMagic(win, state) {
      const cfg = BOT.cfg.battle;
      const hpPct = state.mhp ? (100 * state.hp) / state.mhp : 100;
      const needHeal = hpPct <= cfg.healBelowHpPct;
      const wantMagic = cfg.useMagic && Math.random() < cfg.magicChance;
  
      if (!needHeal && !wantMagic) return false;
  
      // клик по кнопкам сумки/магии в бою
      const nodes = [...win.document.querySelectorAll('input[type=button],button,a')];
      let opened = null;
      for (let i = 0; i < nodes.length; i++) {
        const v = (nodes[i].value || nodes[i].textContent || '').trim();
        if (needHeal && /сумк/i.test(v)) {
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
          else win.open('/mbag.chtml?xdac=' + Math.random(), 'MAGIC', 'width=850,height=650');
          opened = needHeal ? 'bag' : 'magic';
        } catch (e) {}
      }
      await sleep(humanDelay(600, 1200));
  
      // попытка кликнуть в popup
      try {
        const name = opened === 'bag' ? 'BAG' : 'MAGIC';
        const pop = PAGE.open('', name);
        if (pop && pop.document) {
          const rows = [...pop.document.querySelectorAll('tr, a, input')];
          for (let i = 0; i < rows.length; i++) {
            const t = ((rows[i].innerText || rows[i].value || '') + '').toLowerCase();
            if (needHeal && /лечен|восстанов|хил|heal|жизн/.test(t)) {
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
  
      // humanizer: иногда не ближайшая цель
      let target = withDist[0];
      if (withDist.length > 1 && Math.random() < 0.3) {
        target = withDist[rand(0, Math.min(2, withDist.length - 1))];
      }
  
      const atkRange = Math.max(Number(state.rrg) || 1, Number(state.lrg) || 1, 1);
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
  
      if (hd > atkRange) {
        if (me.flg & 0x4000) return { ok: false, why: 'immobilized', hd: hd };
        if (!me.tn || me.tn < 1) return { ok: false, why: 'no-move-pts', hd: hd };
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
        if (!best) return { ok: false, why: 'no-step', hd: hd };
        win.EX = best.x;
        win.EY = best.y;
        try {
          win.MakeMove();
          return { ok: true, moved: true, hd: hd, to: [best.x, best.y] };
        } catch (e) {
          return { ok: false, why: 'move-fail', hd: hd };
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
  
      while ((flagGet(FLAG.chaos) || flagGet(FLAG.shadow)) && !flagGet(FLAG.captcha)) {
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
        if (!st.ready || st.loading || (!st.myTurn && !st.yourTurn)) {
          idle++;
          if (idle % 8 === 1) log('Бой: жду… ' + st.turnLabel);
          await sleep(humanDelay(800, 1500));
          continue;
        }
        if (Date.now() - lastTurnAt < 1800) {
          await sleep(400);
          continue;
        }
        idle = 0;
        await sleep(humanDelay(BOT.cfg.battle.delayMin, BOT.cfg.battle.delayMax));
  
        // иногда хил/магия перед ударом
        await tryBattleHealOrMagic(win, st);
  
        const live = getBattleState(win);
        if (!live.myTurn && !live.yourTurn) continue;
  
        const result = playHumanTurn(win, live);
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
  
    /* ---------- colosseum: бой с тенью ---------- */
    function eachGameWin(fn) {
      const seen = [];
      function visit(w) {
        if (!w || seen.indexOf(w) >= 0) return;
        seen.push(w);
        try {
          fn(w);
        } catch (e) {}
        try {
          const frames = w.frames || [];
          for (let i = 0; i < frames.length; i++) visit(frames[i]);
        } catch (e2) {}
      }
      try {
        visit(getTopWin());
      } catch (e) {}
      try {
        visit(PAGE);
      } catch (e3) {}
    }
  
    function getCharLevel() {
      const now = Date.now();
      if (BOT.state.charLevel != null && now - (BOT.state.charLevelAt || 0) < 45000) {
        return BOT.state.charLevel;
      }
      let lvl = null;
  
      eachGameWin(function (w) {
        if (lvl != null) return;
        try {
          if (w.nd && w.nd.lvl != null && isFinite(Number(w.nd.lvl))) {
            lvl = Number(w.nd.lvl);
            return;
          }
        } catch (e) {}
        try {
          if (w.gd && w.gd.nd && w.gd.nd.lvl != null && isFinite(Number(w.gd.nd.lvl))) {
            lvl = Number(w.gd.nd.lvl);
            return;
          }
        } catch (e2) {}
        try {
          if (w.cu && w.cu.lvl != null && isFinite(Number(w.cu.lvl))) {
            lvl = Number(w.cu.lvl);
            return;
          }
        } catch (e3) {}
      });
  
      if (lvl == null) {
        eachGameWin(function (w) {
          if (lvl != null) return;
          try {
            const doc = w.document;
            if (!doc || !doc.body) return;
            const t = String(doc.body.innerText || '').replace(/\s+/g, ' ');
            // типичные подписи: «Уровень: 3», «ур. 3», «[3]» рядом с ником в d_pers
            let m = t.match(/уров(?:ень|ня)?\s*[:=]?\s*(\d{1,2})\b/i);
            if (!m) m = t.match(/\bур\.?\s*[:=]?\s*(\d{1,2})\b/i);
            if (!m) m = t.match(/\blvl\s*[:=]?\s*(\d{1,2})\b/i);
            if (m) {
              const n = Number(m[1]);
              if (n >= 0 && n <= 50) lvl = n;
            }
          } catch (e) {}
        });
      }
  
      if (lvl == null && BOT.state.me && BOT.state.me.lvl != null) {
        lvl = Number(BOT.state.me.lvl);
      }
  
      if (lvl != null && isFinite(lvl)) {
        BOT.state.charLevel = lvl;
        BOT.state.charLevelAt = now;
        return lvl;
      }
      return null;
    }
  
    function roomNoFromUrl(url) {
      const m = String(url || '').match(/arena_room_(\d+)/i);
      return m ? Number(m[1]) : 0;
    }
  
    function isTradeRoom(room) {
      if (!room) return false;
      if (room.roomNo === 9) return true;
      return /торгов/i.test(room.name || '') || /любой/i.test(String(room.anyLabel || ''));
    }
  
    function parseArenaxRooms(win) {
      win = win || getActWin();
      if (!win || !win.document) return [];
      const doc = win.document;
      const rooms = [];
      const cells = doc.querySelectorAll('td');
      for (let i = 0; i < cells.length; i++) {
        const td = cells[i];
        const btn = td.querySelector('input[type=button],button');
        if (!btn) continue;
        const label = String(btn.value || btn.textContent || '').trim();
        if (!/комнат/i.test(label)) continue;
        const oc = String(btn.getAttribute('onclick') || btn.getAttribute('onClick') || '');
        let url = '';
        let m = oc.match(/goRC\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
        if (m) url = m[1];
        if (!url) {
          // кнопка без onclick = закрыта для уровня; угадаем по имени из fallback
          for (let j = 0; j < SHADOW_ROOMS_FALLBACK.length; j++) {
            const fb = SHADOW_ROOMS_FALLBACK[j];
            if (label.indexOf(fb.name) >= 0 || new RegExp(fb.name.replace(/[#\s]+/g, '.*'), 'i').test(label)) {
              url = fb.url;
              break;
            }
          }
        }
        if (!url && /торгов/i.test(label)) url = 'arena_room_9.html';
        if (!url) continue;
  
        const cellText = String(td.innerText || td.textContent || '').replace(/\s+/g, ' ');
        let min = null;
        let max = null;
        let anyLabel = '';
        const rm = cellText.match(/для\s+уровней\s*:\s*(\d+)\s*[-–—]\s*(\d+)/i);
        if (rm) {
          min = Number(rm[1]);
          max = Number(rm[2]);
        } else if (/для\s+уровней\s*:\s*любой/i.test(cellText)) {
          min = 0;
          max = 99;
          anyLabel = 'любой';
        }
  
        const shortName = label
          .replace(/^комната\s+/i, '')
          .replace(/\s*\[\d+\]\s*$/i, '')
          .trim();
        rooms.push({
          min: min,
          max: max,
          url: String(url).split('?')[0].replace(/_actUser-FillData_\d+\.html$/i, '.html'),
          name: shortName,
          roomNo: roomNoFromUrl(url),
          clickable: !!oc,
          anyLabel: anyLabel,
          rawLabel: label,
        });
      }
      return rooms;
    }
  
    function pickBestShadowRoom(level, rooms) {
      const list = (rooms && rooms.length ? rooms : SHADOW_ROOMS_FALLBACK).slice();
      const combat = list.filter(function (r) {
        return r && r.url && !isTradeRoom(r);
      });
  
      function fits(r) {
        if (r.min == null || r.max == null) return false;
        if (level == null) return !!r.clickable;
        return level >= r.min && level <= r.max;
      }
  
      let candidates = combat.filter(fits);
      // если уровень неизвестен — берём кликабельные боевые комнаты с максимальным max
      if (!candidates.length && level == null) {
        candidates = combat.filter(function (r) {
          return r.clickable;
        });
      }
      // если выше всех диапазонов — верхняя боевая
      if (!candidates.length && level != null) {
        let topMax = -1;
        for (let i = 0; i < combat.length; i++) {
          if (combat[i].max != null && combat[i].max > topMax) topMax = combat[i].max;
        }
        if (level > topMax && topMax >= 0) {
          candidates = combat.filter(function (r) {
            return r.max === topMax;
          });
        }
      }
      if (!candidates.length) {
        candidates = combat.filter(function (r) {
          return r.clickable;
        });
      }
      if (!candidates.length) return SHADOW_ROOMS_FALLBACK[0];
  
      candidates.sort(function (a, b) {
        const am = a.max != null ? a.max : -1;
        const bm = b.max != null ? b.max : -1;
        if (bm !== am) return bm - am;
        const an = a.min != null ? a.min : -1;
        const bn = b.min != null ? b.min : -1;
        if (bn !== an) return bn - an;
        return (b.roomNo || 0) - (a.roomNo || 0);
      });
      return candidates[0];
    }
  
    function shadowRoomLabel(room) {
      if (!room) return 'Комната';
      const band =
        room.min != null && room.max != null ? ' ' + room.min + '–' + room.max : '';
      const name = room.name || ('#' + (room.roomNo || '?'));
      return name + band;
    }
  
    function syncShadowOpenBtn(room) {
      try {
        const btn = getTopDoc().getElementById('k5-shadow-open');
        if (!btn) return;
        btn.textContent = room ? shadowRoomLabel(room) : 'Комната (авто)';
        btn.title = room && room.url ? room.url : 'авто по уровню';
      } catch (e) {}
    }
  
    async function resolveShadowRoom(win, force) {
      const now = Date.now();
      const manual = BOT.cfg.shadow && BOT.cfg.shadow.roomUrl;
      if (manual && String(manual).trim()) {
        const url = String(manual).trim();
        const room = {
          url: url,
          name: 'вручную',
          roomNo: roomNoFromUrl(url),
          min: null,
          max: null,
        };
        BOT.state.shadowRoom = room;
        BOT.state.shadowRoomAt = now;
        syncShadowOpenBtn(room);
        return room;
      }
  
      if (!force && BOT.state.shadowRoom && now - (BOT.state.shadowRoomAt || 0) < 60000) {
        syncShadowOpenBtn(BOT.state.shadowRoom);
        return BOT.state.shadowRoom;
      }
  
      win = win || getActWin();
      let href = String((win && win.location && win.location.href) || '');
      if (!/arenax\.html/i.test(href)) {
        go(win, COLOSSEUM_URL);
        await sleep(1500);
        win = getActWin();
        href = String((win && win.location && win.location.href) || '');
      }
  
      let rooms = parseArenaxRooms(win);
      if (!rooms.length) rooms = SHADOW_ROOMS_FALLBACK.slice();
  
      const level = getCharLevel();
      const best = pickBestShadowRoom(level, rooms);
      BOT.state.shadowRoom = best;
      BOT.state.shadowRoomAt = now;
      if (BOT.cfg.shadow) {
        // кэш выбранного URL (не принудительный override — пустой roomUrl в cfg = авто)
        BOT.state.resolvedShadowUrl = best && best.url;
      }
      syncShadowOpenBtn(best);
      log(
        'Тень: ур.' +
          (level != null ? level : '?') +
          ' → ' +
          shadowRoomLabel(best) +
          ' (' +
          (best.url || '?') +
          ')',
        'ok'
      );
      return best;
    }
  
    function alreadyInShadowRoom(win, room) {
      win = win || getActWin();
      const href = String((win && win.location && win.location.href) || '');
      if (/bmode_36/i.test(href)) return false;
      const want = roomNoFromUrl((room && room.url) || '') || roomNoFromUrl(BOT.state.resolvedShadowUrl);
      if (!want) return /arena_room_\d+\.html/i.test(href) && !/bmode_/i.test(href);
      return new RegExp('arena_room_' + want + '(?:_actUser-FillData_\\d+)?\\.html', 'i').test(href);
    }
  
    function clickShadowButton(win) {
      win = win || getActWin();
      if (!win || !win.document) return false;
      const els = [...win.document.querySelectorAll('input[type=button],input[type=submit],button,a')];
      for (let i = 0; i < els.length; i++) {
        const s = ((els[i].value || '') + ' ' + (els[i].textContent || '') + ' ' + (els[i].getAttribute('onclick') || '')).trim();
        if (/тень|StartBattleWithShadow|shadow/i.test(s)) {
          try {
            els[i].click();
            return true;
          } catch (e) {}
        }
      }
      return false;
    }
  
    async function ensureShadowRoom(win) {
      win = win || getActWin();
      const room = await resolveShadowRoom(win, false);
      win = getActWin();
      if (alreadyInShadowRoom(win, room)) return win;
  
      const href = String((win && win.location && win.location.href) || '');
      if (!/arena/i.test(href)) {
        go(win, COLOSSEUM_URL);
        await sleep(1400);
        win = getActWin();
      }
  
      const url = (room && room.url) || BOT.state.resolvedShadowUrl || SHADOW_ROOM_URL;
      go(win, url);
      await sleep(1800);
      return getActWin();
    }
  
    async function startShadowFight(win) {
      win = await ensureShadowRoom(win);
      if (isBattleWin(win)) return win;
  
      if (clickShadowButton(win)) {
        log('Тень: клик «Бой с тенью»');
      } else {
        const url = (BOT.cfg.shadow && BOT.cfg.shadow.startUrl) || SHADOW_START_URL;
        log('Тень: старт через ' + url);
        go(win, url);
      }
      for (let i = 0; i < 20; i++) {
        await sleep(800);
        win = getActWin();
        if (isBattleWin(win)) return win;
        const t = ((win.document && win.document.body && win.document.body.innerText) || '').slice(0, 200);
        if (/ваш ход|раунд|бой начался/i.test(t)) return win;
      }
      return getActWin();
    }
  
    async function shadowTick() {
      if (!flagGet(FLAG.shadow) || flagGet(FLAG.captcha)) return;
      watchCaptcha();
  
      let win = getActWin();
      if (!win) {
        log('Тень: нет d_act', 'err');
        return;
      }
  
      if (isBattleWin(win)) {
        if (BOT.cfg.shadow.fight !== false) await runBattleLoop(win);
        return;
      }
  
      // пауза между боями
      const since = BOT.state.lastFightEnd || 0;
      const pauseMin = (BOT.cfg.shadow && BOT.cfg.shadow.pauseMinMs) || 2500;
      const pauseMax = (BOT.cfg.shadow && BOT.cfg.shadow.pauseMaxMs) || 6000;
      if (since && Date.now() - since < pauseMin) {
        await sleep(pauseMin - (Date.now() - since));
      } else if (since) {
        await sleep(humanDelay(pauseMin, pauseMax));
      }
  
      if (!flagGet(FLAG.shadow)) return;
  
      win = await startShadowFight(win);
      if (isBattleWin(win)) {
        if (BOT.cfg.shadow.fight !== false) await runBattleLoop(win);
      } else {
        log('Тень: бой не стартовал, повторю…', 'err');
        await sleep(2000);
      }
  
      if (flagGet(FLAG.shadow) && BOT.cfg.shadow && BOT.cfg.shadow.loop === false) {
        flagSet(FLAG.shadow, false);
        log('Тень: один бой — стоп');
      }
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
      const text = win.document.body ? win.document.body.innerText : '';
      const joins = [...win.document.querySelectorAll('input[name="actBattle-Join"]')].map(function (j) {
        return { id: j.value, form: j.form };
      });
      const cancel = [...win.document.querySelectorAll('input, button')].find(function (b) {
        return /отмен|покинуть|отказаться|выйти из заяв/i.test((b.value || '') + ' ' + (b.textContent || ''));
      });
      const canCreate = !!win.document.querySelector('input[name="actBattle-CreateHeader"]');
      const waitingCard = /\d+\s*\/\s*\d+/.test(text) && /ур\.|на ход/i.test(text);
      const inApp =
        !!cancel ||
        /вы в заявке|ожидайте начала|покинуть заявку|отказаться|вы участвуете/i.test(text) ||
        (joins.length === 0 && !canCreate && waitingCard);
      return {
        joins: joins,
        inApp: inApp,
        canCreate: canCreate,
        needWorkshop: /мастерск|комплект/i.test(text) && /не правильно|необходимо/i.test(text),
        text: text.replace(/\s+/g, ' ').slice(0, 300),
      };
    }
  
    function joinFirstApp(win) {
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
      const min = win.document.querySelector('[name="Battle{minlvl}"]');
      const max = win.document.querySelector('[name="Battle{maxlvl}"]');
      const mp = win.document.querySelector('[name="Battle{maxp}"]');
      if (min) min.value = String(cfg.minlvl);
      if (max) max.value = String(cfg.maxlvl);
      if (mp) mp.value = String(cfg.maxp || 6);
      const btn = win.document.querySelector('input[name="actBattle-CreateHeader"]');
      if (!btn) return { ok: false };
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
      try {
        win.refreshed = false;
        if (typeof win.actReload === 'function') win.actReload();
        else win.location.reload();
      } catch (e) {
        try {
          win.location.reload();
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
          if (BOT.cfg.battle.sessionMaxMs > 0 && BOT.state.fightSessionStart) {
            if (Date.now() - BOT.state.fightSessionStart > BOT.cfg.battle.sessionMaxMs) {
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
          go(getActWin(), APPS_URL);
          await sleep(2000);
        }
        return;
      }
  
      if (!/bmode_36|arena_room/i.test(win.location.href)) {
        go(win, BOT.cfg.chaos.roomUrl || ROOM_URL);
        await sleep(2500);
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
        go(getActWin(), APPS_URL);
        await sleep(2200);
        return;
      }
  
      if (/smode_1|itype_/i.test(win.location.href)) {
        go(win, ROOM_URL);
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
      if (BOT.cfg.chaos.autoJoin && snap.joins.length) {
        action = joinFirstApp(win);
        log('Хаос: join ' + JSON.stringify(action));
      } else if (BOT.cfg.chaos.autoCreate && !snap.joins.length) {
        // создаём свою, если список пуст (после reload-цикла тоже)
        action = createApp(win);
        log('Хаос: create ' + JSON.stringify(action));
      }
  
      if (action && action.ok) {
        BOT.state.emptyAppsSince = 0;
        await sleep(3000);
        const after = getAppsSnapshot(getActWin());
        if (!after.inApp && after.joins.some(function (j) {
          return j.id === action.id;
        })) {
          log('Хаос: вход не принят — перепроверю мастерскую', 'err');
          BOT.state.kitChecked = false;
          BOT.state.kitReady = false;
        }
      }
    }
  
    /* ---------- forest loop ---------- */
    async function forestTick() {
      if (!flagGet(FLAG.forest) || flagGet(FLAG.captcha)) return;
      watchCaptcha();
      const win = getActWin();
      if (!forestReady(win)) {
        log('Жду cu/gd…');
        return;
      }
      hookForest(win);
      dismissModal(win);
  
      if (isBattleWin(win)) {
        log('Лес: бой (дух?)');
        await runBattleLoop(win);
        go(getActWin(), 'forest.html');
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
  
      // поиск
      const needSearch =
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
        if (BOT.cfg.forest.autoSearch && Date.now() - (BOT.state.forestTimers.lastSearchAt || 0) > BOT.cfg.forest.searchWaitMs) {
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
            log('Перехожу на game.html… Затем зайдите в лес и нажмите Старт.', 'err');
            try {
              getTopWin().location.href = '/game.html';
            } catch (e) {
              location.href = '/game.html';
            }
            return;
          }
          log('Нет кадра d_act. Вы вошли в игру? Нажмите «В игру» с главной, F5 на game.html', 'err');
          return;
        }
        win = getActWin();
        if (!win) {
          log('Кадр d_act не найден. F5 на game.html.', 'err');
          return;
        }
        if (!forestReady(win)) {
          log('Открываю лес в d_act…');
          if (!go(win, 'forest.html')) return;
          for (let i = 0; i < 20; i++) {
            await sleep(800);
            win = getActWin();
            if (forestReady(win)) break;
            refreshDiag();
          }
        }
        if (!forestReady(getActWin())) {
          log('Нет cu/gd. Откройте лес кнопкой «Лес» с площади (или ворота). diag: cu=true', 'err');
          refreshDiag();
          return;
        }
        flagSet(FLAG.forest, true);
        flagSet(FLAG.shadow, false);
        if (shadowSched) clearTimeout(shadowSched);
        BOT.state.bannedAbs = new Set();
        BOT.state.bannedTypes = new Set();
        discoverMushroomTypes(getActWin());
        hookForest(getActWin());
        if (BOT.cfg.forest.equipTool) {
          try {
            await equipTool();
          } catch (e) {
            log('Инструмент: ' + (e.message || e), 'err');
          }
        }
        await discoverMe(getActWin());
        log('Лес СТАРТ v' + VERSION, 'ok');
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
      flagSet(FLAG.shadow, false);
      if (shadowSched) clearTimeout(shadowSched);
      BOT.state.kitChecked = false;
      BOT.state.emptyAppsSince = 0;
      BOT.state.fightSessionStart = Date.now();
      log('Хаосы СТАРТ v' + VERSION, 'ok');
      scheduleChaos(true);
      updateUi();
    }
  
    function stopChaos() {
      flagSet(FLAG.chaos, false);
      if (chaosSched) clearTimeout(chaosSched);
      log('Хаосы СТОП');
      updateUi();
    }
  
    let shadowSched = null;
    function scheduleShadow(immediate) {
      if (!isController()) return;
      if (shadowSched) clearTimeout(shadowSched);
      if (!flagGet(FLAG.shadow)) return;
      const delay = immediate ? 400 : 2000;
      shadowSched = setTimeout(async function () {
        try {
          await shadowTick();
        } catch (e) {
          log('тень: ' + (e.message || e), 'err');
        }
        scheduleShadow(false);
      }, delay);
    }
  
    function startShadow() {
      if (!checkLicense()) return;
      if (flagGet(FLAG.captcha) || BOT.state.captchaPaused) {
        if (!clearCaptchaIfGone(false)) {
          log('Сначала снимите капчу (кнопка «Продолжить после капчи»)', 'err');
          return;
        }
      }
      flagSet(FLAG.forest, false);
      flagSet(FLAG.chaos, false);
      if (forestSched) clearTimeout(forestSched);
      if (chaosSched) clearTimeout(chaosSched);
      flagSet(FLAG.shadow, true);
      BOT.state.fightSessionStart = Date.now();
      BOT.state.lastFightEnd = 0;
      BOT.state.shadowRoom = null;
      BOT.state.shadowRoomAt = 0;
      log('Тень СТАРТ (колизей → комната по уровню)', 'ok');
      scheduleShadow(true);
      updateUi();
    }
  
    function stopShadow() {
      flagSet(FLAG.shadow, false);
      if (shadowSched) clearTimeout(shadowSched);
      log('Тень СТОП');
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
        '<label><input type="checkbox" data-cfg="forest.collectCrystals"> кристаллы</label>' +
        '<label><input type="checkbox" data-cfg="forest.collectChests"> сундуки/подарки</label>' +
        '<label><input type="checkbox" data-cfg="forest.collectAllAddItems"> все add_items</label>' +
        '<label><input type="checkbox" data-cfg="forest.autoSearch"> автопоиск</label>' +
        '<label><input type="checkbox" data-cfg="forest.equipTool"> инструмент</label>' +
        '<label><input type="checkbox" data-cfg="forest.autoHeal"> лечение травм</label>' +
        '<label>режим хила <select data-cfg-val="forest.healMode"><option value="auto">auto</option><option value="scroll">свиток</option><option value="ability">абилка</option><option value="wait">ожидание</option></select></label>' +
        '<div class="row">' +
        '<button type="button" id="k5-forest-start">Старт лес</button>' +
        '<button type="button" id="k5-forest-stop" class="danger">Стоп</button>' +
        '<button type="button" id="k5-discover">Найти себя</button></div>' +
        '<hr style="border-color:#3a4530;margin:10px 0">' +
        '<div><b>Хаосы</b></div>' +
        '<label><input type="checkbox" data-cfg="chaos.autoJoin"> авто-вход</label>' +
        '<label><input type="checkbox" data-cfg="chaos.autoCreate"> авто-создание</label>' +
        '<label><input type="checkbox" data-cfg="chaos.ensureKit"> комплект KH</label>' +
        '<label><input type="checkbox" data-cfg="chaos.fight"> бой AI</label>' +
        '<label><input type="checkbox" data-cfg="battle.useMagic"> магия/хил в бою</label>' +
        '<div class="row">' +
        '<button type="button" id="k5-chaos-open">Комната</button>' +
        '<button type="button" id="k5-chaos-start">Старт</button>' +
        '<button type="button" id="k5-chaos-stop" class="danger">Стоп</button></div>' +
        '<hr style="border-color:#3a4530;margin:10px 0">' +
        '<div><b>Колизей — бой с тенью</b></div>' +
        '<label><input type="checkbox" data-cfg="shadow.loop"> цикл боёв</label>' +
        '<label><input type="checkbox" data-cfg="shadow.fight"> бой AI</label>' +
        '<div class="row">' +
        '<button type="button" id="k5-shadow-open">Комната (авто)</button>' +
        '<button type="button" id="k5-shadow-start">Старт тень</button>' +
        '<button type="button" id="k5-shadow-stop" class="danger">Стоп</button></div>' +
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
        go(getActWin(), BOT.cfg.chaos.roomUrl || ROOM_URL);
      };
      panel.querySelector('#k5-chaos-start').onclick = startChaos;
      panel.querySelector('#k5-chaos-stop').onclick = stopChaos;
      panel.querySelector('#k5-shadow-open').onclick = function () {
        (async function () {
          try {
            const room = await resolveShadowRoom(getActWin(), true);
            const w = getActWin();
            if (room && room.url) go(w, room.url);
          } catch (e) {
            log('Тень: открытие комнаты — ' + (e.message || e), 'err');
          }
        })();
      };
      panel.querySelector('#k5-shadow-start').onclick = startShadow;
      panel.querySelector('#k5-shadow-stop').onclick = stopShadow;
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
          ref[key] = input.checked;
          saveCfg();
        };
      });
      panel.querySelectorAll('[data-cfg-val]').forEach(function (input) {
        const path = input.getAttribute('data-cfg-val').split('.');
        let ref = BOT.cfg;
        for (let i = 0; i < path.length - 1; i++) ref = ref[path[i]];
        const key = path[path.length - 1];
        input.value = ref[key];
        input.onchange = function () {
          ref[key] = input.value;
          saveCfg();
        };
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
  
      log('UI v' + VERSION + ' готов. Откройте game.html → лес. Смотрите зелёную полосу сверху.', 'ok');
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
        ' S=' +
        flagGet(FLAG.shadow) +
        ' CAP=' +
        flagGet(FLAG.captcha);
    }
  
    function updateUi() {
      const doc = getTopDoc();
      const fs = doc.getElementById('k5-forest-start');
      const cs = doc.getElementById('k5-chaos-start');
      const ss = doc.getElementById('k5-shadow-start');
      if (fs) fs.classList.toggle('on', flagGet(FLAG.forest));
      if (cs) cs.classList.toggle('on', flagGet(FLAG.chaos));
      if (ss) ss.classList.toggle('on', flagGet(FLAG.shadow));
      const badge = doc.getElementById('k5-cap-badge');
      if (badge) badge.style.display = flagGet(FLAG.captcha) || BOT.state.captchaPaused ? 'inline-block' : 'none';
      if (BOT.state.shadowRoom) syncShadowOpenBtn(BOT.state.shadowRoom);
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
          // v1.0.7: больше не форсим Комнату #1 — авто по уровню
          if (BOT.cfg.shadow) {
            const ru = String(BOT.cfg.shadow.roomUrl || '');
            if (!ru || /arena_room_1\.html/i.test(ru)) BOT.cfg.shadow.roomUrl = '';
          }
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
  
        if (flagGet(FLAG.forest)) scheduleForest(true);
        if (flagGet(FLAG.chaos)) scheduleChaos(true);
        if (flagGet(FLAG.shadow)) scheduleShadow(true);
  
        setInterval(function () {
          watchCaptcha();
          refreshDiag();
          if (flagGet(FLAG.forest) && !forestSched) scheduleForest(true);
          if (flagGet(FLAG.chaos) && !chaosSched) scheduleChaos(true);
          if (flagGet(FLAG.shadow) && !shadowSched) scheduleShadow(true);
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
  