import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(ROOT, '.auth', 'storage-state.json');

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({
  storageState: fs.existsSync(STATE) ? STATE : undefined,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();
await page.goto('https://5kings.ru/m.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const iframes = [...document.querySelectorAll('iframe')].map((f) => ({
    id: f.id,
    name: f.name,
    src: f.src,
    w: f.offsetWidth,
    h: f.offsetHeight,
  }));
  let dAct = null;
  try {
    const el = document.getElementById('d_act');
    const win = el && el.contentWindow;
    dAct = {
      exists: !!el,
      href: win ? win.location.href : null,
      cu: !!(win && win.cu),
      gd: !!(win && win.gd),
      keys: win ? Object.keys(win).filter((k) => /cu|gd|f3|goR/i.test(k)).slice(0, 30) : [],
    };
  } catch (e) {
    dAct = { err: String(e.message || e) };
  }
  return {
    url: location.href,
    title: document.title,
    framesLen: window.frames.length,
    frameNames: [...Array(window.frames.length)].map((_, i) => {
      try {
        return window.frames[i].name || window.frames[i].location.href;
      } catch (e) {
        return 'err';
      }
    }),
    iframes,
    dAct,
    bodySample: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
  };
});
console.log(JSON.stringify(info, null, 2));

// try open forest via goR inside d_act
const go = await page.evaluate(() => {
  const el = document.getElementById('d_act');
  if (!el || !el.contentWindow) return { ok: false, why: 'no el' };
  const w = el.contentWindow;
  try {
    if (typeof w.goR === 'function') {
      w.goR('forest.html');
      return { ok: true, via: 'goR' };
    }
    w.location.href = 'forest.html';
    return { ok: true, via: 'location' };
  } catch (e) {
    return { ok: false, why: String(e.message || e) };
  }
});
console.log('go forest', go);
await page.waitForTimeout(5000);

const after = await page.evaluate(() => {
  const el = document.getElementById('d_act');
  const w = el && el.contentWindow;
  let cuWait = { href: null, cu: false, gd: false, readyState: null };
  try {
    cuWait = {
      href: w.location.href,
      cu: !!(w.cu && w.cu.send),
      gd: !!w.gd,
      readyState: w.document.readyState,
      hasCanvas: !!w.document.getElementById('canvas'),
    };
  } catch (e) {
    cuWait = { err: String(e.message || e) };
  }
  return { top: location.href, dAct: cuWait };
});
console.log('after', JSON.stringify(after, null, 2));

// wait up to 20s for cu
for (let i = 0; i < 20; i++) {
  const st = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return null;
    return { cu: !!(w.cu && w.cu.send), gd: !!w.gd, href: w.location.href };
  });
  console.log('t+' + i, st);
  if (st && st.cu) break;
  await page.waitForTimeout(1000);
}

await page.waitForTimeout(5000);
await browser.close();
