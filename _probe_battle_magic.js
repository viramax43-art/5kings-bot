/**
 * During shadow/battle: dump magic buttons + magbook/mbag/bmbook content.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';
import { isBattleFrame, runBattleLoop } from './src/battle.js';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function dumpBattleMagic(page) {
  return page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no act' };
    const btns = [...w.document.querySelectorAll('input[type=button],button')].map((b) => ({
      value: b.value || '',
      onclick: (b.getAttribute('onclick') || '').slice(0, 300),
    }));
    const openAndDump = (url, name) => {
      return new Promise((resolve) => {
        try {
          const pop = w.open(url + '?xdac=' + Math.random(), name, 'width=850,height=650,scrollbars=1,resizable=1');
          setTimeout(() => {
            try {
              if (!pop || !pop.document) return resolve({ url, err: 'no pop doc' });
              const text = (pop.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2000);
              const html = (pop.document.body?.innerHTML || '').slice(0, 12000);
              const clicks = [...pop.document.querySelectorAll('a,input,button,img,[onclick]')]
                .map((el) => ({
                  tag: el.tagName,
                  text: (el.innerText || el.value || el.title || el.alt || '').replace(/\s+/g, ' ').slice(0, 80),
                  onclick: (el.getAttribute('onclick') || '').slice(0, 200),
                  href: el.getAttribute('href') || '',
                }))
                .filter((x) => x.text || x.onclick || x.href);
              resolve({ url, text, clicks: clicks.slice(0, 40), html });
            } catch (e) {
              resolve({ url, err: String(e.message || e) });
            }
          }, 2500);
        } catch (e) {
          resolve({ url, err: String(e.message || e) });
        }
      });
    };
    const books = await Promise.all([
      openAndDump('/magbook.chtml', 'MAGBOOK'),
      openAndDump('/mbag.chtml', 'MAGIC'),
      openAndDump('/bmbook.html', 'BMBOOK'),
    ]);
    return { href: w.location.href, btns, books, hasME: !!w.ME, BID: w.BID };
  });
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  await goAct(page, 'arena_room_1.html');
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const btn = [...w.document.querySelectorAll('input,button')].find((b) => /тень/i.test(b.value || b.textContent || ''));
    if (btn) btn.click();
  });
  await sleep(5000);
  const frame = await getActFrame(page);
  const inBattle = await isBattleFrame(frame);
  log('inBattle', inBattle);
  const d = await dumpBattleMagic(page);
  console.log(JSON.stringify(d, null, 2));
  for (const b of d.books || []) {
    if (b.html) fs.writeFileSync('_tmp_battle_' + (b.url || 'book').replace(/[^\w]/g, '_') + '.html', b.html);
  }
} finally {
  await browser.close().catch(() => {});
}
