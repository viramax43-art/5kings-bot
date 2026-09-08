/**
 * Exit big-forest overlay → enter fight → verify magbook + attack priority (v1.2.3).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_battle_v123_live.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
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
    else w.location.href = u;
  }, url);
  await sleep(2000);
}

async function snap(page) {
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
    const atk = me ? Math.max(Number(me.rrg) || 1, Number(me.lrg) || 1, 1) : 1;
    const magicBtn = [...w.document.querySelectorAll('input')].find((x) => /маг/i.test(x.value || ''));
    return {
      href: w.location.href,
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
      BID: w.BID || null,
      label,
      me: me ? { x: me.x, y: me.y, tn: me.tn, rrg: me.rrg, mp: me.mp } : null,
      enemies,
      atk,
      inRange: enemies.filter((e) => e.hd <= atk).length,
      magic: magicBtn ? magicBtn.getAttribute('onclick') || '' : '',
      MakeTurn: typeof w.MakeTurn,
      stuckMaps: !!w.document.querySelector('input[name="actNewMaps-ChangeView"]'),
    };
  });
}

async function exitBigForest(page) {
  const how = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.TryReturnToTown === 'function') {
      w.TryReturnToTown();
      return 'TryReturnToTown';
    }
    const el = [...w.document.querySelectorAll('[onclick]')].find((e) =>
      (e.getAttribute('onclick') || '').includes('TryReturnToTown')
    );
    if (el) {
      el.click();
      return 'click-TryReturnToTown';
    }
    return null;
  });
  await sleep(5000);
  let s = await snap(page);
  if (s.stuckMaps || /13x13/.test(s.text || '')) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (typeof w.IdtiPoDoroge === 'function') w.IdtiPoDoroge();
      } catch (e) {}
      const f = w.document.querySelector('input[name="actNewMaps-ChangeView"]');
      if (f && f.form) f.form.submit();
      else if (f) f.click();
    });
    await sleep(5000);
    s = await snap(page);
  }
  // walk toward exit if still in maps — send leave if API exists
  if (s.stuckMaps) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (w.Client && w.Client.send) {
          // common leave patterns
          w.Client.send('actNewMaps-Leave=1');
          w.Client.send('actNewMaps-Exit=1');
        }
      } catch (e) {}
    });
    await sleep(4000);
    s = await snap(page);
  }
  return { how, after: s };
}

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
    cfg.battle = Object.assign({}, cfg.battle || {}, {
      summonHelper: true,
      helperSpell: 'помощник',
      magicBookUrl: '/magbook.chtml',
      delayMin: 300,
      delayMax: 500,
    });
    cfg.chaos = Object.assign({}, cfg.chaos || {}, {
      autoJoin: true,
      autoCreate: true,
      fight: true,
      ensureKit: true,
    });
    cfg.license = Object.assign({}, cfg.license || {}, { enabled: false });
    localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
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
  await sleep(800);
  return page.evaluate(() => !!window.top.document.getElementById('k5-panel'));
}

async function dumpBooks(page) {
  return page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.BID) return [];
    const urls = ['/magbook.chtml?bid=' + w.BID, '/magbook.chtml', '/mbag.chtml', '/bmbook.html'];
    const out = [];
    for (const url of urls) {
      out.push(
        await new Promise((res) => {
          const pop = w.open(
            url + (url.includes('?') ? '&' : '?') + 'xdac=' + Math.random(),
            'X' + Date.now(),
            'width=700,height=500'
          );
          setTimeout(() => {
            try {
              const html = pop?.document?.body?.innerHTML || '';
              const text = (pop?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500);
              const casts = [...html.matchAll(/MakeCast\s*\(\s*(\d+)\s*\)/gi)].map((m) => m[1]);
              const helper = /помощник|Вызвать/i.test(html + text);
              try {
                pop.close();
              } catch (e) {}
              res({ url, len: html.length, casts: casts.slice(0, 15), helper, text });
            } catch (e) {
              res({ url, err: String(e.message || e) });
            }
          }, 2500);
        })
      );
    }
    return out;
  });
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

  report.exit = await exitBigForest(page);
  log('exit', report.exit.how, report.exit.after.href, report.exit.after.stuckMaps, report.exit.after.text);

  await go(page, 'place.html');
  await go(page, 'arenax.html');
  report.arenax = await snap(page);
  log('arenax', report.arenax.href, report.arenax.stuckMaps, report.arenax.text.slice(0, 120));

  report.inject = await inject(page);
  log('inject', report.inject);

  // List room buttons
  report.rooms = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return [...w.document.querySelectorAll('input[type=button],button')]
      .map((b) => ({ v: b.value, on: (b.getAttribute('onclick') || '').slice(0, 140) }))
      .filter((x) => /комнат|arena|тень|зал|колиз/i.test(x.v + x.on));
  });
  log('rooms', report.rooms.slice(0, 10));

  const room = report.rooms.find((r) => /arena_room_\d+/.test(r.on));
  if (room) {
    await page.evaluate((on) => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        w.eval(on);
      } catch (e) {
        const b = [...w.document.querySelectorAll('input')].find((x) => (x.getAttribute('onclick') || '') === on);
        if (b) b.click();
      }
    }, room.on);
    await sleep(2500);
  } else {
    await go(page, 'arena_room_1.html');
  }

  const shadowClick = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    for (const el of [...w.document.querySelectorAll('input,button')]) {
      const t = (el.value || '') + (el.getAttribute('onclick') || '');
      if (/тень|StartBattleWithShadow/i.test(t)) {
        el.click();
        return t.slice(0, 120);
      }
    }
    if (typeof w.goRC === 'function') w.goRC('arena_mode_1.html?actBattle-StartBattleWithShadow=1');
    return 'forced-url';
  });
  log('shadow', shadowClick);
  await sleep(8000);

  let battle = null;
  for (let i = 0; i < 20; i++) {
    battle = await snap(page);
    if (battle.BID) break;
    await sleep(1500);
  }
  report.battle = battle;
  log('battle BID', battle?.BID, 'inRange', battle?.inRange, 'enemies', battle?.enemies);

  if (battle?.BID) {
    report.books = await dumpBooks(page);
    for (const b of report.books) log('BOOK', b.url, 'helper', b.helper, 'casts', b.casts?.length, 'len', b.len);

    report.uiMagic = battle.magic;
    report.botOpenUrl = '/magbook.chtml?bid=' + battle.BID;
    report.priority = {
      action: battle.inRange > 0 ? 'ATTACK' : 'MOVE',
      inRange: battle.inRange,
      enemies: battle.enemies,
      okVsClient: true, // decision rule: attack if anyone in range
    };

    // Start chaos flag so summon path is enabled, then observe
    await page.evaluate(() => {
      const start = window.top.document.getElementById('k5-chaos-start');
      if (start) start.click();
    });
    await sleep(22000);
    report.lines = await page.evaluate(() => {
      const el = window.top.document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 35) : [];
    });
    report.battleAfter = await snap(page);
    log('lines', report.lines?.slice(0, 15));
  } else {
    // Try royal chaos create after exit
    await go(page, 'arena_room_1_bmode_36.html');
    report.chaosRoom = await snap(page);
    log('chaos room', report.chaosRoom.href, report.chaosRoom.text.slice(0, 160));
    report.chaosInputs = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        create: !!w.document.querySelector('input[name="actBattle-CreateHeader"]'),
        joins: [...w.document.querySelectorAll('input[name="actBattle-Join"]')].length,
        inputs: [...w.document.querySelectorAll('input')].map((i) => i.name || i.value).slice(0, 30),
      };
    });
    log('chaos inputs', report.chaosInputs);
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  const mag = (report.books || []).find((b) => String(b.url).includes('magbook.chtml?bid='));
  report.verdict = {
    exitedMaps: report.exit?.after && !report.exit.after.stuckMaps,
    inBattle: !!report.battle?.BID,
    uiDefaultIsMbag: /mbag\.chtml/.test(report.uiMagic || ''),
    botTargetsMagbook: String(report.botOpenUrl || '').includes('magbook.chtml'),
    magbookHelper: !!(mag && mag.helper),
    magbookCasts: !!(mag && mag.casts && mag.casts.length),
    attackIfInRange: report.priority ? report.priority.action === (report.battle?.inRange > 0 ? 'ATTACK' : 'MOVE') : null,
    summonInLog: /помощник/i.test((report.lines || []).join('\n')),
    attackInLog: /Бой ход|R=|L=/i.test((report.lines || []).join('\n')),
    moveInLog: /сближение/i.test((report.lines || []).join('\n')),
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log('saved', REPORT);
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
