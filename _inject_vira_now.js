import fs from 'fs';
import { chromium } from 'playwright';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const USER_JS = 'tampermonkey/5kings-bot.user.js';
const code = fs
  .readFileSync(USER_JS, 'utf8')
  .replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages().find((p) => /5kings\.ru\/game/i.test(p.url())) || context.pages()[0];

await page.addInitScript(code);
const results = [];
for (const f of page.frames()) {
  try {
    results.push(
      await f.evaluate((src) => {
        try {
          eval(src);
          const topDoc = (() => {
            try {
              return window.top.document;
            } catch (e) {
              return document;
            }
          })();
          return {
            ok: true,
            href: location.href.slice(0, 80),
            beacon: !!topDoc.getElementById('k5-beacon'),
            panel: !!topDoc.getElementById('k5-panel'),
          };
        } catch (e) {
          return { ok: false, err: String(e.message || e), href: location.href.slice(0, 80) };
        }
      }, code)
    );
  } catch (e) {
    results.push({ ok: false, err: String(e.message || e) });
  }
}
console.log('INJECT', JSON.stringify(results, null, 2));
await sleep(2500);

const g = await page.evaluate(() => {
  const topDoc = window.top.document;
  const beacon = topDoc.getElementById('k5-beacon');
  const panel = topDoc.getElementById('k5-panel');
  let me = null,
    uid = null,
    actHref = null,
    cu = false;
  try {
    const w = document.getElementById('d_act')?.contentWindow;
    if (w) {
      actHref = String(w.location.href || '');
      cu = !!w.cu;
      uid = w.cu && w.cu.UserID;
      const bot = w.cu && w.cu.bots && w.cu.bots[uid];
      if (bot) me = bot.n || bot.name || bot.N || null;
    }
  } catch (e) {
    actHref = 'ERR ' + e.message;
  }
  return {
    url: location.href,
    hasBeacon: !!beacon,
    beaconText: beacon ? beacon.textContent : null,
    hasPanel: !!panel,
    hasDact: !!document.getElementById('d_act'),
    actHref,
    cu,
    uid,
    me,
  };
});
console.log('FINAL', g);
await page.bringToFront();
await page.screenshot({ path: '_tmp_vira_ready.png' });
process.exit(0);
