/**
 * Earn silver via Fredegar quest + shadow fight, then buy Рудокоп I.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
await page.bringToFront();
page.on('dialog', async (d) => {
  console.log('DIALOG', d.message());
  await d.accept();
});

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
      .slice(0, 2500)
  );
}
async function buttons() {
  return page.evaluate(() =>
    [...document.getElementById('d_act').contentWindow.document.querySelectorAll('input,button,a')].map(
      (el) => ({
        v: (el.value || '').trim(),
        t: (el.textContent || '').trim().slice(0, 80),
        o: (el.getAttribute('onclick') || '').slice(0, 160),
        n: el.name || '',
      })
    )
  );
}
async function click(match) {
  const re = match instanceof RegExp ? match : new RegExp(match, 'i');
  return page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const act = document.getElementById('d_act').contentWindow;
    for (const el of [...act.document.querySelectorAll('input,button,a')]) {
      const s = `${el.value || ''} ${el.textContent || ''} ${el.getAttribute('onclick') || ''} ${el.name || ''}`;
      if (re.test(s)) {
        el.click();
        return s.trim().slice(0, 120);
      }
    }
    return null;
  }, re.source);
}

async function cash() {
  await go('bank.html');
  const t = await text();
  const m = t.match(/наличность:\s*([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

console.log('cash0', await cash());

// Fredegar dialogue
await go('quest_questid_7_type_fredegar.html');
for (let i = 0; i < 12; i++) {
  const t = await text();
  const btns = await buttons();
  console.log(`\nFRE[${i}]`, t.slice(0, 400));
  console.log(
    'btns',
    btns.filter((b) => b.v || b.t).slice(0, 15)
  );
  fs.writeFileSync(
    `_tmp_fre_${i}.html`,
    await page.evaluate(() => document.getElementById('d_act').contentWindow.document.body.innerHTML)
  );
  const clicked =
    (await click(/дальше|продолж|соглас|да\b|взять|принять|выполн|отдать|купить|продать|получить|наград|ок\b|хорошо|понял/i)) ||
    (await click(/диалог|ответ|сказать|выбрать/i));
  console.log('clicked', clicked);
  if (!clicked) break;
  await sleep(2500);
}

console.log('cash1', await cash());

// Shadow fight
await go('arena_room_1.html');
await sleep(1000);
console.log('before shadow', await text());
const sh = await click(/тень|shadow|Бой с тенью/i);
console.log('shadow click', sh);
await sleep(4000);
console.log('after shadow', await text());
console.log('href', await page.evaluate(() => document.getElementById('d_act').contentWindow.location.href));

// If in battle, try simple turns for a bit
for (let i = 0; i < 20; i++) {
  const href = await page.evaluate(() => document.getElementById('d_act').contentWindow.location.href);
  const t = await text();
  const inBattle = /battle|fight|fbattle|combat|ход/i.test(href + t);
  console.log(`B[${i}]`, href.slice(0, 80), t.slice(0, 200));
  if (!inBattle && i > 0) break;

  await page.evaluate(() => {
    const w = document.getElementById('d_act').contentWindow;
    try {
      if (typeof w.ubkick === 'function') {
        w.ubkick(0, 1);
        w.ubkick(1, 2);
      }
      if (typeof w.ubblock === 'function') {
        w.ubblock(0, 0);
        w.ubblock(1, 3);
      }
      if (typeof w.MakeTurn === 'function') w.MakeTurn();
      else {
        const btn = [...w.document.querySelectorAll('input,button')].find((b) =>
          /ход|атак|удар|подтверд/i.test(b.value || b.textContent || '')
        );
        if (btn) btn.click();
      }
    } catch (e) {}
  });
  await sleep(3000);
}

console.log('cash2', await cash());

// Buy license if enough
const money = await cash();
console.log('final cash', money);
if (money != null && money >= 100) {
  await go('lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
  await sleep(3000);
  console.log('BUY', await text());
  fs.writeFileSync(
    '_tmp_buy_ok.html',
    await page.evaluate(() => document.getElementById('d_act').contentWindow.document.body.innerHTML)
  );
} else {
  console.log('Not enough silver for Рудокоп (need 100)');
}

process.exit(0);
