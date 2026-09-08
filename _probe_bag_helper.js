/**
 * Dump bag / magic bag contents during battle for helper spell/scroll.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  // resume whatever battle or apps
  await page.evaluate(() => {
    document.getElementById('d_act').src =
      'https://5kings.ru/arena_room_1_bmode_36_lvl_-1_smode_0_itype_0.html?xdac=' + Math.random();
  });
  await sleep(2000);
  for (let i = 0; i < 25; i++) {
    const s = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const join = w?.document?.querySelector('input[name="actBattle-Join"]');
      if (join && !w.BID) {
        const f = join.form;
        const b = f && [...f.querySelectorAll('input[type=submit]')].find((x) => /принять|войти/i.test(x.value || ''));
        if (b?.form?.requestSubmit) b.form.requestSubmit(b);
        else b?.click();
      }
      return { BID: w?.BID, your: /ваш ход/i.test((w?.document?.getElementById('TurnLabel') || {}).innerText || '') };
    });
    if (s.BID && s.your) break;
    await sleep(1500);
  }

  const dump = await page.evaluate(async () => {
    const act = document.getElementById('d_act')?.contentWindow;
    const bid = act?.BID;
    const urls = [
      'bag.chtml',
      'bag_type_12_mode_0.html',
      'bag_type_13_mode_0.html',
      'bag_type_17_mode_0.html',
      'mbag.chtml',
      'magbook.chtml?bid=' + bid,
    ];
    const out = { bid, mp: act?.ME?.mp, rows: {} };
    for (const u of urls) {
      const r = await fetch('/' + u, { credentials: 'include' });
      const buf = await r.arrayBuffer();
      let t = '';
      try {
        t = new TextDecoder('windows-1251').decode(buf);
      } catch (e) {
        t = new TextDecoder('utf-8').decode(buf);
      }
      const textish = t
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
      out.rows[u] = {
        len: buf.byteLength,
        helper: /помощ|Вызвать|свиток/i.test(t),
        makeCast: /MakeCast/i.test(t),
        forms: [...t.matchAll(/id=["']form(\d+)["']/gi)].map((m) => m[1]).slice(0, 20),
        snippet: textish.slice(0, 600),
        titles: [...t.matchAll(/title=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 40),
        alts: [...t.matchAll(/alt=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 40),
      };
    }
    return out;
  });
  fs.writeFileSync('_tmp_bag_helper_dump.json', JSON.stringify(dump, null, 2));
  console.log(JSON.stringify(dump, null, 2));
} finally {
  await browser.close().catch(() => {});
}
