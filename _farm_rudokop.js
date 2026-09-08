/**
 * Equip pickaxe + farm copper in city/big forest to level Рудокоп.
 * Env: FARM_MS (default 3h), HEADLESS=false
 */
import 'dotenv/config';
import fs from 'fs';
import { config } from './src/config.js';
import {
  ensureLoggedIn,
  getActFrame,
  launchBrowser,
  log,
  openForest,
  saveState,
  sleep,
} from './src/browser.js';
import { equipTool } from './src/inventory.js';
import { runForestLoop } from './src/forest.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

const FARM_MS = Number(process.env.FARM_MS || 3 * 60 * 60 * 1000);

// Only copper (рудокоп 0 lvl)
config.forest.collectAll = true;
config.forest.equipTool = true;
config.forest.autoSearch = true;
config.forest.types.trees = [];
config.forest.types.herbs = [];
config.forest.types.crystals = [];
config.forest.types.chests = [];
config.forest.types.iron = [];
config.forest.types.gold = [];
process.env.FORCE_ORE = '1';

async function go(page, url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(1800);
}

async function actText(page) {
  const frame = await getActFrame(page);
  return frame.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 4000));
}

async function actHtml(page) {
  const frame = await getActFrame(page);
  return frame.evaluate(() => document.documentElement?.innerHTML || '');
}

async function clickRe(page, re) {
  const frame = await getActFrame(page);
  return frame.evaluate((src) => {
    const r = new RegExp(src, 'i');
    for (const el of [...document.querySelectorAll('input,button,a')]) {
      const s = `${el.value || ''} ${el.textContent || ''} ${el.getAttribute('onclick') || ''}`;
      if (r.test(s)) {
        el.click();
        return s.trim().slice(0, 140);
      }
    }
    return null;
  }, re.source);
}

async function bagHasPickaxe(page) {
  await go(page, 'bag_type_17_mode_0.html');
  const t = await actText(page);
  log('BAG17', t.slice(0, 500));
  return /кирк/i.test(t);
}

async function buyPickaxe(page) {
  const places = ['smith.html', 'shop.html', 'sawmill.html', 'hunter.html'];
  for (const u of places) {
    await go(page, u);
    const t = await actText(page);
    log('SHOP', u, t.slice(0, 350));
    if (!/кирк/i.test(t)) continue;
    const html = await actHtml(page);
    fs.writeFileSync(`_tmp_shop_${u.replace(/\W/g, '_')}.html`, html.slice(0, 40000));
    const clicked =
      (await clickRe(page, /кирк/i)) ||
      (await clickRe(page, /купить.*кирк|кирк.*купить|Buy.*кирк/i));
    log('click pick', clicked);
    await sleep(1500);
    // confirm / buy buttons
    await clickRe(page, /купить|приобрести|да\b|ок\b|подтверд/i);
    await sleep(2000);
    log('after buy', (await actText(page)).slice(0, 400));
    if (await bagHasPickaxe(page)) return true;
  }
  return false;
}

async function ensureInForest(page) {
  // City forest first (площадь → Лес) — copper at prof 0
  await go(page, 'place_street_4.html');
  await go(page, 'forest.html');
  await sleep(2500);
  let frame = await getActFrame(page);
  let snap = await frame
    .evaluate(() => ({
      href: location.href,
      cu: !!(window.cu && window.gd),
      bots: window.gd?.bots ? Object.keys(window.gd.bots).length : 0,
      text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
    }))
    .catch(() => ({ err: true }));
  log('FOREST1', snap);
  if (snap.cu && snap.bots > 0) return frame;

  // Big forest via gates
  await go(page, 'gates.html');
  log('GATES', (await actText(page)).slice(0, 500));
  await clickRe(page, /лес|выйти|за ворота|открыть|дальше|продолж/i);
  await sleep(2000);
  await go(page, 'forest.html');
  await sleep(3000);
  try {
    frame = await openForest(page);
  } catch (e) {
    log('openForest', e.message);
    frame = await getActFrame(page);
  }
  snap = await frame
    .evaluate(() => ({
      href: location.href,
      cu: !!(window.cu && window.gd),
      bots: window.gd?.bots ? Object.keys(window.gd.bots).length : 0,
    }))
    .catch(() => ({}));
  log('FOREST2', snap);
  return frame;
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  try {
    await d.accept();
  } catch (_) {}
});

const stopSignal = { stopped: false };
const shutdown = async (why) => {
  if (stopSignal.stopped && why !== 'done') return;
  stopSignal.stopped = true;
  log('STOP', why);
  try {
    await saveState(context);
  } catch (_) {}
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  await ensureLoggedIn(page, context);

  let has = await bagHasPickaxe(page);
  if (!has) {
    log('Кирки нет — ищу в лавке/кузнице…');
    has = await buyPickaxe(page);
  }
  log('hasPickaxe', has);

  const equipped = await equipTool(context, page, { toolKeywords: ['кирк'] });
  log('equipped', equipped);
  if (!equipped) {
    await equipTool(context, page);
  }

  await ensureInForest(page);

  const t0 = Date.now();
  log(`Фарм меди старт, лимит ${Math.round(FARM_MS / 60000)} мин`);

  while (!stopSignal.stopped && Date.now() - t0 < FARM_MS) {
    const fr0 = await getActFrame(page).catch(() => null);
    if (fr0 && (await isBattleFrame(fr0).catch(() => false))) {
      log('Бой — AI');
      await runBattleLoop(fr0, { stopSignal });
      continue;
    }

    let frame;
    try {
      frame = await openForest(page);
    } catch (e) {
      log(e.message);
      await ensureInForest(page);
      await sleep(4000);
      continue;
    }

    const localStop = { stopped: false };
    const forestP = runForestLoop(frame, {
      stopSignal: {
        get stopped() {
          return stopSignal.stopped || localStop.stopped || Date.now() - t0 >= FARM_MS;
        },
      },
      page,
      context,
    });

    while (!stopSignal.stopped && Date.now() - t0 < FARM_MS) {
      await sleep(4000);
      const fr = await getActFrame(page).catch(() => null);
      if (fr && (await isBattleFrame(fr).catch(() => false))) {
        localStop.stopped = true;
        break;
      }
    }
    localStop.stopped = true;
    await forestP.catch((e) => log('forest', e.message || e));
  }

  await go(page, 'info.html?user=960792');
  log('INFO END', (await actText(page)).slice(0, 900));
  await saveState(context);
  log('DONE farm');
} catch (e) {
  console.error(e);
  await sleep(15000);
} finally {
  await shutdown('done');
  await browser.close().catch(() => {});
}
