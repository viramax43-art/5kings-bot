/**
 * Live: leave big forest if needed, open KH apps, create/join.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no d_act' };
    const doc = w.document;
    const href = String(w.location?.href || '');
    const gd = w.global_data || {};
    const g = gd.my_group || {};
    return {
      href,
      file: href.split('/').pop(),
      forestUi: !!(
        doc.getElementById('vorota') ||
        doc.querySelector('input[name="actNewMaps-ChangeView"]') ||
        (doc.getElementById('canvas') && typeof w.StartDobycha === 'function')
      ),
      create: !!doc.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: [...doc.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value),
      inApp: /вы в заявке|ожидайте начала|покинуть заявку/i.test(doc.body?.innerText || ''),
      wait_event: gd.wait_event,
      stay: g.stay,
      text: (doc.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
    };
  });
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
const out = { at: new Date().toISOString(), steps: [] };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  out.start = await snap(page);
  log('start', out.start.file, 'forest', out.start.forestUi, 'create', out.start.create, 'we', out.start.wait_event, 'stay', out.start.stay);

  if (out.start.forestUi) {
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const we = Number(w.global_data && w.global_data.wait_event);
      if (we === 2 || we === 3 || we === 4) {
        w.Client.send('actNewMaps-CancelEvent=' + (we === 2 ? '2' : '3'));
      }
    });
    for (let i = 0; i < 25; i++) {
      const s = await snap(page);
      if (!s.forestUi || (Number(s.stay) !== 0 && Number(s.wait_event) !== 2 && Number(s.wait_event) !== 3 && Number(s.wait_event) !== 4))
        break;
      await sleep(400);
    }
    const leave = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const we = Number(w.global_data && w.global_data.wait_event);
      if (we === 1) return 'already-exiting';
      const old = w.confirm;
      w.confirm = () => true;
      try {
        if (w.Client && typeof w.Client.send === 'function') {
          w.Client.send('actNewMaps-ReturnToTown=1');
          return 'send-ReturnToTown';
        }
        if (typeof w.TryReturnToTown === 'function') {
          w.TryReturnToTown();
          return 'TryReturnToTown';
        }
      } finally {
        w.confirm = old;
      }
      return 'no-leave';
    });
    log('leave', leave);
    out.leaveHow = leave;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      const s = await snap(page);
      if (i % 10 === 0) log('wait-leave', i, s.file, 'forest', s.forestUi, 'we', s.wait_event, 'stay', s.stay);
      if (!s.forestUi) {
        out.afterLeave = s;
        log('left forest', s.file);
        break;
      }
    }
    if (!out.afterLeave) out.afterLeave = await snap(page);
  }

  if (!(out.afterLeave && (out.afterLeave.create || out.afterLeave.joins.length || out.afterLeave.inApp))) {
    await page.evaluate(() => {
      const el = document.getElementById('d_act');
      el.src =
        'https://5kings.ru/arena_room_1_bmode_36_lvl_-1_smode_0_itype_0.html?xdac=' + Math.random();
    });
  }
  let apps = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    apps = await snap(page);
    if (apps.forestUi) {
      log('apps still forest', apps.file);
      break;
    }
    if (apps.create || apps.joins.length || apps.inApp) break;
  }
  out.apps = apps;
  log('apps', apps.file, 'create', apps.create, 'joins', apps.joins.length, 'forest', apps.forestUi, 'inApp', apps.inApp);

  if (apps.create && !apps.joins.length && !apps.inApp) {
    const created = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const min = w.document.querySelector('[name="Battle{minlvl}"]');
      const max = w.document.querySelector('[name="Battle{maxlvl}"]');
      const mp = w.document.querySelector('[name="Battle{maxp}"]');
      if (min) min.value = '0';
      if (max) max.value = '50';
      if (mp) mp.value = '3';
      const btn = w.document.querySelector('input[name="actBattle-CreateHeader"]');
      if (!btn) return { ok: false, why: 'no-btn' };
      if (btn.form && btn.form.requestSubmit) btn.form.requestSubmit(btn);
      else btn.click();
      return { ok: true };
    });
    log('create click', created);
    out.createClick = created;
    await sleep(3500);
    out.afterCreate = await snap(page);
    log('afterCreate', out.afterCreate.file, 'inApp', out.afterCreate.inApp, 'create', out.afterCreate.create);
  }

  out.ok = !!(
    out.apps &&
    (out.apps.create || out.apps.joins.length || out.apps.inApp) &&
    !out.apps.forestUi
  );
} catch (e) {
  out.error = String(e.stack || e);
  console.error(out.error);
} finally {
  fs.writeFileSync('_tmp_chaos_create_live.json', JSON.stringify(out, null, 2));
  console.log('OK', out.ok, 'report _tmp_chaos_create_live.json');
  await browser.close().catch(() => {});
}
process.exit(out.ok ? 0 : 1);
