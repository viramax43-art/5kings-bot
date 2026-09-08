/**
 * Get law clearance if needed, earn silver, buy Рудокоп I, start leveling via forest ore.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function goAct(page, url) {
  return page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) return false;
    try {
      if (typeof act.goRC === 'function') act.goRC(u);
      else if (typeof act.goR === 'function') act.goR(u);
      else act.location.href = u;
      return true;
    } catch (e) {
      return String(e);
    }
  }, url);
}

async function clickAct(page, pred) {
  return page.evaluate((predSrc) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act?.document) return { ok: false, why: 'no act' };
    const fn = new Function('el', 'return (' + predSrc + ')');
    const els = [...act.document.querySelectorAll('input,button,a')];
    for (const el of els) {
      const meta = {
        value: el.value || '',
        text: (el.textContent || '').trim(),
        name: el.name || '',
        onclick: el.getAttribute('onclick') || '',
      };
      if (fn(meta)) {
        el.click();
        return { ok: true, meta };
      }
    }
    return { ok: false, why: 'not found', sample: els.slice(0, 15).map((e) => e.value || e.textContent) };
  }, pred.toString());
}

async function actText(page) {
  return page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    return (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500);
  });
}

async function cash(page) {
  return page.evaluate(() => {
    const t =
      document.getElementById('d_pers')?.contentWindow?.document?.body?.innerText ||
      document.body.innerText ||
      '';
    const m = t.match(/(\d+[.,]\d+)\s*$/m);
    // better: my_cash
    const act = document.getElementById('d_act')?.contentWindow;
    const c1 = act?.document?.querySelector('#my_cash, .krit, b.krit');
    const snip = (act?.document?.body?.innerText || '').match(/наличность[:\s]*([\d.]+)/i);
    const pers = document.getElementById('d_pers')?.contentWindow?.nd;
    return {
      snip: snip?.[1] || null,
      ndCash: null,
      textHint: (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
      persText: (document.getElementById('d_pers')?.contentWindow?.document?.body?.innerText || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120),
    };
  });
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();

// 1) Try buy рудокоп I anyway to see error
await goAct(page, 'lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
await sleep(2500);
console.log('BUY ATTEMPT:', await actText(page));
await page.screenshot({ path: path.join(ROOT, '_tmp_buy_rudokop.png') });

// 2) Law purity / jail / municipality
for (const u of ['jail.html', 'lic_mode_0.html', 'predlozheniya.html', 'buildlics.html']) {
  await goAct(page, u);
  await sleep(1500);
  const t = await actText(page);
  console.log('\nPLACE', u, t.slice(0, 400));
}

// 3) Inventory / bag sellables
for (const u of ['bag.html', 'bag_type_1.html', 'bag_type_17.html', 'itype_1.html']) {
  await goAct(page, u);
  await sleep(1500);
  console.log('\nBAG', u, (await actText(page)).slice(0, 500));
}

// 4) Sell resources at sawmill
await goAct(page, 'sawmill_mode_3.html');
await sleep(2000);
console.log('\nSELL', await actText(page));

// 5) Fredegar quest / fortune for money
await goAct(page, 'quest_type_fredegar.html');
await sleep(2000);
console.log('\nFREDEGAR', await actText(page));
console.log(
  'click',
  await clickAct(page, (el) => /начать|взять|продолж|выполн|получить|наград/i.test(el.value + el.text))
);
await sleep(2000);
console.log('FREDEGAR2', await actText(page));

await goAct(page, 'fortunawheel.html');
await sleep(2000);
console.log('\nFORTUNE', await actText(page));

// 6) Bank
await goAct(page, 'bank.html');
await sleep(1500);
console.log('\nBANK', await actText(page));

process.exit(0);
