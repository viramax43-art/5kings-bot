/**
 * Reinstall 5Kings Bot into TM (after Allow User Scripts) and verify beacon.
 */
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const PORT = 9222;
const STATIC = 8765;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function probe(page) {
  return page.evaluate(() => {
    const topDoc = (() => {
      try {
        return window.top.document;
      } catch (e) {
        return document;
      }
    })();
    const beacon = topDoc.getElementById('k5-beacon');
    const panel = topDoc.getElementById('k5-panel');
    const dAct = document.getElementById('d_act');
    let actHref = null,
      cu = false,
      bots = 0,
      meName = null,
      uid = null;
    try {
      if (dAct && dAct.contentWindow) {
        const w = dAct.contentWindow;
        actHref = String(w.location.href || '');
        cu = !!w.cu;
        uid = w.cu && w.cu.UserID;
        if (cu && w.cu.bots) {
          bots = Object.keys(w.cu.bots).length;
          const me = w.cu.bots[uid];
          if (me) meName = me.n || me.name || me.N || null;
        }
      }
    } catch (e) {
      actHref = 'ERR ' + e.message;
    }
    return {
      url: location.href,
      hasBeacon: !!beacon,
      beaconText: beacon ? beacon.textContent : null,
      hasPanel: !!panel,
      panelHead: panel ? panel.innerText.replace(/\s+/g, ' ').slice(0, 240) : null,
      hasDact: !!dAct,
      actHref,
      cu,
      bots,
      meName,
      uid,
    };
  });
}

const body = fs.readFileSync(USER_JS);
const server = http.createServer((req, res) => {
  if ((req.url || '').includes('5kings-bot.user.js')) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return void res.end(body);
  }
  res.end('<a id="inst" href="/5kings-bot.user.js">Install</a>');
});
await new Promise((r) => server.listen(STATIC, '127.0.0.1', r));

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto(`http://127.0.0.1:${STATIC}/`, { waitUntil: 'domcontentloaded' });
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
  page.click('#inst'),
]);
await sleep(3000);
const inst = popup || page;
console.log('install url', inst.url());
const ui = await inst.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 500)
);
console.log('UI', ui);
await inst.screenshot({ path: path.join(ROOT, '_tmp_tm_install.png'), fullPage: true });

const clicked = await inst.evaluate(() => {
  const els = [...document.querySelectorAll('input, button, a')];
  const b = els.find((el) =>
    /install|update|reinstall|установ|обнов|переустан/i.test(
      `${el.textContent || ''} ${el.value || ''}`
    )
  );
  if (!b) return null;
  b.click();
  return (b.textContent || b.value || '').trim();
});
console.log('clicked', clicked);
await sleep(2500);

// Dashboard
await page.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
  waitUntil: 'domcontentloaded',
});
await sleep(2000);
const dash = await page.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 600)
);
console.log('DASH', dash);

let game = context.pages().find((p) => /5kings\.ru\/game/i.test(p.url()));
if (!game) {
  game = await context.newPage();
  await game.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
} else {
  await game.bringToFront();
}
await game.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
let g = await probe(game);
console.log('GAME1', JSON.stringify(g, null, 2));
await game.screenshot({ path: path.join(ROOT, '_tmp_tm_vira_final.png') });

await game.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(5000);
g = await probe(game);
console.log('FINAL', JSON.stringify(g, null, 2));

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      installed: /5Kings Bot/i.test(dash),
      beacon: g.hasBeacon,
      beaconText: g.beaconText,
      panel: g.hasPanel,
      dact: g.hasDact,
      cu: g.cu,
      me: g.meName,
    },
    null,
    2
  )
);

server.close();
process.exit(0);
