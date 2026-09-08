import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const pages = browser.contexts().flatMap((c) => c.pages());
console.log('pages', pages.map((p) => p.url().slice(0, 80)));
const page = pages.find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
if (!page) {
  console.log('no game page');
  process.exit(1);
}
await page.bringToFront();

async function go(u) {
  await page.evaluate((url) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) throw new Error('no d_act');
    if (typeof act.goRC === 'function') act.goRC(url);
    else if (typeof act.goR === 'function') act.goR(url);
    else act.location.href = url;
  }, u);
  await sleep(2000);
}

async function text() {
  return page.evaluate(() =>
    (document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
      .replace(/\s+/g, ' ')
      .slice(0, 2000)
  );
}

async function html() {
  return page.evaluate(
    () => document.getElementById('d_act')?.contentWindow?.document?.body?.innerHTML || ''
  );
}

// Open jail properly via street
await go('place_street_2.html');
console.log('street2 buttons wait');
await sleep(1000);
await go('jail.html');
console.log('JAIL', await text());
fs.writeFileSync('_tmp_jail.html', await html());

await go('place.html');
console.log('PLACE', await text());

// Search for purity
for (const u of [
  'clear.html',
  'law.html',
  'police.html',
  'sud.html',
  'court.html',
  'purity.html',
  'clean.html',
  'spravka.html',
  'passport.html',
  'doc.html',
  'documents.html',
  'mayor.html',
  'gov.html',
  'lic_mode_1.html',
  'lic_mode_3.html',
  'lic_mode_4.html',
  'clan.html',
]) {
  await go(u);
  const t = await text();
  if (t && t.length > 5 && !/404|not found/i.test(t)) {
    console.log('OK', u, t.slice(0, 250));
  } else {
    console.log('empty', u, t.slice(0, 80));
  }
}

// Try buy with enough logging: click Приобрести on rudokop page
await go('lic_mode_0_mask_768.html');
await sleep(1000);
page.once('dialog', async (d) => {
  console.log('DIALOG:', d.type(), d.message());
  await d.accept();
});
const clicked = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const btn = [...act.document.querySelectorAll('input[type=button]')].find((b) =>
    /Приобрести/i.test(b.value)
  );
  if (!btn) return null;
  const onclick = btn.getAttribute('onclick');
  btn.click();
  return onclick;
});
console.log('clicked buy', clicked);
await sleep(3000);
console.log('AFTER BUY', await text());

// Money from доблесть? bank valor shop?
await go('bank.html');
console.log('BANK', await text());

process.exit(0);
