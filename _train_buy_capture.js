/**
 * Capture exact BuyGLic error via preRoll / page text.
 */
import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, getActFrame, launchBrowser, log, saveState, sleep } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
const dialogs = [];
page.on('dialog', async (d) => {
  dialogs.push(d.message());
  log('DIALOG', d.message());
  await d.accept();
});

await ensureLoggedIn(page, context);

// Hook preRoll in top
await page.evaluate(() => {
  window.__k5_prerolls = [];
  const orig = window.preRoll;
  window.preRoll = function (a, b) {
    window.__k5_prerolls.push([a, b]);
    if (typeof orig === 'function') return orig.apply(this, arguments);
  };
});

async function go(url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else location.href = u;
  }, url);
  await sleep(2500);
}

await go('lic_mode_0_mask_768.html');
const before = await page.evaluate(async () => {
  const act = document.getElementById('d_act')?.contentWindow;
  return {
    href: act?.location?.href,
    text: (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
    html: act?.document?.documentElement?.innerHTML?.slice(0, 20000),
  };
});
fs.writeFileSync('_tmp_lic_before.html', before.html || '');
log('BEFORE', before.text);

// Click exact Buy I
const clicked = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const btns = [...act.document.querySelectorAll('input[type=button],button')];
  const buy = btns.find((b) => /BuyGLic=256/i.test(b.getAttribute('onclick') || ''));
  if (buy) {
    buy.click();
    return buy.getAttribute('onclick');
  }
  return null;
});
log('CLICK', clicked);
await sleep(3000);

const after = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const rolls = window.__k5_prerolls || [];
  // also try read script preRoll from act doc
  const html = act?.document?.documentElement?.innerHTML || '';
  const m = html.match(/preRoll\("([^"]*)","([^"]*)"\)/);
  return {
    href: act?.location?.href,
    text: (act?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200),
    rolls,
    prerollMatch: m ? [m[1], m[2]] : null,
    html: html.slice(0, 30000),
  };
});
fs.writeFileSync('_tmp_lic_after_buy.html', after.html || '');
log('AFTER href', after.href);
log('AFTER text', after.text);
log('rolls', after.rolls);
log('prerollMatch', after.prerollMatch);
log('dialogs', dialogs);

// cash
await go('bank.html');
log(
  'CASH',
  await page.evaluate(() =>
    (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 200)
  )
);

await saveState(context);
await browser.close();
