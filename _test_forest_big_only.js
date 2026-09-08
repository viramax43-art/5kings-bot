/**
 * Big-forest only: create gate group → inject bot → start → verify ticks
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const gm = `
function GM_getValue(k,def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return {};
    const g = w.global_data && w.global_data.my_group;
    return {
      file: String(w.location.href || '').split('/').pop(),
      readyBig: !!(w.Client && g),
      bigApi: typeof w.StartDobycha === 'function',
      we: w.global_data && w.global_data.wait_event,
      my: g ? { x: g.posx, y: g.posy, stay: g.stay } : null,
      text: ((w.document.body && w.document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
}

const { browser, context, page } = await launchBrowser();
page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|Лес |Большой|СТАРТ|поиск|добыч|wait|шаг/i.test(t)) console.log('PAGE', t.slice(0, 220));
});
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

const report = {};
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  let s = await snap(page);
  log('start', s);
  if (!s.readyBig) {
    await goAct(page, 'gates.html');
    s = await snap(page);
    log('gates', s);
    const r = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const doc = w.document;
      // already in forest client?
      if (typeof w.StartDobycha === 'function') {
        w.location.href = 'newforest2.html';
        return { toNf: true };
      }
      const cancel = [...doc.querySelectorAll('input')].find((n) => /отозвать/i.test(n.value || ''));
      if (cancel) return { already: cancel.getAttribute('onclick') || cancel.value };
      const form = [...doc.forms].find((f) => /CreateGroup/i.test(f.innerHTML));
      if (!form) return { noForm: true, html: doc.body.innerHTML.slice(0, 500) };
      const ul = form.querySelector('[name=ulimit]');
      if (ul) ul.value = '1';
      const btn = form.querySelector('input[type=submit]');
      if (btn) {
        btn.click();
        return { clicked: btn.value };
      }
      form.submit();
      return { submitted: true };
    });
    log('create', r);
    await sleep(3000);
    for (let i = 0; i < 30; i++) {
      s = await snap(page);
      log('wait', i, s.file, s.readyBig, s.text?.slice(0, 100));
      if (s.readyBig) break;
      if (/newforest/i.test(s.file || '')) {
        await sleep(3000);
        s = await snap(page);
        if (s.readyBig) break;
      }
      await sleep(2500);
    }
  }

  report.enter = s;
  if (!s.readyBig) {
    report.ok = false;
    report.reason = 'enter failed';
  } else {
    const code =
      gm +
      '\n' +
      fs.readFileSync(USER_JS, 'utf8').replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
    await page.evaluate(() => {
      localStorage.setItem('K5BOT_run_forest', 'false');
      try {
        const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
        cfg.forest = Object.assign({}, cfg.forest, { equipTool: false, autoSearch: true, searchWaitMs: 5000 });
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
    await sleep(1500);
    await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
    await sleep(15000);
    const ui = await page.evaluate(() => {
      const doc = window.top.document;
      const logEl = doc.getElementById('k5-log');
      return {
        forestOn: !!(doc.getElementById('k5-forest-start') || {}).classList?.contains?.('on'),
        lines: logEl ? [...logEl.querySelectorAll('div')].map((d) => d.textContent).slice(0, 20) : [],
        status: (doc.getElementById('k5-status') || {}).textContent || '',
      };
    });
    s = await snap(page);
    const L = ui.lines.join('\n');
    report.bot = ui;
    report.after = s;
    report.ok =
      /СТАРТ v1\.2\.2.*BIG|Большой лес:/i.test(L) &&
      ui.forestOn &&
      s.readyBig &&
      /поиск|добыч|шаг|Событие wait|Я:/i.test(L);
    await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
  }

  await page.screenshot({ path: path.join(ROOT, '_tmp_forest_big_only.png') });
  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  console.error(e);
} finally {
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, '_tmp_forest_big_only.json'), JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
process.exit(report.ok ? 0 : 2);
