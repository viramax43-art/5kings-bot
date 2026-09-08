import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();

// Force navigate d_act via top jQuery like the UI does
await page.evaluate(() => {
  const el = document.getElementById('d_act');
  if (el) el.src = 'arenax.html?xdac=' + Math.random();
});
await sleep(3000);

const info = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const doc = act?.document;
  if (!doc) return { err: 'no doc', href: elHref() };
  function elHref() {
    try {
      return act.location.href;
    } catch (e) {
      return String(e);
    }
  }
  const rows = [];
  // Parse table-like structure: text near arena_room links
  const html = doc.body.innerHTML;
  const re = /Для уровней:\s*([^<]+)|arena_room_(\d+)[^"']*|goR(?:C)?\(['"]([^'"]+)['"]\)/gi;
  let m;
  while ((m = re.exec(html))) {
    rows.push({ full: m[0], levels: m[1] || null, room: m[2] || null, go: m[3] || null });
  }
  const buttons = [...doc.querySelectorAll('input,button,a')].map((el) => ({
    value: (el.value || '').trim(),
    text: (el.textContent || '').trim().slice(0, 100),
    onclick: (el.getAttribute('onclick') || '').slice(0, 180),
  }));
  return {
    href: elHref(),
    text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2500),
    rows,
    buttons: buttons.filter((b) => /уров|комнат|arena|зал|начина|любой/i.test(JSON.stringify(b))),
    all: buttons.slice(0, 50),
  };
});
fs.writeFileSync('_tmp_arenax2.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));

// Click each level room and note title / shadow button presence
const rooms = (info.buttons || [])
  .map((b) => {
    const m = (b.onclick || '').match(/arena_room_\d[^'"]*/);
    return m ? m[0].replace(/\.html.*/, '') + '.html' : null;
  })
  .filter(Boolean);
const uniq = [...new Set(rooms)];
console.log('uniq rooms', uniq);

for (const room of uniq.slice(0, 12)) {
  await page.evaluate((u) => {
    document.getElementById('d_act').src = u + '?xdac=' + Math.random();
  }, room);
  await sleep(2000);
  const r = await page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    const t = (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400);
    const title = (act?.document?.title || '') + ' ' + ((act?.document?.getElementById && null) || '');
    const topTitle = (() => {
      try {
        return (window.top.document.getElementById('rollingscroll') || {}).textContent || '';
      } catch (e) {
        return '';
      }
    })();
    const shadow = [...(act?.document?.querySelectorAll('input,button') || [])].some((el) =>
      /тень|Shadow/i.test((el.value || '') + (el.getAttribute('onclick') || ''))
    );
    return { href: String(act?.location?.href || ''), t, topTitle, shadow };
  });
  console.log('\nROOM', room, JSON.stringify(r));
}

process.exit(0);
