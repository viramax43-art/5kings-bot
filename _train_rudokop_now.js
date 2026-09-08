/**
 * Status → farm silver (shadow) → buy Рудокоп I → try forest copper.
 * Uses Playwright login (storage-state), not CDP.
 */
import 'dotenv/config';
import fs from 'fs';
import {
  ensureLoggedIn,
  getActFrame,
  launchBrowser,
  log,
  openForest,
  saveState,
  sleep,
} from './src/browser.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

const NEED = 100;
const MAX_FIGHTS = Number(process.env.SHADOW_FIGHTS || 40);
const UID = process.env.USER_ID || '960792';

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
  return frame.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000));
}

async function getCash(page) {
  await go(page, 'bank.html');
  const t = await actText(page);
  const m = t.match(/наличность:\s*([\d.]+)/i);
  return { cash: m ? Number(m[1]) : null, text: t.slice(0, 400) };
}

async function getInfo(page) {
  await go(page, `info.html?user=${UID}`);
  await sleep(500);
  const frame = await getActFrame(page);
  const html = await frame.evaluate(() => document.documentElement?.innerHTML?.slice(0, 80000) || '');
  const text = await actText(page);
  fs.writeFileSync('_tmp_info_rudokop.html', html);
  return { text, html };
}

async function clickMatch(page, re) {
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

async function pickShadowRoom(page) {
  await go(page, 'arenax.html');
  const frame = await getActFrame(page);
  const rooms = await frame.evaluate(() => {
    const out = [];
    for (const td of [...document.querySelectorAll('td')]) {
      const btn = td.querySelector('input[type=button],button');
      if (!btn) continue;
      const label = (btn.value || btn.textContent || '').trim();
      if (!/комнат/i.test(label) || /торгов/i.test(label)) continue;
      const oc = btn.getAttribute('onclick') || '';
      const m = oc.match(/goRC\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
      const cell = (td.innerText || '').replace(/\s+/g, ' ');
      const rm = cell.match(/для\s+уровней\s*:\s*(\d+)\s*[-–—]\s*(\d+)/i);
      out.push({
        label,
        url: m ? m[1] : '',
        clickable: !!m,
        min: rm ? Number(rm[1]) : null,
        max: rm ? Number(rm[2]) : null,
      });
    }
    return out;
  });
  const clickable = rooms.filter((r) => r.clickable && r.url);
  clickable.sort((a, b) => (b.max || 0) - (a.max || 0) || (b.min || 0) - (a.min || 0));
  const best = clickable[0] || { url: 'arena_room_3.html', label: 'fallback room3' };
  log('Shadow room', best.label, best.url);
  await go(page, best.url);
  return best;
}

async function startShadow(page) {
  await pickShadowRoom(page);
  let clicked = await clickMatch(page, /тень|StartBattleWithShadow|shadow/i);
  if (!clicked) {
    await go(page, 'arena_mode_1.html?actBattle-StartBattleWithShadow=1');
    clicked = 'url-start';
  }
  log('shadow start', clicked);
  await sleep(3500);
}

async function buyRudokop(page) {
  page.once('dialog', async (d) => {
    log('DIALOG', d.message());
    await d.accept();
  });
  await go(page, 'lic_mode_0_mask_768.html');
  log('LIC PAGE', (await actText(page)).slice(0, 500));
  const buy = await clickMatch(page, /BuyGLic=256|Приобрести/);
  // Prefer exact I ступень buy if two "Приобрести"
  await go(page, 'lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
  await sleep(2500);
  const t = await actText(page);
  log('BUY RESULT', t.slice(0, 800));
  fs.writeFileSync(
    '_tmp_buy_rudokop_now.html',
    await (await getActFrame(page)).evaluate(() => document.body?.innerHTML || '')
  );
  return t;
}

async function tryForestOre(page) {
  log('Opening forest…');
  await openForest(page).catch(async () => {
    await go(page, 'forest.html');
  });
  await sleep(2500);
  const frame = await getActFrame(page);
  const snap = await frame.evaluate(() => {
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600);
    const hasCu = !!(window.cu && window.gd);
    const bots = window.gd?.bots ? Object.keys(window.gd.bots).length : 0;
    return { href: location.href, text, hasCu, bots };
  });
  log('FOREST', snap);

  // equip tool if bag available
  await go(page, 'bag_type_17.html');
  log('BAG TOOLS', (await actText(page)).slice(0, 600));
  await clickMatch(page, /надеть|взять|экипир|использовать/i);
  await sleep(1500);

  await openForest(page).catch(async () => go(page, 'forest.html'));
  await sleep(2000);

  // try search
  await clickMatch(page, /поиск|искать|Search/i);
  await (await getActFrame(page)).evaluate(() => {
    try {
      if (window.cu?.send) window.cu.send({ actHunter: { Search: 1 } });
    } catch (e) {}
  });
  await sleep(5000);
  log('AFTER SEARCH', (await actText(page)).slice(0, 800));
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await saveState(context);

  const cash0 = await getCash(page);
  log('CASH', cash0);

  const info0 = await getInfo(page);
  const hasLic = /рудокоп/i.test(info0.text + info0.html);
  const purity =
    /чист(?:от|ый|ая).*закон|перед законом|проверка на чистот/i.test(info0.text) ||
    /чистот/i.test(info0.text);
  log('INFO snippet', info0.text.slice(0, 900));
  log('hasRudokopMention', hasLic, 'purityHint', purity);

  // License shop probe
  await go(page, 'lic_mode_0_mask_768.html');
  log('SHOP', (await actText(page)).slice(0, 700));

  let cash = cash0.cash || 0;

  if (!/рудокоп i|рудокоп\s*i\s*ступен/i.test(info0.text) && cash < NEED) {
    log(`Need ${NEED} silver, have ${cash}. Farming shadow…`);
    for (let n = 1; n <= MAX_FIGHTS && cash < NEED; n++) {
      log(`\n=== fight ${n}/${MAX_FIGHTS} cash=${cash} ===`);
      try {
        await startShadow(page);
        let frame = await getActFrame(page);
        let inB = await isBattleFrame(frame).catch(() => false);
        if (!inB) {
          log('not in battle');
          await sleep(2000);
          continue;
        }
        const stop = { stopped: false };
        const timer = setTimeout(() => {
          stop.stopped = true;
        }, 90000);
        try {
          await runBattleLoop(frame, { stopSignal: stop, maxIdleMs: 70000 });
        } catch (e) {
          log('battle err', e.message || e);
        }
        clearTimeout(timer);
        await sleep(1500);
        cash = (await getCash(page)).cash || cash;
        log('cash now', cash);
      } catch (e) {
        log('fight loop err', e.message || e);
        await sleep(2000);
      }
    }
  }

  cash = (await getCash(page)).cash || cash;
  log('PRE-BUY CASH', cash);

  if (cash >= NEED) {
    await buyRudokop(page);
  } else {
    log(`Still short: ${cash}/${NEED}`);
  }

  const info1 = await getInfo(page);
  log('INFO AFTER', info1.text.slice(0, 1000));
  const owned = /рудокоп/i.test(info1.text);
  log('OWNED?', owned);

  if (owned) {
    await tryForestOre(page);
  } else {
    // Try buy errors / law
    await go(page, 'lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
    await sleep(2000);
    log('BUY RETRY', (await actText(page)).slice(0, 900));
  }

  await saveState(context);
  log('DONE');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  // keep browser open a bit for inspection? close to free resources
  await sleep(2000);
  await browser.close().catch(() => {});
}
