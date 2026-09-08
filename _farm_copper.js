/**
 * Buy Кирка рудокопа (shop id 2447), wear, mine copper.
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
import { hookForestLogs, dismissForestModal, getForestState } from './src/forest.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';
import { useHealScroll } from './src/inventory.js';
import { config } from './src/config.js';

const FARM_MS = Number(process.env.FARM_MS || 3 * 60 * 60 * 1000);
const PICK_ID = '2447';

config.forest.collectAll = true;
config.forest.types.trees = [];
config.forest.types.herbs = [];
config.forest.types.crystals = [];
config.forest.types.chests = [];
config.forest.types.iron = [];
config.forest.types.gold = [];
process.env.FORCE_ORE = '1';

async function go(page, url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(1800);
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  try {
    await d.accept();
  } catch (_) {}
});
const stop = { stopped: false };
process.on('SIGINT', () => {
  stop.stopped = true;
});

await ensureLoggedIn(page, context);

await go(page, 'bag_type_17_mode_0.html');
const already = await page.evaluate(() =>
  /кирк/i.test(document.getElementById('d_act')?.contentWindow?.document?.body?.innerText || '')
);
if (already) {
  log('Кирка уже в сумке');
} else {
await go(page, 'shop_type_17.html');
const opened = await page.evaluate((id) => {
  const act = document.getElementById('d_act').contentWindow;
  if (typeof act.butact === 'function') act.butact('0-' + id);
  const box = act.document.getElementById('0-' + id);
  return {
    has: !!box,
    display: box ? box.style.display : null,
    html: box ? box.innerHTML.slice(0, 400) : null,
  };
}, PICK_ID);
log('OPEN FORM', opened);
await sleep(500);

const ok = await page.evaluate((id) => {
  const act = document.getElementById('d_act').contentWindow;
  const box = act.document.getElementById('0-' + id);
  if (!box) return { ok: false };
  box.style.display = '';
  const btn = box.querySelector('input[value="OK"], input[value="Ok"], input[type=submit]');
  if (btn) {
    btn.click();
    return { ok: true, via: 'ok' };
  }
  const form = box.querySelector('form') || box.closest('form');
  if (form) {
    form.submit();
    return { ok: true, via: 'form' };
  }
  return { ok: false, html: box.innerHTML.slice(0, 300) };
}, PICK_ID);
log('SUBMIT', ok);
await sleep(2500);

await go(page, 'bank.html');
const cash = await page.evaluate(() =>
  (document.getElementById('d_act').contentWindow.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120)
);
log('CASH', cash);
}

await go(page, 'bag_type_17_mode_0.html');
const bag = await page.evaluate(() => {
  const act = document.getElementById('d_act').contentWindow;
  const html = act.document.body.innerHTML;
  const text = (act.document.body.innerText || '').replace(/\s+/g, ' ');
  const hasPick = /кирк/i.test(text + html);
  const wearBtn = [...act.document.querySelectorAll('input,button')].find((b) =>
    /надеть/i.test(b.value || b.textContent || '')
  );
  let worn = false;
  if (wearBtn) {
    wearBtn.click();
    worn = true;
  }
  return { hasPick, worn, text: text.slice(0, 400) };
});
log('BAG', bag);
await sleep(2000);

if (!bag.hasPick) {
  log('Кирка не в сумке — прерываю');
  await saveState(context);
  await browser.close();
  process.exit(5);
}

await go(page, 'place_street_4.html');
await go(page, 'forest.html');
await sleep(3000);

const t0 = Date.now();
log('Фарм меди старт', Math.round(FARM_MS / 60000), 'мин');

while (!stop.stopped && Date.now() - t0 < FARM_MS) {
  let frame = await getActFrame(page);
  if (await isBattleFrame(frame).catch(() => false)) {
    await runBattleLoop(frame, { stopSignal: stop });
    await go(page, 'forest.html');
    continue;
  }
  if (!/forest\.html/i.test(frame.url())) {
    await go(page, 'forest.html');
    frame = await getActFrame(page);
    await sleep(2000);
  }

  try {
    await hookForestLogs(frame);
    await dismissForestModal(frame);
  } catch (e) {
    log('frame lost', e.message);
    await sleep(3000);
    continue;
  }
  const st = await getForestState(frame, new Set(), new Set());
  const copper = (st.targets || []).filter((t) => t.imgType >= 7 && t.imgType <= 10);
  const target = copper[0] || (st.targets || [])[0];
  log('map add=', st.addCount, 'copper=', copper.length, 'target=', target);

  if (!target) {
    await sleep(8000);
    continue;
  }

  await frame.evaluate((abs) => {
    try {
      cu.selected = abs;
      cu.send('actHunter-StartCraft=' + abs);
    } catch (e) {}
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    const idx = abs - 1;
    const y = Math.floor(idx / 25);
    const x = idx % 25;
    const rect = canvas.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + x * 35 + 17,
      clientY: rect.top + y * 35 + 17,
      view: window,
    };
    canvas.dispatchEvent(new MouseEvent('click', opts));
    canvas.dispatchEvent(new MouseEvent('dblclick', opts));
  }, target.abs);

  const until = Date.now() + 200000;
  while (!stop.stopped && Date.now() < until) {
    await sleep(4000);
    await dismissForestModal(frame);
    const msgs = await frame.evaluate(() => {
      const m = window.__k5bot_msgs || [];
      window.__k5bot_msgs = [];
      return m;
    });
    for (const m of msgs) log(m.type === 3 ? '⚠' : '·', m.txt);
    if (msgs.some((m) => /успешн|добыт|рейтинг/i.test(m.txt || ''))) break;
    if (msgs.some((m) => /травм/i.test(m.txt || ''))) {
      log('Травма — лечу…');
      const healed = await useHealScroll(context, page);
      if (!healed) {
        await go(page, 'healer.html');
        const frameH = await getActFrame(page);
        await frameH.evaluate(() => {
          const btn = [...document.querySelectorAll('input,button,a')].find((b) =>
            /леч|вылеч|исцел|ок\b/i.test(`${b.value || ''} ${b.textContent || ''}`)
          );
          if (btn) btn.click();
        });
        await sleep(2000);
      }
      await go(page, 'forest.html');
      break;
    }
    if (msgs.some((m) => /нечего|необходим|не можете|инструмент/i.test(m.txt || ''))) break;
    frame = await getActFrame(page);
    if (await isBattleFrame(frame).catch(() => false)) break;
  }
}

await go(page, 'info.html?user=960792');
log(
  'INFO',
  await page.evaluate(() =>
    (document.getElementById('d_act').contentWindow.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 800)
  )
);
await saveState(context);
await browser.close();
