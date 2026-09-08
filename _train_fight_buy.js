/**
 * Finish shadow fight using project battle AI, then try buy Рудокоп.
 */
import { chromium } from 'playwright';
import { getActFrame, sleep, log } from './src/browser.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
await page.bringToFront();

async function go(u) {
  await page.evaluate((url) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(url);
    else if (typeof act.goR === 'function') act.goR(url);
    else act.location.href = url;
  }, u);
  await sleep(2000);
}

async function getCash() {
  await go('bank.html');
  return page.evaluate(() => {
    const t = (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '').replace(
      /\s+/g,
      ' '
    );
    const m = t.match(/наличность:\s*([\d.]+)/i);
    return { cash: m ? Number(m[1]) : null, snip: t.slice(0, 200) };
  });
}

// Ensure in fight or start shadow
let frame = await getActFrame(page).catch(() => null);
let inBattle = frame && (await isBattleFrame(frame).catch(() => false));
console.log('inBattle', inBattle, frame?.url?.());

if (!inBattle) {
  await go('arena_room_1.html');
  await sleep(1000);
  await page.evaluate(() => {
    const act = document.getElementById('d_act').contentWindow;
    const btn = [...act.document.querySelectorAll('input,button')].find((b) =>
      /тень/i.test(b.value || b.textContent || '')
    );
    if (btn) btn.click();
  });
  await sleep(4000);
  frame = await getActFrame(page);
  inBattle = await isBattleFrame(frame);
  console.log('after start inBattle', inBattle, await frame.url());
}

if (inBattle) {
  const stop = { stopped: false };
  // Cap ~3 minutes
  const timer = setTimeout(() => {
    stop.stopped = true;
  }, 180000);
  try {
    await runBattleLoop(frame, { stopSignal: stop, maxIdleMs: 120000 });
  } catch (e) {
    console.log('battle err', e.message);
  }
  clearTimeout(timer);
}

await sleep(3000);
const cash = await getCash();
console.log('CASH', cash);

if (cash.cash >= 100) {
  await go('lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
  await sleep(3000);
  const t = await page.evaluate(() =>
    (document.getElementById('d_act').contentWindow.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 800)
  );
  console.log('BUY RESULT', t);
} else {
  console.log('Still need', (100 - (cash.cash || 0)).toFixed(2), 'silver');
  // Try buy anyway to surface purity error with enough money later
  await go('lic_mode_0_mask_768.html');
  console.log(
    'LIC PAGE',
    await page.evaluate(() =>
      (document.getElementById('d_act').contentWindow.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400)
    )
  );
}

process.exit(0);
