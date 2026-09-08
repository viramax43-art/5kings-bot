import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(ROOT, '.auth', 'storage-state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: fs.existsSync(STATE) ? STATE : undefined,
  locale: 'ru-RU',
});
const page = await context.newPage();
await page.goto('https://5kings.ru/arenax.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
const html = await page.content();
fs.writeFileSync('_tmp_arenax_fetch.html', html);
const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 3000));
console.log('TEXT', text);

const parsed = await page.evaluate(() => {
  const out = [];
  const html = document.body.innerHTML;
  // Split by level labels and nearby goRC
  const blocks = html.split(/(?=Для уровней)/i);
  for (const b of blocks) {
    if (!/Для уровней/i.test(b)) continue;
    const lm = b.match(/Для уровней:\s*([^<\n]+)/i);
    const rooms = [...b.matchAll(/arena_room_(\d+)[^"']*/gi)].map((x) => x[0]);
    const gos = [...b.matchAll(/goR(?:C)?\(['"]([^'"]+)['"]\)/gi)].map((x) => x[1]);
    const vals = [...b.matchAll(/value=["']([^"']+)["']/gi)].map((x) => x[1]).slice(0, 8);
    out.push({
      levels: lm ? lm[1].trim() : null,
      rooms: [...new Set(rooms)].slice(0, 5),
      gos: [...new Set(gos)].slice(0, 8),
      vals,
      snip: b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200),
    });
  }
  return out;
});
console.log('PARSED', JSON.stringify(parsed, null, 2));

// Also try game.html path after login
await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(4000);
await page.evaluate(() => {
  const el = document.getElementById('d_act');
  if (el) el.src = 'arenax.html?xdac=' + Math.random();
});
await sleep(3000);
const inGame = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  if (!act?.document) return { err: 'no act' };
  const html = act.document.body.innerHTML;
  const blocks = html.split(/(?=Для уровней)/i);
  const out = [];
  for (const b of blocks) {
    if (!/Для уровней/i.test(b)) continue;
    const lm = b.match(/Для уровней:\s*([^<\n]+)/i);
    const rooms = [...b.matchAll(/arena_room_\d+[^"']*/gi)].map((x) => x[0]);
    const gos = [...b.matchAll(/goR(?:C)?\(['"]([^'"]+)['"]\)/gi)].map((x) => x[1]);
    out.push({ levels: lm && lm[1].trim(), rooms: [...new Set(rooms)], gos: [...new Set(gos)].slice(0, 10) });
  }
  return {
    href: String(act.location.href),
    text: (act.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1500),
    out,
  };
});
fs.writeFileSync('_tmp_arenax_ingame.json', JSON.stringify(inGame, null, 2));
console.log('INGAME', JSON.stringify(inGame, null, 2));

await browser.close();
process.exit(0);
