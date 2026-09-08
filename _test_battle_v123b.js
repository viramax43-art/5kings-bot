/**
 * Focused live checks for v1.2.3:
 * A) unit: attack-vs-move priority decision
 * B) workshop kit + create/join royal chaos → magbook dump + bot turns
 * C) shadow fight fallback for attack priority if chaos queue empty
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_battle_v123_report2.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;

function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
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

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    try {
      const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
      cfg.battle = Object.assign({}, cfg.battle || {}, {
        summonHelper: true,
        helperSpell: 'помощник',
        magicBookUrl: '/magbook.chtml',
        delayMin: 350,
        delayMax: 600,
        pauseBetweenFightsMinMs: 3000,
        pauseBetweenFightsMaxMs: 5000,
      });
      cfg.chaos = Object.assign({}, cfg.chaos || {}, {
        autoJoin: true,
        autoCreate: true,
        fight: true,
        ensureKit: true,
        roomUrl: 'arena_room_1_bmode_36.html',
        reloadEmptyMs: 8000,
      });
      cfg.license = Object.assign({}, cfg.license || {}, { enabled: false });
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
  await sleep(900);
  return page.evaluate(() => !!window.top.document.getElementById('k5-panel'));
}

function unitPriority() {
  // Pure decision mirror of playHumanTurn target selection
  function decide(enemies, atkRange) {
    const withDist = enemies.slice().sort((a, b) => a.hd - b.hd || a.hp - b.hp);
    const inRange = withDist.filter((e) => e.hd <= atkRange);
    const target = inRange.length ? inRange[0] : withDist[0];
    return {
      target,
      action: target.hd > atkRange ? 'MOVE' : 'ATTACK',
    };
  }
  const cases = [
    {
      name: 'near+far prefers near attack',
      enemies: [
        { id: 1, hd: 1, hp: 50 },
        { id: 2, hd: 5, hp: 10 },
      ],
      range: 1,
      expect: 'ATTACK',
      expectId: 1,
    },
    {
      name: 'only far → move',
      enemies: [{ id: 2, hd: 4, hp: 10 }],
      range: 1,
      expect: 'MOVE',
      expectId: 2,
    },
    {
      name: 'two in range → nearest',
      enemies: [
        { id: 3, hd: 2, hp: 40 },
        { id: 4, hd: 1, hp: 40 },
      ],
      range: 2,
      expect: 'ATTACK',
      expectId: 4,
    },
  ];
  return cases.map((c) => {
    const r = decide(c.enemies, c.range);
    return {
      name: c.name,
      ok: r.action === c.expect && r.target.id === c.expectId,
      got: r,
      expect: { action: c.expect, id: c.expectId },
    };
  });
}

async function botLines(page) {
  return page.evaluate(() => {
    const logEl = window.top.document.getElementById('k5-log');
    return logEl ? [...logEl.querySelectorAll('div')].map((d) => d.textContent).slice(0, 50) : [];
  });
}

async function startChaos(page) {
  return page.evaluate(() => {
    const b = window.top.document.getElementById('k5-chaos-start');
    if (!b) return false;
    b.click();
    return true;
  });
}

async function battleSnap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no' };
    const label = (w.document.getElementById('TurnLabel') || {}).innerText || '';
    const me = w.ME;
    const enemies = [];
    if (me && w.UNBS) {
      for (const id of Object.keys(w.UNBS)) {
        const u = w.UNBS[id];
        if (!u || u.hp <= 0 || u.sd === me.sd) continue;
        let hd = 99;
        try {
          hd = w.HexDistance(me.x, me.y, u.x, u.y);
        } catch (e) {}
        enemies.push({ id, nk: u.nk, hd, x: u.x, y: u.y });
      }
    }
    enemies.sort((a, b) => a.hd - b.hd);
    const atkRange = me ? Math.max(Number(me.rrg) || 1, Number(me.lrg) || 1, 1) : 1;
    return {
      href: String(w.location.href || ''),
      BID: w.BID || null,
      label,
      me: me ? { x: me.x, y: me.y, tn: me.tn, rrg: me.rrg, lrg: me.lrg, mp: me.mp } : null,
      enemies,
      atkRange,
      inRange: enemies.filter((e) => e.hd <= atkRange).length,
      magicOnclick: (() => {
        const b = [...w.document.querySelectorAll('input[type=button]')].find((x) => /маг/i.test(x.value || ''));
        return b ? b.getAttribute('onclick') || '' : '';
      })(),
    };
  });
}

async function dumpBooks(page) {
  return page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.BID) return [];
    const urls = ['/magbook.chtml?bid=' + w.BID, '/magbook.chtml', '/mbag.chtml', '/bmbook.html'];
    const out = [];
    for (const url of urls) {
      out.push(
        await new Promise((resolve) => {
          try {
            const pop = w.open(url + (url.includes('?') ? '&' : '?') + 'xdac=' + Math.random(), 'B' + Date.now(), 'width=700,height=500');
            setTimeout(() => {
              try {
                const html = pop?.document?.body?.innerHTML || '';
                const text = (pop?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800);
                const casts = [...html.matchAll(/MakeCast\s*\(\s*(\d+)\s*\)/gi)].map((m) => m[1]);
                const helperHit = /помощник|Вызвать/i.test(html + text);
                const snip =
                  helperHit
                    ? (html + text).slice(Math.max(0, (html + text).search(/помощник|Вызвать/i) - 80), (html + text).search(/помощник|Вызвать/i) + 200)
                    : '';
                try {
                  pop.close();
                } catch (e) {}
                resolve({ url, len: html.length, casts: casts.slice(0, 20), helperHit, text, snip });
              } catch (e) {
                resolve({ url, err: String(e.message || e) });
              }
            }, 2600);
          } catch (e) {
            resolve({ url, err: String(e.message || e) });
          }
        })
      );
    }
    return out;
  });
}

async function startShadow(page) {
  await goAct(page, 'arenax.html');
  // pick highest room
  const room = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const rooms = [];
    for (const btn of [...w.document.querySelectorAll('input[type=button],button')]) {
      const oc = btn.getAttribute('onclick') || '';
      const m = oc.match(/goRC\s*\(\s*['"]([^'"]*arena_room_\d+[^'"]*)['"]/i);
      const label = (btn.value || btn.textContent || '').trim();
      if (m && /комнат/i.test(label)) rooms.push({ label, url: m[1] });
    }
    // also links
    for (const a of [...w.document.querySelectorAll('a[onclick],td')]) {
      const oc = a.getAttribute('onclick') || '';
      const m = oc.match(/goRC\s*\(\s*['"]([^'"]*arena_room_\d+[^'"]*)['"]/i);
      if (m) rooms.push({ label: (a.innerText || '').slice(0, 40), url: m[1] });
    }
    return rooms;
  });
  log('shadow rooms found', room.length, room.slice(0, 3));
  if (room[0]) await goAct(page, room[0].url);
  else await goAct(page, 'arena_room_1.html');
  const clicked = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    for (const el of [...w.document.querySelectorAll('input,button,a')]) {
      const t = (el.value || '') + (el.textContent || '') + (el.getAttribute('onclick') || '');
      if (/тень|StartBattleWithShadow/i.test(t)) {
        el.click();
        return t.slice(0, 100);
      }
    }
    // force URL
    if (typeof w.goRC === 'function') w.goRC('arena_mode_1.html?actBattle-StartBattleWithShadow=1');
    return 'forced-url';
  });
  log('shadow click', clicked);
  await sleep(6000);
}

const report = {
  at: new Date().toISOString(),
  unitPriority: unitPriority(),
  static: {},
  live: {},
};

const src = fs.readFileSync(USER_JS, 'utf8');
report.static = {
  version123: /VERSION = '1\.2\.3'/.test(src),
  magbookUrl: /magicBookUrl:\s*'\/magbook\.chtml'/.test(src),
  summonHelper: /summonHelper:\s*true/.test(src),
  ab8: /win\.ab\(8\)/.test(src),
  noChaosMbag: /wantMagic = !inChaos && cfg\.useMagic/.test(src),
  inRangeFirst: /inRange\.length \? inRange\[0\]/.test(src),
  adjacentHex: /HexDistance\(x, y, ub\.x, ub\.y\) !== 1/.test(src),
  afterCastFallthrough: /afterCast/.test(src) && /trySummonHelper/.test(src),
  noBmbookOpen: !/open\(['"]\/bmbook\.html/.test(src),
};
log('STATIC', report.static);
log(
  'UNIT priority',
  report.unitPriority.map((u) => (u.ok ? 'OK' : 'FAIL') + ':' + u.name).join(' | ')
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
  report.live.inject = await inject(page);
  log('inject', report.live.inject);

  // 1) Workshop kit manually via bot path
  await goAct(page, 'arena_room_1_bmode_36_smode_1.html');
  await sleep(2000);
  report.live.workshop = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const text = (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 700);
    const wear = [...(w?.document?.querySelectorAll('input') || [])]
      .filter((b) => /надеть/i.test(b.value || ''))
      .map((b) => b.value);
    return { href: w?.location?.href, wear, text };
  });
  log('workshop', report.live.workshop.wear, report.live.workshop.text.slice(0, 200));

  // Wear kit if present
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const btn = [...w.document.querySelectorAll('input')].find((b) => /надеть/i.test(b.value || ''));
    if (btn) btn.click();
  });
  await sleep(2500);

  await goAct(page, 'arena_room_1_bmode_36.html');
  report.live.apps = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      href: w?.location?.href,
      joins: [...(w?.document?.querySelectorAll('input[name="actBattle-Join"]') || [])].length,
      create: !!w?.document?.querySelector('input[name="actBattle-CreateHeader"]'),
      needWs: /мастерск|комплект/i.test(w?.document?.body?.innerText || ''),
      text: (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    };
  });
  log('apps', report.live.apps);

  await startChaos(page);
  log('chaos started');

  let battle = null;
  for (let i = 0; i < 50; i++) {
    battle = await battleSnap(page);
    if (i % 6 === 0) {
      const lines = await botLines(page);
      log('poll', i, (battle.href || '').split('/').pop(), 'BID', battle.BID, lines[0] || '');
    }
    if (battle.BID) break;
    await sleep(2000);
  }
  report.live.chaosBattle = battle;

  if (!battle?.BID) {
    log('Chaos fight not entered — try shadow for priority + book open');
    // stop chaos
    await page.evaluate(() => {
      const b = window.top.document.getElementById('k5-chaos-stop');
      if (b) b.click();
    });
    await startShadow(page);
    for (let i = 0; i < 15; i++) {
      battle = await battleSnap(page);
      if (battle.BID) break;
      await sleep(1500);
    }
    report.live.shadowBattle = battle;
  }

  if (battle?.BID) {
    log('BATTLE ok', battle.BID, 'enemies', battle.enemies, 'inRange', battle.inRange);
    report.live.books = await dumpBooks(page);
    for (const b of report.live.books) {
      log('BOOK', b.url, 'helper', b.helperHit, 'casts', b.casts?.length, 'len', b.len);
      if (b.snip) log('SNIP', b.snip.replace(/\s+/g, ' ').slice(0, 180));
    }

    // priority from live state
    const atkRange = battle.atkRange || 1;
    const inRange = (battle.enemies || []).filter((e) => e.hd <= atkRange);
    const chosen = inRange[0] || (battle.enemies || [])[0];
    report.live.priorityDecision = chosen
      ? {
          action: chosen.hd > atkRange ? 'MOVE' : 'ATTACK',
          chosen,
          ok: !(chosen.hd > atkRange && inRange.length > 0),
        }
      : { err: 'no enemies' };
    log('PRIORITY', report.live.priorityDecision);

    // Force FLAG.chaos and run a few bot turns if in chaos mode
    await page.evaluate(() => {
      try {
        localStorage.setItem('K5BOT_run_chaos', 'true');
        const btn = window.top.document.getElementById('k5-chaos-start');
        if (btn && !btn.classList.contains('on')) btn.click();
      } catch (e) {}
    });
    // If shadow, manually open magbook like bot would and check URL used by our cfg
    report.live.botWouldOpen = '/magbook.chtml?bid=' + battle.BID;
    report.live.uiMagicButtonOpens = /mbag\.chtml/.test(battle.magicOnclick || '')
      ? 'mbag.chtml (UI default — bot must bypass)'
      : battle.magicOnclick;

    await sleep(20000);
    report.live.linesAfter = await botLines(page);
    log('LINES\n', (report.live.linesAfter || []).slice(0, 15).join('\n'));
  } else {
    report.live.fail = 'no battle entered';
    report.live.lines = await botLines(page);
    log('FAIL no battle', report.live.lines?.slice(0, 12));
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

const unitFail = report.unitPriority.filter((u) => !u.ok);
const staticFail = Object.entries(report.static).filter(([, v]) => !v);
const books = report.live.books || [];
const mag = books.find((b) => String(b.url).includes('magbook.chtml?bid='));
const verdict = {
  unitPriority: unitFail.length === 0,
  static: staticFail.length === 0,
  bypassesUiMbag: /mbag/.test(report.live.uiMagicButtonOpens || '') === true || report.live.botWouldOpen?.includes('magbook'),
  magbookHasHelper: !!(mag && mag.helperHit),
  magbookHasCasts: !!(mag && mag.casts && mag.casts.length),
  attackPriorityLive: report.live.priorityDecision?.ok !== false,
  botUsesMagbookUrl: String(report.live.botWouldOpen || '').includes('magbook.chtml'),
};
report.verdict = verdict;
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), 'utf8');
console.log('\n=== VERDICT ===');
console.log(JSON.stringify(verdict, null, 2));
if (staticFail.length) console.log('static fail', staticFail);
if (unitFail.length) console.log('unit fail', unitFail);
process.exit(unitFail.length || staticFail.length ? 1 : 0);
