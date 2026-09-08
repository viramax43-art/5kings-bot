/**
 * Enable TM "Allow User Scripts", install 5kings-bot via TM UI,
 * open a FRESH game tab (no Playwright inject) and verify beacon.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const STATIC = 8766;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startServer() {
  const body = fs.readFileSync(USER_JS);
  const server = http.createServer((req, res) => {
    if ((req.url || '').includes('5kings-bot.user.js')) {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      return void res.end(body);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<a id="inst" href="/5kings-bot.user.js">Install 5Kings Bot</a>'
    );
  });
  return new Promise((r) => server.listen(STATIC, '127.0.0.1', () => r(server)));
}

async function enableDevAndUserScripts(page) {
  await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
  await sleep(2000);

  const step1 = await page.evaluate(() => {
    const out = { steps: [] };
    const mgr = document.querySelector('extensions-manager');
    if (!mgr?.shadowRoot) return { error: 'no manager' };
    const toolbar = mgr.shadowRoot.querySelector('extensions-toolbar');
    if (toolbar?.shadowRoot) {
      const dev = toolbar.shadowRoot.querySelector('#devMode');
      if (dev && !dev.checked) {
        dev.click();
        out.steps.push('devMode on');
      } else {
        out.steps.push(dev ? 'devMode already' : 'no devMode');
      }
    }
    return out;
  });
  console.log('devMode', step1);
  await sleep(1000);

  await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.screenshot({ path: path.join(ROOT, '_tmp_tm_details.png'), fullPage: true });

  const toggle = await page.evaluate(() => {
    const out = { clicked: false, already: false, found: [] };
    const mgr = document.querySelector('extensions-manager');
    const detail = mgr?.shadowRoot?.querySelector('extensions-detail-view');
    if (!detail?.shadowRoot) return { error: 'no detail', mgr: !!mgr };
    out.text = (detail.shadowRoot.textContent || '').replace(/\s+/g, ' ').slice(0, 900);

    const walk = (root, depth) => {
      if (!root || depth > 6) return;
      const nodes = root.querySelectorAll ? [...root.querySelectorAll('*')] : [];
      for (const el of nodes) {
        const id = el.id || '';
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          /allow-user-scripts|allowUserScripts/i.test(id) ||
          (/userscript|user scripts|пользовательск/i.test(txt) && txt.length < 80)
        ) {
          out.found.push({ tag: el.tagName, id, txt: txt.slice(0, 80) });
        }
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      }
    };
    walk(detail.shadowRoot, 0);

    const row =
      detail.shadowRoot.querySelector('#allow-user-scripts') ||
      detail.shadowRoot.querySelector('[id*="user-script"]') ||
      detail.shadowRoot.querySelector('[id*="userscript"]');
    if (row) {
      out.rowId = row.id;
      const cr =
        row.shadowRoot?.querySelector('cr-toggle') ||
        row.querySelector('cr-toggle');
      if (cr) {
        out.checked = !!cr.checked;
        if (!cr.checked) {
          cr.click();
          out.clicked = true;
        } else {
          out.already = true;
        }
      } else {
        row.click();
        out.clickedHost = true;
      }
    }
    return out;
  });
  console.log('allowUserScripts', JSON.stringify(toggle, null, 2));
  await sleep(800);
  await page.screenshot({ path: path.join(ROOT, '_tmp_tm_details2.png'), fullPage: true });
  return toggle;
}

async function installViaTm(context, page) {
  await page.goto(`http://127.0.0.1:${STATIC}/`, { waitUntil: 'domcontentloaded' });
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
    page.click('#inst'),
  ]);
  await sleep(3000);
  const inst = popup || page;
  console.log('install url', inst.url());
  const ui = await inst.evaluate(() =>
    ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 800)
  );
  console.log('install UI', ui);
  await inst.screenshot({ path: path.join(ROOT, '_tmp_tm_install_ui.png'), fullPage: true });

  const clicked = await inst.evaluate(() => {
    const els = [...document.querySelectorAll('input, button, a, [role="button"]')];
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
}

async function dashboard(page) {
  await page.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await sleep(2500);
  const text = await page.evaluate(() =>
    ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 1200)
  );
  console.log('DASH', text);
  await page.screenshot({ path: path.join(ROOT, '_tmp_tm_dash_now.png'), fullPage: true });
  return text;
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
    return {
      url: location.href,
      beacon: !!topDoc.getElementById('k5-beacon'),
      beaconText: topDoc.getElementById('k5-beacon')?.textContent || null,
      panel: !!topDoc.getElementById('k5-panel'),
      dact: !!document.getElementById('d_act'),
    };
  });
}

const server = await startServer();
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

const toggle = await enableDevAndUserScripts(page);
const dashBefore = await dashboard(page);
await installViaTm(context, page);
const dashAfter = await dashboard(page);

// FRESH tab — no Playwright addInitScript from earlier pages
const game = await context.newPage();
const cons = [];
game.on('console', (m) => {
  const t = m.text();
  if (/5k-bot|k5-|Tamper|ReferenceError|SyntaxError/i.test(t)) cons.push(t.slice(0, 200));
});
await game.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(7000);
let g = await probe(game);
console.log('FRESH1', g);
await game.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
g = await probe(game);
console.log('FRESH2', g);
console.log('CONS', cons);
await game.screenshot({ path: path.join(ROOT, '_tmp_tm_fresh.png') });

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      toggle,
      warningGone: !/Разрешить пользовательские|Allow User Scripts|userscript/i.test(dashAfter),
      installed: /5Kings Bot/i.test(dashAfter),
      dashAfter: dashAfter.slice(0, 400),
      beacon: g.beacon,
      panel: g.panel,
      dact: g.dact,
    },
    null,
    2
  )
);

server.close();
process.exit(0);
