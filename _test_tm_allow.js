/**
 * Enable Chrome "Allow User Scripts" for Tampermonkey in .chrome-vira,
 * confirm install, reload game, verify beacon.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TM_ID = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
const PORT = 9222;

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
      snip: ((topDoc.body && topDoc.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 200),
    };
  });
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
const page = await context.newPage();

// Open extension details
const detailsUrl = `chrome://extensions/?id=${TM_ID}`;
await page.goto(detailsUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
await sleep(2000);

// Try enable developer mode + allow user scripts via shadow DOM
const result = await page.evaluate(async (extId) => {
  const out = { steps: [] };
  const mgr = document.querySelector('extensions-manager');
  if (!mgr || !mgr.shadowRoot) {
    out.error = 'no extensions-manager';
    out.body = (document.body && document.body.innerText || '').slice(0, 200);
    return out;
  }

  // Enable developer mode
  const toolbar = mgr.shadowRoot.querySelector('extensions-toolbar');
  if (toolbar && toolbar.shadowRoot) {
    const devToggle = toolbar.shadowRoot.querySelector('#devMode');
    if (devToggle && !devToggle.checked) {
      devToggle.click();
      out.steps.push('devMode clicked');
    } else {
      out.steps.push('devMode already on or missing');
    }
  }

  // Navigate to details view via sidebar or item
  // Prefer manager.delegate or clicking the extension card
  const itemList = mgr.shadowRoot.querySelector('extensions-item-list');
  if (itemList && itemList.shadowRoot) {
    const items = [...itemList.shadowRoot.querySelectorAll('extensions-item')];
    out.steps.push('items=' + items.length);
    for (const item of items) {
      const id = item.getAttribute('id') || item.id;
      out.steps.push('item:' + id);
      if (id === extId || (item.shadowRoot && item.shadowRoot.textContent.includes('Tampermonkey'))) {
        const detailsBtn =
          item.shadowRoot.querySelector('#detailsButton') ||
          item.shadowRoot.querySelector('a#details') ||
          item.shadowRoot.querySelector('#details');
        if (detailsBtn) {
          detailsBtn.click();
          out.steps.push('opened details');
        }
      }
    }
  }

  return out;
}, TM_ID);

console.log('enable step1', result);
await sleep(2000);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_allow1.png'), fullPage: true });

// Direct details page
await page.goto(`chrome://extensions/?id=${TM_ID}`, { waitUntil: 'domcontentloaded' });
await sleep(2500);

const toggled = await page.evaluate((extId) => {
  const out = { found: [], clicked: false, text: '' };
  const mgr = document.querySelector('extensions-manager');
  if (!mgr?.shadowRoot) return { error: 'no mgr' };

  // details view
  const detail = mgr.shadowRoot.querySelector('extensions-detail-view');
  if (detail?.shadowRoot) {
    out.text = detail.shadowRoot.textContent.replace(/\s+/g, ' ').slice(0, 800);
    // Look for allow-user-scripts toggle
    const toggles = [...detail.shadowRoot.querySelectorAll('cr-toggle, extensions-toggle-row, #allow-user-scripts, #allowUserScripts')];
    out.found = toggles.map((t) => ({
      id: t.id,
      tag: t.tagName,
      text: (t.textContent || '').replace(/\s+/g, ' ').slice(0, 80),
      checked: t.checked,
    }));

    // Walk all cr-toggle in shadow
    const all = detail.shadowRoot.querySelectorAll('*');
    for (const el of all) {
      const t = (el.textContent || '').replace(/\s+/g, ' ');
      if (/пользовательск|user scripts|Allow User Scripts/i.test(t) && t.length < 120) {
        out.near = t.slice(0, 120);
        const row = el.closest('extensions-toggle-row') || el;
        const toggle =
          (row.shadowRoot && row.shadowRoot.querySelector('cr-toggle')) ||
          row.querySelector('cr-toggle') ||
          el.querySelector?.('cr-toggle');
        // extensions-toggle-row hosts cr-toggle in light or shadow
        const host = el.tagName === 'EXTENSIONS-TOGGLE-ROW' ? el : el.closest('extensions-toggle-row');
        if (host) {
          const cr =
            host.shadowRoot?.querySelector('cr-toggle') ||
            host.querySelector('cr-toggle');
          if (cr) {
            if (!cr.checked) {
              cr.click();
              out.clicked = true;
            } else {
              out.already = true;
            }
            out.toggleId = host.id;
          } else {
            host.click();
            out.clickedHost = true;
          }
        }
      }
    }

    // Specific id used by Chrome
    const allowRow =
      detail.shadowRoot.querySelector('#allow-user-scripts') ||
      detail.shadowRoot.querySelector('[id*="user-script"]');
    if (allowRow) {
      out.allowRow = allowRow.outerHTML.slice(0, 200);
      const cr = allowRow.shadowRoot?.querySelector('cr-toggle') || allowRow.querySelector('cr-toggle');
      if (cr && !cr.checked) {
        cr.click();
        out.clicked = true;
      }
    }
  } else {
    out.noDetail = true;
    out.mgrText = mgr.shadowRoot.textContent.replace(/\s+/g, ' ').slice(0, 400);
  }
  return out;
}, TM_ID);

console.log('toggle result', JSON.stringify(toggled, null, 2));
await sleep(1000);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_allow2.png'), fullPage: true });

// Check TM dashboard warning gone
await page.goto(`chrome-extension://${TM_ID}/options.html#nav=dashboard`, {
  waitUntil: 'domcontentloaded',
  timeout: 15000,
});
await sleep(2500);
const dash = await page.evaluate(() =>
  ((document.body && document.body.innerText) || '').replace(/\s+/g, ' ').slice(0, 700)
);
console.log('DASH after:', dash);
await page.screenshot({ path: path.join(ROOT, '_tmp_tm_dashboard.png'), fullPage: true });

// Reload game
let game = context.pages().find((p) => /5kings\.ru\/game/i.test(p.url()));
if (!game) {
  game = await context.newPage();
  await game.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
} else {
  await game.bringToFront();
  await game.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
}
await sleep(7000);
let g = await probe(game);
console.log('GAME', JSON.stringify(g, null, 2));
await game.screenshot({ path: path.join(ROOT, '_tmp_tm_vira_final.png') });

// One more hard reload
await game.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(5000);
g = await probe(game);
console.log('FINAL', JSON.stringify(g, null, 2));

console.log(
  'SUMMARY',
  JSON.stringify(
    {
      allowUserScriptsWarningGone: !/Разрешить пользовательские скрипты/i.test(dash),
      beacon: g.hasBeacon,
      beaconText: g.beaconText,
      panel: g.hasPanel,
      dact: g.hasDact,
      cu: g.cu,
    },
    null,
    2
  )
);

process.exit(0);
