import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();

async function actEval(fn) {
  return page.evaluate((src) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) return { err: 'no act' };
    return new Function('act', 'return (' + src + ')(act)')(act);
  }, fn.toString());
}

// Leave battle / go city then colosseum
for (const u of ['combat.chtml', 'place.html', 'place_street_2.html', 'arenax.html']) {
  await page.evaluate((url) => {
    const act = document.getElementById('d_act')?.contentWindow;
    try {
      if (typeof act.goRC === 'function') act.goRC(url);
      else if (typeof act.goR === 'function') act.goR(url);
      else act.location.href = url;
    } catch (e) {
      try {
        document.getElementById('d_act').src = url;
      } catch (e2) {}
    }
  }, u);
  await sleep(2000);
  const href = await page.evaluate(() => {
    try {
      return document.getElementById('d_act').contentWindow.location.href;
    } catch (e) {
      return String(e);
    }
  });
  console.log('nav', u, '->', href);
}

await sleep(1500);
const map = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const doc = act?.document;
  if (!doc) return { err: 'no doc' };
  const html = doc.body.innerHTML;
  fsWrite = null;
  const items = [];
  // Each button with level label nearby
  const inputs = [...doc.querySelectorAll('input[type=button],input[type=submit],button,a')];
  for (const el of inputs) {
    const onclick = el.getAttribute('onclick') || '';
    const value = (el.value || el.textContent || '').trim();
    if (!/arena_room|arenax|уров/i.test(onclick + value)) continue;
    // walk up for surrounding text
    let node = el;
    let ctx = '';
    for (let i = 0; i < 6 && node; i++) {
      ctx = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').slice(0, 120);
      if (/уровн/i.test(ctx)) break;
      node = node.parentElement;
    }
    items.push({ value, onclick: onclick.slice(0, 200), ctx });
  }

  // Also regex parse full HTML in order
  const seq = [];
  const re = /Для уровней:\s*([0-9\-–—]+|любой)|goR(?:C)?\(['"](arena_room_[^'"]+)['"]\)|arena_room_(\d+)/gi;
  let m;
  let cur = null;
  while ((m = re.exec(html))) {
    if (m[1]) {
      cur = { levels: m[1].replace(/[–—]/g, '-').trim(), rooms: [] };
      seq.push(cur);
    } else if (cur) {
      const room = m[2] || 'arena_room_' + m[3] + '.html';
      if (!cur.rooms.includes(room)) cur.rooms.push(room);
    }
  }

  return {
    href: String(act.location.href),
    text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2000),
    items,
    seq,
  };
});

fs.writeFileSync('_tmp_arenax_map.json', JSON.stringify(map, null, 2));
console.log(JSON.stringify(map, null, 2));

// Character level
const lvl = await page.evaluate(() => {
  const outs = {};
  try {
    const pers = document.getElementById('d_pers')?.contentWindow;
    outs.nd = pers?.nd ? { lvl: pers.nd.lvl, nk: pers.nd.nk } : null;
    outs.persText = (pers?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 80);
  } catch (e) {}
  try {
    const ul = document.getElementById('d_ulist')?.contentWindow?.document?.body?.innerText || '';
    const m = ul.match(/Игрок121323323\s+(\d+)/) || ul.match(/Hm\s+\S+\s+(\d+)/);
    outs.ulLvl = m && Number(m[1]);
    outs.ul = ul.replace(/\s+/g, ' ').slice(0, 200);
  } catch (e) {}
  return outs;
});
console.log('LVL', lvl);
process.exit(0);
