/**
 * Probe which chaos-room URLs actually have CreateHeader / Join.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

async function dump(page, label) {
  const d = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no d_act' };
    const doc = w.document;
    const href = w.location?.href || '';
    const create = !!doc.querySelector('input[name="actBattle-CreateHeader"]');
    const joins = [...doc.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value);
    const btns = [...doc.querySelectorAll('input[type=button],input[type=submit],button')].map((b) => ({
      v: (b.value || b.textContent || '').trim().slice(0, 40),
      n: b.name || '',
      on: (b.getAttribute('onclick') || '').slice(0, 80),
    }));
    return {
      href,
      file: href.split('/').pop(),
      create,
      joins,
      actReload: typeof w.actReload,
      goRC: typeof w.goRC,
      text: (doc.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 280),
      btns: btns.slice(0, 20),
      createVal: (doc.querySelector('input[name="actBattle-CreateHeader"]') || {}).value || null,
    };
  });
  log(label, JSON.stringify({ file: d.file, create: d.create, joins: d.joins?.length, actReload: d.actReload, text: d.text?.slice(0, 120) }));
  return d;
}

async function go(page, url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2800);
}

const { browser, context, page } = await launchBrowser();
const out = { at: new Date().toISOString(), pages: [] };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  const urls = [
    'arenax.html',
    'arena_room_1_bmode_36.html',
    'arena_room_1_bmode_36_smode_0.html',
    'arena_room_1_bmode_36_lvl_-1_smode_0_itype_0.html',
    'arena_room_1_bmode_36_smode_1.html',
  ];
  for (const u of urls) {
    await go(page, u);
    const d = await dump(page, u);
    d.asked = u;
    out.pages.push(d);
  }

  // actReload from room page
  await go(page, 'arena_room_1_bmode_36.html');
  const before = await dump(page, 'before-reload');
  const reloaded = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      if (typeof w.actReload === 'function') {
        w.refreshed = false;
        w.actReload();
        return 'actReload';
      }
    } catch (e) {
      return String(e);
    }
    return 'no-actReload';
  });
  await sleep(3000);
  const after = await dump(page, 'after-reload');
  out.reload = { before, reloaded, after };

  fs.writeFileSync('_tmp_chaos_urls.json', JSON.stringify(out, null, 2));
  console.log('WROTE _tmp_chaos_urls.json');
} finally {
  await browser.close().catch(() => {});
}
