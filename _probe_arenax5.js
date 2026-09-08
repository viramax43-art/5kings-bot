import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();
await page.evaluate(() => {
  document.getElementById('d_act').contentWindow.goRC('arenax.html');
});
await sleep(2500);
const html = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.body.innerHTML
);
fs.writeFileSync('_tmp_arenax_live.html', html);
console.log('len', html.length);

const rooms = [...html.matchAll(/goR(?:C)?\(['"]([^'"]*arena[^'"]*)['"]\)/gi)].map((m) => m[1]);
console.log('goRC', rooms);

const parts = html.split(/(?=Для уровней)/i);
for (const p of parts) {
  if (!/Для уровней/i.test(p)) continue;
  const lm = p.match(/Для уровней:\s*([^<]+)/i);
  const gos = [...p.matchAll(/goR(?:C)?\(['"]([^'"]+)['"]\)/gi)].map((m) => m[1]);
  const vals = [...p.matchAll(/value=['"]([^'"]+)['"]/gi)].map((m) => m[1]);
  console.log('---', lm && lm[1].trim(), 'gos', gos, 'vals', vals.slice(0, 8));
}
process.exit(0);
