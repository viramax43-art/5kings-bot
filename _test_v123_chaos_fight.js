/**
 * Join/create royal chaos fight and verify magbook + combat priority (v1.2.3).
 * Assumes character can leave maps overlay (uses TryReturnToTown + reload room).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_v123_chaos_fight.json');

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
  await sleep(2200);
}

async function leaveMaps(page) {
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      if (typeof w.TryReturnToTown === 'function') w.TryReturnToTown();
    } catch (e) {}
  });
  await sleep(4000);
  // Hard navigate via top location of act after leave attempt
  await go(page, 'place.html');
  await sleep(1500);
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
      delayMin: 250,
      delayMax: 450,
    });
    cfg.chaos = Object.assign({}, cfg.chaos || {}, {
      autoJoin: true,
      autoCreate: true,
      fight: true,
      ensureKit: true,
      roomUrl: 'arena_room_1_bmode_36.html',
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
  await sleep(700);
  return !!((await page.evaluate(() => window.top.document.getElementById('k5-panel'))) );
}

async function roomInfo(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const text = (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400);
    return {
      href: w.location.href,
      create: !!w.document.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: [...w.document.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value),
      stuckMaps: !!w.document.querySelector('input[name="actNewMaps-ChangeView"]'),
      text,
    };
  });
}

async function battleSnap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
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
      BID: w.BID || null,
      label,
      me: me ? { x: me.x, y: me.y, tn: me.tn, rrg: me.rrg, mp: me.mp } : null,
      enemies,
      atk,
      inRange: enemies.filter((e) => e.hd <= atk).length,
      magic: magicBtn ? magicBtn.getAttribute('onclick') || '' : '',
    };
  });
}

async function dumpBooks(page) {
  return page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.BID) return [];
    const urls = ['/magbook.chtml?bid=' + w.BID, '/mbag.chtml', '/bmbook.html'];
    const out = [];
    for (const url of urls) {
      out.push(
        await new Promise((res) => {
          const pop = w.open(url + (url.includes('?') ? '&' : '?') + 'xdac=' + Math.random(), 'T' + Date.now(), 'width=700,height=500');
          setTimeout(() => {
            try {
              const html = pop?.document?.body?.innerHTML || '';
              const text = (pop?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400);
              const casts = [...html.matchAll(/MakeCast\s*\(\s*(\d+)\s*\)/gi)].map((m) => m[1]);
              const helper = /помощник|Вызвать/i.test(html + text);
              try {
                pop.close();
              } catch (e) {}
              res({ url, len: html.length, casts: casts.slice(0, 12), helper, text });
            } catch (e) {
              res({ url, err: String(e.message || e) });
            }
          }, 2400);
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
  await leaveMaps(page);
  report.inject = await inject(page);
  log('inject', report.inject);

  await go(page, 'arena_room_1_bmode_36.html');
  report.room1 = await roomInfo(page);
  log('room', report.room1);

  // Wear kit if needed
  if (!report.room1.create && !report.room1.joins?.length) {
    await go(page, 'arena_room_1_bmode_36_smode_1.html');
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const btn = [...w.document.querySelectorAll('input')].find((b) => /надеть/i.test(b.value || ''));
      if (btn) btn.click();
    });
    await sleep(2500);
    await go(page, 'arena_room_1_bmode_36.html');
    report.room2 = await roomInfo(page);
    log('room2', report.room2);
  }

  let room = report.room2 || report.room1;

  // Join existing or create
  if (room.joins?.length) {
    const joinRes = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const join = w.document.querySelector('input[name="actBattle-Join"]');
      if (!join || !join.form) return { ok: false };
      const side = join.form.querySelector('input[name="side"], select[name="side"]');
      if (side && side.tagName === 'SELECT') side.value = side.options[0]?.value || '1';
      const btn = [...join.form.querySelectorAll('input[type=submit]')].find((b) => /принять|войти/i.test(b.value || ''));
      if (btn && join.form.requestSubmit) join.form.requestSubmit(btn);
      else if (btn) btn.click();
      else join.form.submit();
      return { ok: true, id: join.value };
    });
    report.join = joinRes;
    log('join', joinRes);
  } else if (room.create) {
    const createRes = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const min = w.document.querySelector('[name="Battle{minlvl}"]');
      const max = w.document.querySelector('[name="Battle{maxlvl}"]');
      const mp = w.document.querySelector('[name="Battle{maxp}"]');
      if (min) min.value = '0';
      if (max) max.value = '100';
      if (mp) mp.value = '6';
      const btn = w.document.querySelector('input[name="actBattle-CreateHeader"]');
      if (!btn) return { ok: false };
      const form = btn.form;
      if (form && form.requestSubmit) form.requestSubmit(btn);
      else if (btn) btn.click();
      return { ok: true };
    });
    report.create = createRes;
    log('create', createRes);
  }

  // Start bot chaos + wait for battle (up to 3 min — may need players)
  await page.evaluate(() => {
    const b = window.top.document.getElementById('k5-chaos-start');
    if (b) b.click();
  });

  let battle = null;
  for (let i = 0; i < 90; i++) {
    battle = await battleSnap(page);
    if (i % 10 === 0) {
      const lines = await page.evaluate(() => {
        const el = window.top.document.getElementById('k5-log');
        return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 3) : [];
      });
      const ri = await roomInfo(page);
      log('wait', i, 'BID', battle.BID, 'href', (battle.href || '').split('/').pop(), lines[0] || '', 'joins', ri.joins?.length);
    }
    if (battle.BID) break;
    await sleep(2000);
  }
  report.battle = battle;

  if (battle?.BID) {
    log('IN FIGHT', battle.BID, battle.enemies, 'inRange', battle.inRange);
    report.books = await dumpBooks(page);
    for (const b of report.books) log('BOOK', b.url, 'helper', b.helper, 'casts', (b.casts || []).length, 'len', b.len);
    report.uiMagic = battle.magic;
    report.botOpenUrl = '/magbook.chtml?bid=' + battle.BID;
    report.priority = {
      should: battle.inRange > 0 ? 'ATTACK' : 'MOVE',
      inRange: battle.inRange,
      enemies: battle.enemies,
    };
    await sleep(28000);
    report.lines = await page.evaluate(() => {
      const el = window.top.document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 40) : [];
    });
    report.after = await battleSnap(page);
    log('LOG', report.lines?.slice(0, 20));
  } else {
    report.lines = await page.evaluate(() => {
      const el = window.top.document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 25) : [];
    });
    log('no fight', report.lines?.slice(0, 12));
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  const mag = (report.books || []).find((b) => /magbook\.chtml/.test(b.url || ''));
  const lines = (report.lines || []).join('\n');
  report.verdict = {
    inBattle: !!report.battle?.BID,
    uiDefaultMbag: /mbag\.chtml/.test(report.uiMagic || ''),
    botUsesMagbook: String(report.botOpenUrl || '').includes('magbook.chtml'),
    magbookHasHelper: !!(mag && mag.helper),
    magbookHasCasts: !!(mag && mag.casts?.length),
    summonLogged: /помощник/i.test(lines),
    attackLogged: /Бой ход/i.test(lines),
    moveLogged: /сближение/i.test(lines),
    priorityRule: report.priority || null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
