/**
 * Full live test: login → game.html → forest → inject TM bot v1.0.2 → start
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, openForest, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');

function stripHeader(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const gm = `
function GM_getValue(k, def) {
  try {
    const v = localStorage.getItem('TM_GM_' + k);
    if (v == null) return def;
    return JSON.parse(v);
  } catch (e) { return def; }
}
function GM_setValue(k, v) {
  try { localStorage.setItem('TM_GM_' + k, JSON.stringify(v)); } catch (e) {}
}
function GM_addStyle(css) {
  const s = document.createElement('style');
  s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
}
var unsafeWindow = window;
`;

async function inject(page) {
  const code = gm + '\n' + stripHeader(fs.readFileSync(USER_JS, 'utf8'));
  const out = [];
  for (const f of page.frames()) {
    try {
      out.push(
        await f.evaluate((src) => {
          try {
            eval(src);
            return {
              ok: true,
              href: location.href.slice(0, 80),
              panel: !!(window.top.document.getElementById('k5-panel')),
              ver: (window.top.document.querySelector('#k5-panel strong') || {}).textContent,
            };
          } catch (e) {
            return { ok: false, err: String(e.message || e), href: location.href.slice(0, 80) };
          }
        }, code)
      );
    } catch (e) {
      out.push({ ok: false, err: e.message });
    }
  }
  return out;
}

async function diag(page) {
  return page.evaluate(() => {
    const doc = window.top.document;
    const act = document.getElementById('d_act')?.contentWindow;
    return {
      url: location.href,
      panel: !!doc.getElementById('k5-panel'),
      status: doc.getElementById('k5-status')?.textContent,
      diag: doc.getElementById('k5-diag')?.textContent,
      dact: act ? act.location.href : null,
      cu: !!(act && act.cu && act.cu.send),
      gd: !!(act && act.gd),
    };
  });
}

const { browser, context, page } = await launchBrowser();
page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot/i.test(t)) console.log('PAGE', t);
});

try {
  await ensureLoggedIn(page, context);
  log('open forest…');
  await openForest(page);
  await sleep(3000);

  // wait cu
  for (let i = 0; i < 20; i++) {
    const frame = await getActFrame(page);
    const ok = await frame.evaluate(() => !!(window.cu && window.gd)).catch(() => false);
    log('cu wait', i, ok);
    if (ok) break;
    await sleep(1000);
  }

  const inj = await inject(page);
  console.log('inject', JSON.stringify(inj, null, 2));
  await sleep(1000);
  console.log('diag before', await diag(page));

  const click = await page.evaluate(() => {
    const b = window.top.document.getElementById('k5-forest-start');
    if (!b) return false;
    b.click();
    return true;
  });
  console.log('clicked start', click);
  await sleep(8000);
  const d2 = await diag(page);
  console.log('diag after', d2);
  console.log('url still game?', /game\.html/i.test(page.url()), page.url());

  await page.screenshot({ path: path.join(ROOT, '_tmp_tm_v102.png') });
  await saveState(context);

  if (!d2.panel) throw new Error('panel gone — navigation bug still present');
  if (!/game\.html/i.test(page.url()) && !d2.dact) throw new Error('left game shell');
  if (d2.status && /нет d_act|Откройте игру/i.test(d2.status) && !d2.cu) {
    console.log('WARN: start refused or waiting for forest character');
  }
  console.log('TEST RESULT: panel ok, shell preserved=', /game\.html/i.test(page.url()));
} catch (e) {
  console.error('FAIL', e);
  await page.screenshot({ path: path.join(ROOT, '_tmp_tm_fail.png') }).catch(() => {});
} finally {
  console.log('browser stays open 45s…');
  await sleep(45000);
  await browser.close();
}
