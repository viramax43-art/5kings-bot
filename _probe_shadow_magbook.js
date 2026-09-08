/**
 * Start shadow fight and dump magbook/mbag spell HTML during battle.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, sleep, log } from './src/browser.js';

async function go(page, url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2500);
}

async function clickMatch(page, re) {
  return page.evaluate((src) => {
    const w = document.getElementById('d_act')?.contentWindow;
    const rx = new RegExp(src, 'i');
    for (const el of [...w.document.querySelectorAll('input,button,a')]) {
      const t = (el.value || '') + (el.textContent || '') + (el.getAttribute('onclick') || '');
      if (rx.test(t)) {
        el.click();
        return t.slice(0, 120);
      }
    }
    return null;
  }, re.source);
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await go(page, 'arenax.html');
  const rooms = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const out = [];
    for (const td of [...w.document.querySelectorAll('td')]) {
      const btn = td.querySelector('input[type=button],button');
      if (!btn) continue;
      const label = (btn.value || btn.textContent || '').trim();
      if (!/комнат/i.test(label)) continue;
      const oc = btn.getAttribute('onclick') || '';
      const m = oc.match(/goRC\s*\(\s*['"]([^'"]+)['"]\s*\)/i);
      if (m) out.push({ label, url: m[1] });
    }
    return out;
  });
  log('rooms', rooms.length);
  const room = rooms.find((r) => /room_3|room_2|room_1/i.test(r.url)) || rooms[0];
  if (room) {
    log('room', room.label, room.url);
    await go(page, room.url);
  }
  const clicked = await clickMatch(page, /тень|StartBattleWithShadow/i);
  log('shadow click', clicked);
  await sleep(8000);

  const d = await page.evaluate(async () => {
    const w = document.getElementById('d_act')?.contentWindow;
    const st = {
      href: w?.location?.href,
      BID: w?.BID,
      MakeTurn: typeof w?.MakeTurn,
      btns: w?.document
        ? [...w.document.querySelectorAll('input[type=button]')].map((b) => ({
            v: b.value,
            on: (b.getAttribute('onclick') || '').slice(0, 160),
          }))
        : [],
    };
    if (!w?.BID) return st;

    const dump = (url) =>
      new Promise((res) => {
        const pop = w.open(url + '?xdac=' + Math.random(), 'T', 'width=850,height=650,scrollbars=1');
        setTimeout(() => {
          try {
            const html = pop?.document?.body?.innerHTML || '';
            const hits = [...html.matchAll(/MakeCast\([^)]*\)|form\d+|помощник|Вызвать/gi)].map((m) => m[0]).slice(0, 30);
            res({ url, len: html.length, hits, html: html.slice(0, 12000) });
          } catch (e) {
            res({ url, err: String(e.message || e) });
          }
        }, 3000);
      });

    st.books = await Promise.all([
      dump('/magbook.chtml'),
      dump('/magbook.chtml?bid=' + w.BID),
      dump('/mbag.chtml'),
    ]);
    return st;
  });

  console.log(
    JSON.stringify(
      {
        href: d.href,
        BID: d.BID,
        btns: d.btns,
        books: d.books?.map((b) => ({ url: b.url, len: b.len, hits: b.hits, err: b.err })),
      },
      null,
      2
    )
  );

  for (const b of d.books || []) {
    if (b.html) fs.writeFileSync('_tmp_live_' + String(b.url).replace(/[^\w]/g, '_') + '.html', b.html);
  }
} finally {
  await browser.close().catch(() => {});
}
