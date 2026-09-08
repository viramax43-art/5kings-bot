/**
 * Buy Рудокоп I while «Чист перед законом» is active.
 */
import 'dotenv/config';
import {
  ensureLoggedIn,
  getActFrame,
  launchBrowser,
  log,
  saveState,
  sleep,
} from './src/browser.js';

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
  return frame.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000));
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});

await ensureLoggedIn(page, context);

await go(page, 'bank.html');
log('CASH', await actText(page));

await go(page, 'lic.html');
log('LIC HALL', (await actText(page)).slice(0, 400));

await go(page, 'lic_mode_0_mask_768.html');
log('SHOP', await actText(page));

const clicked = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  if (!act) return null;
  const btn = [...act.document.querySelectorAll('input,button')].find((b) =>
    /BuyGLic=256/i.test(b.getAttribute('onclick') || '')
  );
  if (btn) {
    btn.click();
    return btn.getAttribute('onclick');
  }
  return null;
});
log('CLICK', clicked);
if (!clicked) {
  await go(page, 'lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
}
await sleep(3000);
log('AFTER BUY', await actText(page));

await go(page, `info.html?user=${UID}`);
const info = await actText(page);
const hasRudokop = /рудокоп/i.test(info);
const hasPurity = /чист\s*перед\s*законом/i.test(info);
log('INFO', info.slice(0, 1200));
log({ hasRudokop, hasPurity });

await saveState(context);
await browser.close();
process.exit(hasRudokop ? 0 : 4);
