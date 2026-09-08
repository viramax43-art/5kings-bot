import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
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

await go('arenax.html');
const info = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const doc = act.document;
  const buttons = [...doc.querySelectorAll('input,button,a')].map((el) => ({
    value: (el.value || '').trim(),
    text: (el.textContent || '').trim().slice(0, 80),
    onclick: (el.getAttribute('onclick') || '').slice(0, 200),
    href: (el.getAttribute('href') || '').slice(0, 120),
  }));
  return {
    text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2000),
    html: doc.body.innerHTML.slice(0, 30000),
    buttons,
  };
});
fs.writeFileSync('_tmp_arenax.html', info.html);
console.log('TEXT', info.text);
console.log('BTNS', JSON.stringify(info.buttons.filter((b) => /уров|комнат|arena|тень|зал/i.test(JSON.stringify(b))), null, 2));
console.log('ALL BTNS', JSON.stringify(info.buttons.slice(0, 40), null, 2));

// Also get character level from ulist / pers
const lvl = await page.evaluate(() => {
  try {
    const ul = document.getElementById('d_ulist')?.contentWindow?.document?.body?.innerText || '';
    const pers = document.getElementById('d_pers')?.contentWindow;
    const nd = pers?.nd;
    return { ul: ul.replace(/\s+/g, ' ').slice(0, 300), ndLvl: nd?.lvl, ndNk: nd?.nk };
  } catch (e) {
    return { err: String(e) };
  }
});
console.log('LVL', lvl);
process.exit(0);
