/**
 * Diagnose bag/money, try forest ore craft error, earn silver via step-on gather,
 * then buy Рудокоп if possible.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
await page.bringToFront();

async function go(u) {
  await page.evaluate((url) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(url);
    else if (typeof act.goR === 'function') act.goR(url);
    else act.location.href = url;
  }, u);
  await sleep(2000);
}

async function text() {
  return page.evaluate(() =>
    (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 2500)
  );
}

async function href() {
  return page.evaluate(() => String(document.getElementById('d_act')?.contentWindow?.location?.href || ''));
}

// Pers panel clicks / bag links
const persUi = await page.evaluate(() => {
  const w = document.getElementById('d_pers')?.contentWindow;
  if (!w?.document) return { err: 'no pers' };
  const html = w.document.body.innerHTML.slice(0, 15000);
  const clicks = [...w.document.querySelectorAll('[onclick],a,area')]
    .map((el) => ({
      onclick: (el.getAttribute('onclick') || '').slice(0, 150),
      href: el.getAttribute('href') || '',
      title: el.title || '',
      alt: el.alt || '',
      text: (el.textContent || '').trim().slice(0, 40),
    }))
    .filter((x) => /bag|sumk|инвент|вещ|param|info|abil|user|goR|goRC|top\.|parent/i.test(JSON.stringify(x)));
  return { clicks: clicks.slice(0, 40), text: w.document.body.innerText.replace(/\s+/g, ' ').slice(0, 300) };
});
console.log('PERS UI', JSON.stringify(persUi, null, 2));

// Common bag entry points used by apeha-family
for (const u of [
  'bag.html',
  'bag_type_0.html',
  'bag_type_1.html',
  'bag_type_12.html',
  'bag_type_17.html',
  'inv.html',
  'inventory.html',
  'um.html',
  'um_type_1.html',
]) {
  await go(u);
  console.log(u, '->', await href(), (await text()).slice(0, 200));
}

// Enter forest and inspect ore cells + try craft
await go('forest.html');
await sleep(4000);
const forest = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (!w) return { err: 'no act' };
  const out = {
    href: String(w.location.href),
    cu: !!w.cu,
    uid: w.cu?.UserID,
    bots: w.cu?.bots ? Object.keys(w.cu.bots).length : 0,
    add: 0,
    ores: [],
    me: null,
    txt: null,
    buttons: [],
  };
  try {
    if (w.cu?.bots && w.cu.UserID) {
      const me = w.cu.bots[w.cu.UserID];
      if (me) out.me = { x: me.x ?? me.pos_x, y: me.y ?? me.pos_y, n: me.n || me.name };
    }
    const add = w.cu?.gd?.add_items || w.gd?.add_items || [];
    out.add = add.length;
    out.ores = add
      .filter((it) => {
        const t = it.imgType ?? it.t ?? it.type;
        return t >= 7 && t <= 18;
      })
      .slice(0, 15)
      .map((it) => ({
        abs: it.abs_pos ?? it.abs,
        t: it.imgType ?? it.t,
        x: it.pos_x ?? it.x,
        y: it.pos_y ?? it.y,
      }));
    out.buttons = [...w.document.querySelectorAll('input,button')]
      .map((b) => b.value || b.textContent)
      .filter(Boolean)
      .slice(0, 30);
    out.txt = w.cu?.lastTxt || null;
  } catch (e) {
    out.err = String(e);
  }
  return out;
});
console.log('FOREST', JSON.stringify(forest, null, 2));

// Try StartCraft on first ore if any
if (forest.ores?.length) {
  const abs = forest.ores[0].abs;
  const craft = await page.evaluate(async (absPos) => {
    const w = document.getElementById('d_act')?.contentWindow;
    const msgs = [];
    const old = w.cu?.send;
    // hook texts via existing listener if any
    if (typeof w.cu?.send === 'function') {
      w.cu.send('actHunter-StartCraft=' + absPos);
    } else if (w.cu?.ws) {
      // fallback
    }
    await new Promise((r) => setTimeout(r, 2500));
    return {
      txt: w.cu?.txt || w.__lastTxt || null,
      craftBusy: !!w.__k5bot_craftBusy,
      body: (w.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
    };
  }, abs);
  console.log('CRAFT TRY', craft);
}

// Fetch lib about rudokop license requirements
await go('lib.shtml?id=28');
console.log('LIB28', (await text()).slice(0, 1500));
await go('lib.shtml?id=52');
const t52 = await text();
const i = t52.indexOf('Рудокоп');
console.log('LIB52 rudokop section', t52.slice(Math.max(0, i - 50), i + 600));

process.exit(0);
