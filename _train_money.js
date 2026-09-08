/**
 * Earn silver + buy Рудокоп I. Character appears ~lvl 3, cash 30, need 100.
 */
import { chromium } from 'playwright';
import fs from 'fs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
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
async function clickBy(predSrc) {
  return page.evaluate((src) => {
    const act = document.getElementById('d_act').contentWindow;
    const fn = new Function('el', 'return (' + src + ')');
    for (const el of [...act.document.querySelectorAll('input,button,a')]) {
      const meta = {
        value: el.value || '',
        text: (el.textContent || '').trim(),
        name: el.name || '',
        onclick: el.getAttribute('onclick') || '',
      };
      if (fn(meta)) {
        el.click();
        return meta;
      }
    }
    return null;
  }, predSrc);
}

page.on('dialog', async (d) => {
  console.log('DIALOG', d.message());
  await d.accept();
});

// Inventory via info wear page
await go('info_user_960792.html');
console.log('INFO_USER', (await text()).slice(0, 600));
fs.writeFileSync(
  '_tmp_info_user.html',
  await page.evaluate(() => document.getElementById('d_act').contentWindow.document.body.innerHTML)
);

// Try bag from top frame helpers
const bagNav = await page.evaluate(() => {
  const tries = [];
  for (const name of ['d_pers', 'd_chatact', 'd_ulist']) {
    try {
      const f = document.getElementById(name)?.contentWindow || top.frames[name];
      if (!f) continue;
      const html = f.document?.body?.innerHTML?.slice(0, 5000) || '';
      const links = [...(f.document?.querySelectorAll('[onclick],a') || [])]
        .map((el) => (el.getAttribute('onclick') || '') + ' ' + (el.getAttribute('href') || ''))
        .filter((s) => /bag|sumk|вещ|инвент/i.test(s));
      tries.push({ name, links: links.slice(0, 10), text: (f.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 150) });
    } catch (e) {
      tries.push({ name, err: String(e) });
    }
  }
  // global helpers
  tries.push({
    hasOpenBag: typeof top.openBag,
    hasGoBag: typeof window.goBag,
  });
  return tries;
});
console.log('BAGNAV', JSON.stringify(bagNav, null, 2));

// Fredegar quest properly
await go('quest_type_fredegar.html');
await sleep(1500);
console.log('FREDEGAR', await text());
const freHtml = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.body.innerHTML
);
fs.writeFileSync('_tmp_fredegar.html', freHtml);
const freBtns = await page.evaluate(() =>
  [...document.getElementById('d_act').contentWindow.document.querySelectorAll('input,button,a')].map(
    (el) => ({
      v: el.value || '',
      t: (el.textContent || '').trim().slice(0, 60),
      o: (el.getAttribute('onclick') || '').slice(0, 120),
      n: el.name || '',
    })
  )
);
console.log('FRE BTNS', freBtns);

// Join fist fight 0-1 for money
await go('arenax.html');
await sleep(1000);
await clickBy('el => /0-1/.test(el.value+el.text+el.onclick) || /arena_room_1\\.html/.test(el.onclick)');
await sleep(2000);
console.log('ARENA after click', await text());

// Create or join application
await go('arena_room_1.html');
await sleep(1500);
console.log('ROOM1', await text());
const created = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const form = act.document.querySelector('form');
  const html = form ? form.outerHTML.slice(0, 1500) : 'no form';
  // try submit create
  const create = act.document.querySelector('input[name=\"actBattle-CreateHeader\"], input[name*=Create]');
  const join = [...act.document.querySelectorAll('input')].find((i) =>
    /принять|войти|вступить/i.test(i.value)
  );
  return {
    html,
    create: create ? create.name : null,
    joins: [...act.document.querySelectorAll('input[type=submit],input[type=button]')].map((i) => i.value),
  };
});
console.log('CREATE', created);

// Try buy rudokop again and dump full response HTML for hidden errors
await go('lic_mode_0_mask_768.html?actUser-BuyGLic=256&tm=0');
await sleep(2500);
const buyHtml = await page.evaluate(
  () => document.getElementById('d_act').contentWindow.document.body.innerHTML
);
fs.writeFileSync('_tmp_buy_result.html', buyHtml);
console.log('BUY TEXT', await text());
const err = buyHtml.match(/ошиб|недостаточно|чистот|уровень|не можете|запрещ|нужно/gi);
console.log('BUY ERR HINTS', err);

// Cash check via bank
await go('bank.html');
console.log('CASH', await text());

process.exit(0);
