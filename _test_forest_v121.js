/**
 * Clean forest smoke: exit big → city refuse → re-enter big → start works
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

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
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
  await sleep(1600);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no' };
    let city = false;
    try {
      for (const n of w.document.querySelectorAll('input,button,a,[onclick]')) {
        const t = (n.value || '') + (n.textContent || '') + (n.getAttribute('onclick') || '');
        if (/place_street_|на улицу/i.test(t)) {
          city = true;
          break;
        }
      }
    } catch (e) {}
    const g = w.global_data && w.global_data.my_group;
    return {
      file: String(w.location.href || '').split('/').pop(),
      cu: !!(w.cu && w.gd),
      bigApi: typeof w.StartDobycha === 'function' && !!(w.Client && w.Client.send),
      readyBig: !!(w.Client && w.global_data && w.global_data.my_group),
      we: w.global_data && w.global_data.wait_event,
      city,
      my: g ? { x: g.posx, y: g.posy } : null,
      text: ((w.document.body && w.document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 180),
    };
  });
}

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    try {
      const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
      cfg.forest = Object.assign({}, cfg.forest, { equipTool: false, autoSearch: true, searchWaitMs: 6000 });
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
  await sleep(800);
  return page.evaluate(() => !!window.top.document.getElementById('k5-panel'));
}

async function ui(page) {
  return page.evaluate(() => {
    const doc = window.top.document;
    const logEl = doc.getElementById('k5-log');
    return {
      forestOn: !!(doc.getElementById('k5-forest-start') || {}).classList?.contains?.('on'),
      lines: logEl ? [...logEl.querySelectorAll('div')].map((d) => d.textContent).slice(0, 20) : [],
      status: (doc.getElementById('k5-status') || {}).textContent || '',
    };
  });
}

async function click(page, id) {
  return page.evaluate((i) => {
    const b = window.top.document.getElementById(i);
    if (b) b.click();
    return !!b;
  }, id);
}

async function leaveBig(page) {
  for (let i = 0; i < 25; i++) {
    const s = await snap(page);
    log('leave', i, s.file, 'readyBig', s.readyBig, 'we', s.we);
    if (!s.readyBig && !s.bigApi) return true;
    if (s.we === 1) {
      await sleep(3000);
      continue;
    }
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        w.Client.send('actNewMaps-ReturnToTown=1');
      } catch (e) {}
    });
    await sleep(4000);
  }
  return false;
}

async function enterBig(page) {
  let s = await snap(page);
  if (s.readyBig) return s;

  // Если сессия большого леса ещё жива — сразу newforest2
  await goAct(page, 'newforest2.html');
  await sleep(4000);
  s = await snap(page);
  if (s.readyBig) return s;

  await goAct(page, 'gates.html');
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w?.document;
    if (!doc) return;
    const cancel = [...doc.querySelectorAll('input')].find((n) => /отозвать/i.test(n.value || ''));
    if (cancel) {
      cancel.click();
      return;
    }
    // если уже UI леса (смена вида) — POST на newforest2
    if (doc.querySelector('[name="actNewMaps-ChangeView"]')) {
      const f = doc.forms[0];
      if (f) f.submit();
      return;
    }
    const ul = doc.querySelector('[name=ulimit]');
    if (ul) ul.value = '1';
    const btn = [...doc.querySelectorAll('input[type=submit]')].find((n) =>
      /подать|заявк/i.test(n.value || '')
    );
    if (btn) btn.click();
    else if (doc.forms[0]) doc.forms[0].submit();
  });
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    s = await snap(page);
    log('enter', i, s.file, s.readyBig, s.bigApi, s.my);
    if (s.readyBig) return s;
    if (s.bigApi && !s.readyBig) {
      await goAct(page, 'newforest2.html');
      await sleep(3000);
      s = await snap(page);
      if (s.readyBig) return s;
    }
  }
  return s;
}

const report = {};
const { browser, context, page } = await launchBrowser();
page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|Лес |Большой|город|СТАРТ|поиск|добыч|wait/i.test(t)) console.log('PAGE', t.slice(0, 200));
});
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  log('=== leave big if needed ===');
  await leaveBig(page);
  await goAct(page, 'place.html');
  await sleep(2000);

  log('=== CITY ===');
  await goAct(page, 'forest.html');
  await sleep(3500);
  let s = await snap(page);
  log('city snap', s);
  await inject(page);
  await click(page, 'k5-forest-start');
  await sleep(5000);
  let u = await ui(page);
  report.city = {
    snap: s,
    forestOn: u.forestOn,
    refused: /городской/i.test(u.lines.join('\n')),
    lines: u.lines.slice(0, 8),
  };
  report.city.ok = !!(report.city.refused && !report.city.forestOn && (s.city || s.cu));
  await click(page, 'k5-forest-stop');
  log('city report', report.city);

  log('=== BIG ===');
  s = await enterBig(page);
  report.enter = s;
  if (!s.readyBig) {
    report.big = { ok: false, reason: 'enter failed', s };
  } else {
    if (!(await page.evaluate(() => !!window.top.document.getElementById('k5-panel')))) await inject(page);
    await click(page, 'k5-forest-start');
    await sleep(14000);
    u = await ui(page);
    s = await snap(page);
    const L = u.lines.join('\n');
    report.big = {
      ok: /СТАРТ v1\.2\.2.*BIG|Большой лес:/i.test(L) && u.forestOn && s.readyBig,
      forestOn: u.forestOn,
      activity: /поиск|добыч|шаг|Событие wait/i.test(L),
      snap: s,
      lines: u.lines.slice(0, 12),
    };
    await click(page, 'k5-forest-stop');
  }

  await page.screenshot({ path: path.join(ROOT, '_tmp_forest_final.png') });
  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  console.error(e);
} finally {
  fs.writeFileSync(path.join(ROOT, '_tmp_forest_v122.json'), JSON.stringify(report, null, 2));
  console.log('\nREPORT\n', JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}

process.exit(report.city?.ok && report.big?.ok ? 0 : 2);
