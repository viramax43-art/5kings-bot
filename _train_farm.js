/**
 * Farm shadow fights for silver toward Рудокоп license (need 100).
 */
import { chromium } from 'playwright';
import { getActFrame, sleep } from './src/browser.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

const NEED = 100;
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
  await sleep(1800);
}

async function getCash() {
  await go('bank.html');
  return page.evaluate(() => {
    const t = (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '').replace(
      /\s+/g,
      ' '
    );
    const m = t.match(/наличность:\s*([\d.]+)/i);
    return m ? Number(m[1]) : null;
  });
}

async function startShadow() {
  await go('arena_room_1.html');
  await sleep(800);
  await page.evaluate(() => {
    const act = document.getElementById('d_act').contentWindow;
    const btn = [...act.document.querySelectorAll('input,button')].find((b) =>
      /тень/i.test(b.value || b.textContent || '')
    );
    if (btn) btn.click();
  });
  await sleep(3500);
}

let cash = await getCash();
console.log('start cash', cash);

for (let n = 1; n <= 5 && (cash || 0) < NEED; n++) {
  console.log(`\n=== fight ${n}, cash=${cash} ===`);
  await startShadow();
  let frame = await getActFrame(page);
  let ok = await isBattleFrame(frame).catch(() => false);
  if (!ok) {
    console.log('not in battle, skip');
    await sleep(2000);
    continue;
  }
  const stop = { stopped: false };
  const timer = setTimeout(() => {
    stop.stopped = true;
  }, 120000);
  try {
    await runBattleLoop(frame, { stopSignal: stop, maxIdleMs: 90000 });
  } catch (e) {
    console.log('battle', e.message);
  }
  clearTimeout(timer);
  await sleep(2000);
  cash = await getCash();
  console.log('cash now', cash);
}

console.log('FINAL CASH', cash);

if ((cash || 0) >= NEED) {
  page.on('dialog', async (d) => {
    console.log('DIALOG', d.message());
    await d.accept();
  });
  await go('lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
  await sleep(3000);
  console.log(
    'BUY',
    await page.evaluate(() =>
      (document.getElementById('d_act').contentWindow.document.body.innerText || '')
        .replace(/\s+/g, ' ')
        .slice(0, 1000)
    )
  );
  // Verify owned?
  await go('info.html?user=960792');
  console.log(
    'INFO',
    await page.evaluate(() =>
      (document.getElementById('d_act').contentWindow.document.body.innerText || '')
        .replace(/\s+/g, ' ')
        .slice(0, 1200)
    )
  );
}

process.exit(0);
