/**
 * Probe magbook.chtml / bmbook.html / mbag.chtml structure (logged in).
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep } from './src/browser.js';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function dump(page, label) {
  const d = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return { err: 'no act' };
    const body = w.document.body;
    const rows = [...w.document.querySelectorAll('tr,a,input,button,span,div')].slice(0, 200);
    const items = rows
      .map((el) => ({
        tag: el.tagName,
        text: (el.innerText || el.value || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        onclick: (el.getAttribute('onclick') || '').slice(0, 150),
        href: el.getAttribute('href') || '',
      }))
      .filter((x) => x.text || x.onclick || x.href);
    return {
      href: w.location.href,
      text: (body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1500),
      items: items.slice(0, 80),
      html: (body?.innerHTML || '').slice(0, 8000),
    };
  });
  fs.writeFileSync(`_tmp_probe_${label}.html`, d.html || '');
  console.log('\n===', label, '===', d.href);
  console.log(d.text?.slice(0, 400));
  console.log(
    'items',
    JSON.stringify(
      d.items.filter((x) => /маг|помощ|spell|Use|book|книг/i.test(x.text + x.onclick)),
      null,
      2
    )
  );
  return d;
}

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  for (const u of ['magbook.chtml', 'bmbook.html', 'mbag.chtml', 'arena_room_1_bmode_36.html']) {
    await goAct(page, u);
    await dump(page, u.replace(/[^\w]/g, '_'));
  }
} finally {
  await browser.close().catch(() => {});
}
