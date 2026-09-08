/**
 * v1.2.3 battle regression vs client TZ:
 * 1) magbook.chtml (not mbag/bmbook) + «Вызвать помощника» on hex adjacent to enemy
 * 2) attack/block preferred over movement when enemy in range
 * 3) chaos loop order: summon → heal → fight
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_battle_v123_report.json');

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
  const checks = [];
  const pass = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: detail || '' });

  pass('version', /VERSION = '1\.2\.3'/.test(src) && /@version\s+1\.2\.3/.test(src), 'v1.2.3');
  pass('summonHelper_cfg', /summonHelper:\s*true/.test(src) && /magicBookUrl:\s*'\/magbook\.chtml'/.test(src));
  pass('opens_magbook', /magicBookUrl \|\| '\/magbook\.chtml'/.test(src) || /bookBase = cfg\.magicBookUrl/.test(src));
  pass('no_mbag_in_chaos_magic', /wantMagic = !inChaos && cfg\.useMagic/.test(src));
  pass('helper_spell', /helperSpell:\s*'помощник'/.test(src) && /spellRe.*помощник|helperSpell \|\| 'помощник'/.test(src));
  pass('ab8_magbook', /win\.ab\(8\)/.test(src));
  pass('adjacent_hex', /pickSummonHex/.test(src) && /HexDistance\(x, y, ub\.x, ub\.y\) !== 1/.test(src));
  pass('attack_before_far', /inRange\.length \? inRange\[0\] : withDist\[0\]/.test(src));
  pass('loop_summon_first', /trySummonHelper[\s\S]{0,200}tryBattleHealOrMagic[\s\S]{0,200}playHumanTurn/.test(src));
  pass('no_bmbook_open', !/open\(['"]\/bmbook\.html/.test(src));
  // chaos path must not default-open mbag for magic when inChaos
  pass('mbag_only_non_chaos', /else if \(wantMagic\) win\.open\('\/mbag\.chtml/.test(src));

  return checks;
}

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(1800);
}

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    try {
      const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
      cfg.battle = Object.assign({}, cfg.battle, {
        summonHelper: true,
        helperSpell: 'помощник',
        magicBookUrl: '/magbook.chtml',
        delayMin: 400,
        delayMax: 700,
      });
      cfg.chaos = Object.assign({}, cfg.chaos, {
        autoJoin: true,
        autoCreate: true,
        fight: true,
        ensureKit: true,
        roomUrl: 'arena_room_1_bmode_36.html',
      });
      cfg.license = Object.assign({}, cfg.license, { enabled: false });
      localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
    } catch (e) {}
  });
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
  return page.evaluate(() => !!window.top.document.getElementById('k5-panel'));
}

async function botLog(page) {
  return page.evaluate(() => {
    const doc = window.top.document;
    const logEl = doc.getElementById('k5-log');
    return {
      lines: logEl ? [...logEl.querySelectorAll('div')].map((d) => d.textContent).slice(0, 40) : [],
      status: (doc.getElementById('k5-status') || {}).textContent || '',
      chaosOn: !!(doc.getElementById('k5-chaos-start') || {}).classList?.contains?.('on'),
    };
  });
}

async function battleSnap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no-act' };
    const label = (w.document.getElementById('TurnLabel') || {}).innerText || '';
    const me = w.ME;
    const enemies = [];
    if (me && w.UNBS) {
      for (const id of Object.keys(w.UNBS)) {
        const u = w.UNBS[id];
        if (!u || u.hp <= 0 || u.sd === me.sd) continue;
        let hd = 99;
        try {
          if (typeof w.HexDistance === 'function') hd = w.HexDistance(me.x, me.y, u.x, u.y);
        } catch (e) {}
        enemies.push({ id, nk: u.nk, x: u.x, y: u.y, hd, hp: u.hp });
      }
    }
    enemies.sort((a, b) => a.hd - b.hd);
    const atkRange = me ? Math.max(Number(me.rrg) || 1, Number(me.lrg) || 1, 1) : 1;
    return {
      href: String(w.location.href || '').split('/').pop(),
      BID: w.BID || null,
      MakeTurn: typeof w.MakeTurn,
      MakeMove: typeof w.MakeMove,
      ab: typeof w.ab,
      label,
      myTurn: !!(me && me.md == 0 && !w.ReloadReq && /ваш ход/i.test(label)),
      me: me ? { x: me.x, y: me.y, tn: me.tn, rrg: me.rrg, lrg: me.lrg, mp: me.mp, hp: me.hp } : null,
      enemies,
      atkRange,
      inRange: enemies.filter((e) => e.hd <= atkRange).length,
      magicBtn: (() => {
        const b = [...w.document.querySelectorAll('input[type=button]')].find((x) => /маг/i.test(x.value || ''));
        return b ? (b.getAttribute('onclick') || '').slice(0, 160) : null;
      })(),
    };
  });
}

/** Open magbook during live fight and inspect spells */
async function dumpMagbookInFight(page) {
  return page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w || !w.BID) return { err: 'no-battle' };
    const urls = [
      '/magbook.chtml?bid=' + w.BID,
      '/magbook.chtml',
      '/mbag.chtml',
      '/bmbook.html',
    ];
    const out = [];
    for (const url of urls) {
      const row = await new Promise((resolve) => {
        try {
          const pop = w.open(url + (url.includes('?') ? '&' : '?') + 'xdac=' + Math.random(), 'T' + Math.random(), 'width=800,height=600');
          setTimeout(() => {
            try {
              const html = pop?.document?.body?.innerHTML || '';
              const text = (pop?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600);
              const casts = [...html.matchAll(/MakeCast\s*\(\s*(\d+)\s*\)/gi)].map((m) => m[1]);
              const helper = /помощник|Вызвать/i.test(html + text);
              const forms = [...(pop?.document?.querySelectorAll('form') || [])].map((f) => f.id).slice(0, 10);
              try {
                pop.close();
              } catch (e) {}
              resolve({
                url,
                len: html.length,
                helper,
                casts: casts.slice(0, 15),
                forms,
                text,
              });
            } catch (e) {
              resolve({ url, err: String(e.message || e) });
            }
          }, 2800);
        } catch (e) {
          resolve({ url, err: String(e.message || e) });
        }
      });
      out.push(row);
    }
    return out;
  });
}

/** Simulate decision: with enemy in range, would we move or attack? */
async function simulatePriority(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w || !w.ME || !w.UNBS || typeof w.HexDistance !== 'function') return { err: 'no-state' };
    const me = w.ME;
    const atkRange = Math.max(Number(me.rrg) || 1, Number(me.lrg) || 1, 1);
    const enemies = [];
    for (const id of Object.keys(w.UNBS)) {
      const u = w.UNBS[id];
      if (!u || u.hp <= 0 || u.sd === me.sd) continue;
      enemies.push({ id, nk: u.nk, hd: w.HexDistance(me.x, me.y, u.x, u.y), hp: u.hp });
    }
    enemies.sort((a, b) => a.hd - b.hd || a.hp - b.hp);
    const inRange = enemies.filter((e) => e.hd <= atkRange);
    const target = inRange.length ? inRange[0] : enemies[0];
    if (!target) return { err: 'no-enemies' };
    const wouldMove = target.hd > atkRange;
    return {
      atkRange,
      enemies: enemies.slice(0, 5),
      chosen: target,
      decision: wouldMove ? 'MOVE' : 'ATTACK_BLOCK',
      okPriority: !wouldMove || inRange.length === 0,
    };
  });
}

async function clickChaosStart(page) {
  return page.evaluate(() => {
    const btn = window.top.document.getElementById('k5-chaos-start');
    if (!btn) return false;
    btn.click();
    return true;
  });
}

const report = {
  at: new Date().toISOString(),
  static: [],
  injectOk: false,
  live: {},
  verdict: { magbook: null, summon: null, attackPriority: null, notes: [] },
};

const src = fs.readFileSync(USER_JS, 'utf8');
report.static = staticAudit(src);
log('STATIC', report.static.map((c) => (c.ok ? 'OK' : 'FAIL') + ' ' + c.id).join(' | '));

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  report.injectOk = await inject(page);
  log('inject panel', report.injectOk);

  // Go to royal chaos room
  await goAct(page, 'arena_room_1_bmode_36.html');
  await sleep(2000);
  const roomSnap = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const text = (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500);
    const joins = [...(w?.document?.querySelectorAll('input[name="actBattle-Join"]') || [])].length;
    const create = !!w?.document?.querySelector('input[name="actBattle-CreateHeader"]');
    return { href: w?.location?.href, joins, create, text };
  });
  report.live.room = roomSnap;
  log('room', roomSnap.href, 'joins', roomSnap.joins, 'create', roomSnap.create);

  const started = await clickChaosStart(page);
  log('chaos start click', started);
  report.live.chaosStart = started;

  // Wait for battle up to ~90s
  let battle = null;
  for (let i = 0; i < 45; i++) {
    battle = await battleSnap(page);
    const ui = await botLog(page);
    if (i % 5 === 0) log('wait', i, battle.href, 'BID', battle.BID, 'label', battle.label, ui.lines[0] || '');
    if (battle.BID && typeof battle.MakeTurn === 'function') break;
    await sleep(2000);
  }
  report.live.battle = battle;
  report.live.botLogBefore = await botLog(page);

  if (battle?.BID) {
    log('IN BATTLE', battle.BID, 'enemies', battle.enemies?.length, 'inRange', battle.inRange);
    const books = await dumpMagbookInFight(page);
    report.live.books = books;
    for (const b of books) {
      log('BOOK', b.url, 'helper=', b.helper, 'casts=', (b.casts || []).length, 'len=', b.len, b.err || '');
    }
    const mag = books.find((b) => /magbook\.chtml\?bid=/.test(b.url));
    const mbag = books.find((b) => /mbag\.chtml/.test(b.url));
    const bm = books.find((b) => /bmbook/.test(b.url));
    report.verdict.magbook = !!(mag && (mag.helper || (mag.casts && mag.casts.length)));
    report.verdict.notes.push(
      mag?.helper
        ? 'magbook+bid содержит «помощник»'
        : mag?.casts?.length
          ? 'magbook+bid имеет MakeCast, helper text не найден'
          : 'magbook+bid пустая/без заклинаний на этом персе'
    );
    report.verdict.notes.push(
      mbag && mbag.len > 500 ? 'mbag не пустая (боевая книга UI)' : 'mbag пустая/короткая'
    );
    report.verdict.notes.push(bm && (bm.helper || bm.casts?.length) ? 'bmbook тоже имеет контент' : 'bmbook пустая/без helper');

    const prio = await simulatePriority(page);
    report.live.priority = prio;
    report.verdict.attackPriority = !!prio.okPriority;
    log('PRIORITY', prio.decision, 'ok=', prio.okPriority, JSON.stringify(prio.chosen));

    // Let bot fight a few turns
    await sleep(25000);
    report.live.botLogAfter = await botLog(page);
    const lines = (report.live.botLogAfter.lines || []).join('\n');
    const summoned = /помощник|MAGBOOK|magbook/i.test(lines);
    const attacked = /Бой ход|R=|L=/i.test(lines);
    const moved = /сближение/i.test(lines);
    report.verdict.summon = summoned;
    report.verdict.notes.push(summoned ? 'в логе есть попытка помощника' : 'в логе нет записи о помощнике');
    report.verdict.notes.push(attacked ? 'есть удар/блок' : 'нет записи удара');
    report.verdict.notes.push(moved ? 'было сближение (ок если вне радиуса)' : 'сближения не было');
    log('LOG after:\n', lines.slice(0, 1200));
  } else {
    report.verdict.notes.push('Не удалось войти в бой за ~90с — live magbook/priority не проверены');
    log('NO BATTLE — kit/queue issue?', (report.live.botLogBefore.lines || []).slice(0, 10));
  }

  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
  log('saved', REPORT);
  await browser.close().catch(() => {});
}

const staticFail = report.static.filter((c) => !c.ok);
console.log('\n=== VERDICT ===');
console.log('static fails:', staticFail.length ? staticFail.map((c) => c.id).join(', ') : 'none');
console.log('magbook spells:', report.verdict.magbook);
console.log('summon log:', report.verdict.summon);
console.log('attack priority:', report.verdict.attackPriority);
console.log('notes:', report.verdict.notes.join(' | '));
process.exit(staticFail.length ? 1 : 0);
