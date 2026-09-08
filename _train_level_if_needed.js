/**
 * Check character level; if below target — farm XP via shadow fights.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  launchBrowser,
  ensureLoggedIn,
  getActFrame,
  saveState,
  log,
  sleep,
} from './src/browser.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET_LVL = Number(process.env.TARGET_LVL || 5); // большой лес с 5 lvl
const MAX_FIGHTS = Number(process.env.MAX_FIGHTS || 40);
const USER_ID = process.env.USER_ID || '960792';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) throw new Error('no d_act');
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = url;
  }, url);
  await sleep(2000);
}

async function actText(page) {
  return page.evaluate(() =>
    (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 4000)
  );
}

async function getLevel(page) {
  await goAct(page, `info.html?user=${USER_ID}`);
  const text = await actText(page);
  const html = await page.evaluate(
    () => document.getElementById('d_act')?.contentWindow?.document?.body?.innerHTML || ''
  );
  fs.writeFileSync(path.join(ROOT, '_tmp_info_level.html'), html.slice(0, 50000));

  // patterns: "Уровень: 4", "уровень 4", lvl in stats table
  let lvl = null;
  const patterns = [
    /уровень[:\s]*(\d+)/i,
    /level[:\s]*(\d+)/i,
    /(\d+)\s*ур\.?/i,
    /lvl[:\s]*(\d+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      lvl = Number(m[1]);
      break;
    }
  }
  // fallback: parse from HTML cells
  if (lvl == null) {
    const m2 = html.match(/уровен[^0-9]*(\d+)/i) || html.match(/>(\d+)<\/[^>]+>[^<]{0,30}опыт/i);
    if (m2) lvl = Number(m2[1]);
  }
  const expM = text.match(/опыт[:\s]*([\d.]+)/i);
  return {
    level: lvl,
    exp: expM ? Number(expM[1]) : null,
    snip: text.slice(0, 600),
  };
}

async function startShadowFight(page) {
  // Колизей → комната новичков → бой с тенью
  for (const room of ['arena_room_1.html', 'arenax.html', 'arena.html']) {
    await goAct(page, room);
    const started = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (!w?.document) return { err: 'no act' };
      const nodes = [...w.document.querySelectorAll('input,button,a,[onclick]')];
      for (const n of nodes) {
        const t = (n.value || '') + ' ' + (n.textContent || '') + ' ' + (n.getAttribute('onclick') || '');
        if (/тень|тенью|shadow|бой с тен/i.test(t)) {
          n.click();
          return { clicked: t.trim().slice(0, 100), href: w.location.href };
        }
      }
      // arenax: pick first room for low levels
      for (const n of nodes) {
        const onclick = n.getAttribute('onclick') || '';
        if (/arena_room_\d+/i.test(onclick)) {
          const m = onclick.match(/goR(?:C)?\(['"]([^'"]+)['"]\)/i);
          if (m) {
            if (typeof w.goRC === 'function') w.goRC(m[1]);
            else w.location.href = m[1];
            return { nav: m[1] };
          }
        }
      }
      return { none: true, text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 300) };
    });
    log('shadow try', room, started);
    await sleep(3500);
    if (started.nav) {
      // second pass: click shadow in room
      await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const btn = [...w.document.querySelectorAll('input,button')].find((b) =>
          /тень/i.test(b.value || b.textContent || '')
        );
        if (btn) btn.click();
      });
      await sleep(3500);
    }
    const frame = await getActFrame(page);
    if (await isBattleFrame(frame)) return frame;
  }
  return null;
}

const report = { target: TARGET_LVL, fights: [] };
const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  let stat = await getLevel(page);
  report.start = stat;
  log('LEVEL start', stat.level, 'exp', stat.exp, stat.snip?.slice(0, 120));

  if (stat.level == null) {
    log('Не удалось прочитать уровень — см. _tmp_info_level.html', 'err');
  } else if (stat.level >= TARGET_LVL) {
    log(`Уровень ${stat.level} >= ${TARGET_LVL} — качать не нужно`, 'ok');
    report.ok = true;
    report.skipped = true;
  } else {
    log(`Качаем ${stat.level} → ${TARGET_LVL} (тени в арене)…`);
    for (let i = 0; i < MAX_FIGHTS && (stat.level == null || stat.level < TARGET_LVL); i++) {
      const frame = await startShadowFight(page);
      if (!frame) {
        report.fights.push({ i, err: 'no battle started' });
        log('Бой не стартовал', 'err');
        await sleep(3000);
        continue;
      }
      log('FIGHT', i + 1, frame.url());
      const stop = { stopped: false };
      const t0 = Date.now();
      try {
        await runBattleLoop(frame, { stopSignal: stop, maxIdleMs: 120000 });
      } catch (e) {
        report.fights.push({ i, err: String(e.message || e), ms: Date.now() - t0 });
        log('battle', e.message || e, 'err');
      }
      await sleep(2500);
      stat = await getLevel(page);
      report.fights.push({ i, level: stat.level, exp: stat.exp, ms: Date.now() - t0 });
      log('after fight', i + 1, 'lvl', stat.level, 'exp', stat.exp);
      if (stat.level != null && stat.level >= TARGET_LVL) break;
    }
    report.end = stat;
    report.ok = stat.level != null && stat.level >= TARGET_LVL;
  }

  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  console.error(e);
} finally {
  fs.writeFileSync(path.join(ROOT, '_tmp_level_report.json'), JSON.stringify(report, null, 2));
  console.log('\nREPORT', JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}

process.exit(report.ok ? 0 : 2);
