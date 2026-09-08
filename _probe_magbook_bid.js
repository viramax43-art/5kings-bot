/**
 * Fetch magbook/mbag with session + optional bid; join chaos if possible.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  const req = context.request;
  for (const url of [
    'https://5kings.ru/magbook.chtml',
    'https://5kings.ru/mbag.chtml',
    'https://5kings.ru/bmbook.html',
    'https://5kings.ru/magbook.chtml?bid=1',
  ]) {
    const r = await req.get(url);
    const body = await r.text();
    fs.writeFileSync('_tmp_fetch_' + url.split('/').pop().replace(/\W/g, '_') + '.html', body.slice(0, 50000));
    const spells = [...body.matchAll(/помощник|Вызвать|onclick|actMag|UseMag|magbook|bmbook|mbag|Использовать/gi)].slice(0, 20);
    console.log(url, r.status(), body.length, 'hits', spells.length);
    if (/помощник|Вызвать/i.test(body)) {
      const idx = body.search(/помощник|Вызвать/i);
      console.log('SNIP', body.slice(Math.max(0, idx - 200), idx + 400));
    }
  }

  // Try join chaos app
  await page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC('arena_room_1_bmode_36.html');
    else act.location.href = 'arena_room_1_bmode_36.html';
  });
  await sleep(3000);
  const joined = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const btn = [...w.document.querySelectorAll('input[type=submit],input[type=button]')].find((b) =>
      /присо|войти|в бой|начать/i.test(b.value || '')
    );
    if (btn) {
      btn.click();
      return btn.value;
    }
    return null;
  });
  log('join click', joined);
  await sleep(8000);
  const battle = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      href: w?.location?.href,
      BID: w?.BID,
      MakeTurn: typeof w?.MakeTurn,
      btns: w?.document
        ? [...w.document.querySelectorAll('input[type=button]')].map((b) => ({
            v: b.value,
            on: (b.getAttribute('onclick') || '').slice(0, 200),
          }))
        : [],
    };
  });
  console.log('BATTLE', JSON.stringify(battle, null, 2));
  if (battle.BID) {
    const r2 = await req.get('https://5kings.ru/magbook.chtml?bid=' + battle.BID);
    const body2 = await r2.text();
    fs.writeFileSync('_tmp_magbook_bid.html', body2);
    console.log('magbook bid', body2.length, body2.includes('помощник'), body2.slice(0, 500));
  }
} finally {
  await browser.close().catch(() => {});
}
