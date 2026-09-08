import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');

function stripHeader(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const gm = `
window.__GM_STORE = window.__GM_STORE || {};
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

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0] || (await browser.newContext());
let page = context.pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
if (!page) page = context.pages().find((p) => /5kings\.ru/i.test(p.url())) || context.pages()[0];
console.log('Attached to', page.url());

page.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|ReferenceError|TypeError|k5-/i.test(t)) console.log('CONSOLE:', t);
});

// Wait for d_act
for (let i = 0; i < 30; i++) {
  const ready = await page.evaluate(() => {
    const el = document.getElementById('d_act');
    return {
      hasDact: !!el,
      frames: window.frames.length,
      href: el && el.contentWindow ? el.contentWindow.location.href : null,
      text: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
  console.log('wait', i, ready);
  if (ready.hasDact) break;
  await page.waitForTimeout(1000);
}

const structure = await page.evaluate(() => ({
  url: location.href,
  iframes: [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, name: f.name, src: (f.src || '').slice(0, 120) })),
  framesLen: window.frames.length,
}));
console.log('structure', JSON.stringify(structure, null, 2));

// Open forest in d_act
const opened = await page.evaluate(() => {
  const el = document.getElementById('d_act');
  if (!el || !el.contentWindow) return { ok: false, why: 'no d_act' };
  const w = el.contentWindow;
  try {
    if (typeof w.goR === 'function') w.goR('forest.html');
    else if (typeof w.goRC === 'function') w.goRC('forest.html');
    else w.location.href = 'forest.html';
    return { ok: true };
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
});
console.log('open forest', opened);
await page.waitForTimeout(4000);

// wait cu
let cuOk = false;
for (let i = 0; i < 25; i++) {
  const st = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no win' };
    return {
      href: w.location.href,
      cu: !!(w.cu && w.cu.send),
      gd: !!w.gd,
      bots: w.gd && w.gd.bots ? (Array.isArray(w.gd.bots) ? w.gd.bots.length : Object.keys(w.gd.bots).length) : 0,
      add: w.gd && w.gd.add_items ? w.gd.add_items.length : 0,
    };
  });
  console.log('cu', i, st);
  if (st.cu) {
    cuOk = true;
    break;
  }
  await page.waitForTimeout(1000);
}

const code = gm + '\n' + stripHeader(fs.readFileSync(USER_JS, 'utf8'));

// Inject into top + all frames
async function injectAll() {
  const out = [];
  for (const f of page.frames()) {
    try {
      const r = await f.evaluate((src) => {
        try {
          eval(src);
          const topDoc = window.top.document;
          return {
            ok: true,
            href: location.href,
            name: window.name,
            panelTop: !!topDoc.getElementById('k5-panel'),
            cu: !!(window.cu && window.cu.send),
          };
        } catch (e) {
          return { ok: false, err: String(e && e.stack ? e.stack : e), href: location.href };
        }
      }, code);
      out.push(r);
    } catch (e) {
      out.push({ ok: false, err: e.message, href: f.url() });
    }
  }
  return out;
}

let inj = await injectAll();
console.log('inject1', JSON.stringify(inj, null, 2));
await page.waitForTimeout(1500);

const diag = async () =>
  page.evaluate(() => {
    const doc = window.top.document;
    const panel = doc.getElementById('k5-panel');
    const dact = document.getElementById('d_act')?.contentWindow;
    return {
      panel: !!panel,
      status: doc.getElementById('k5-status')?.textContent || null,
      diag: doc.getElementById('k5-diag')?.textContent || null,
      dactCu: !!(dact && dact.cu && dact.cu.send),
      dactHref: dact ? dact.location.href : null,
      topHref: location.href,
    };
  });

console.log('diag1', await diag());

// Click start
const click = await page.evaluate(() => {
  const btn = window.top.document.getElementById('k5-forest-start');
  if (!btn) return { ok: false };
  btn.click();
  return { ok: true };
});
console.log('click', click);
await page.waitForTimeout(6000);
console.log('diag2', await diag());

// Check if top navigated away (bug)
console.log('still game?', page.url());

await page.screenshot({ path: path.join(ROOT, '_tmp_tm_test.png') });
console.log('screenshot ok, cuOk=', cuOk);
// leave browser attached
await browser.close(); // disconnect only
console.log('done');
