/**
 * Live: open KH, join/create, dump magbook content (iframe + fetch) during battle.
 */
import fs from 'fs';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const APPS = 'arena_room_1_bmode_36_lvl_-1_smode_0_itype_0.html';
const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
const out = { at: new Date().toISOString() };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  await page.evaluate((u) => {
    document.getElementById('d_act').src = 'https://5kings.ru/' + u + '?xdac=' + Math.random();
  }, APPS);
  await sleep(2500);

  const room = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w.document;
    return {
      file: String(w.location.href).split('/').pop(),
      create: !!doc.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: [...doc.querySelectorAll('input[name="actBattle-Join"]')].map((j) => j.value),
      inApp: /вы в заявке|ожидайте начала|покинуть/i.test(doc.body?.innerText || ''),
    };
  });
  out.room = room;
  log('room', room);

  if (!room.inApp) {
    if (room.joins.length) {
      await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const join = w.document.querySelector('input[name="actBattle-Join"]');
        const form = join?.form;
        const btn = form && [...form.querySelectorAll('input[type=submit]')].find((b) => /принять|войти/i.test(b.value || ''));
        if (btn && form.requestSubmit) form.requestSubmit(btn);
        else if (btn) btn.click();
        else form?.submit();
      });
    } else if (room.create) {
      await page.evaluate(() => {
        const w = document.getElementById('d_act')?.contentWindow;
        const min = w.document.querySelector('[name="Battle{minlvl}"]');
        const max = w.document.querySelector('[name="Battle{maxlvl}"]');
        const mp = w.document.querySelector('[name="Battle{maxp}"]');
        if (min) min.value = '0';
        if (max) max.value = '50';
        if (mp) mp.value = '3';
        const btn = w.document.querySelector('input[name="actBattle-CreateHeader"]');
        if (btn?.form?.requestSubmit) btn.form.requestSubmit(btn);
        else btn?.click();
      });
    }
  }

  let battle = null;
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    battle = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        BID: w?.BID || null,
        href: String(w?.location?.href || '').split('/').pop(),
        label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
        hp: w?.ME?.hp,
        btns: w?.document
          ? [...w.document.querySelectorAll('input[type=button],button,a')]
              .map((b) => (b.value || b.textContent || '').trim() + '|' + (b.getAttribute('onclick') || '').slice(0, 80))
              .filter((t) => /маг|книг|закл|mag|book/i.test(t))
              .slice(0, 20)
          : [],
      };
    });
    if (i % 10 === 0) log('waitB', i, battle.BID, battle.label, battle.href);
    if (battle.BID) break;
  }
  out.battle = battle;
  if (!battle?.BID) {
    out.error = 'no battle';
    throw new Error('no battle');
  }

  const dump = await page.evaluate(async (bid) => {
    const act = document.getElementById('d_act')?.contentWindow;
    const urls = [
      '/magbook.chtml?bid=' + bid,
      '/magbook.chtml',
      'magbook.chtml?bid=' + bid,
      '/mbag.chtml?bid=' + bid,
      '/bmbook.html?bid=' + bid,
    ];
    const fetches = [];
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'include' });
        const t = await r.text();
        const forms = [...t.matchAll(/id=["']form(\d+)["']/gi)].map((m) => m[1]);
        const casts = [...t.matchAll(/MakeCast\s*\(\s*(\d+)/gi)].map((m) => m[1]);
        const hasHelper = /помощ|Вызвать|pomosh|helper|familiar|ïîìîù/i.test(t);
        fetches.push({
          u,
          status: r.status,
          len: t.length,
          forms: forms.slice(0, 30),
          casts: casts.slice(0, 30),
          hasHelper,
          sample: t.replace(/\s+/g, ' ').slice(0, 400),
          // decode hint: title bytes
          title: (t.match(/<title>([^<]*)<\/title>/i) || [])[1] || '',
        });
      } catch (e) {
        fetches.push({ u, err: String(e) });
      }
    }

    // iframe open like bot
    let iframe = document.getElementById('k5-magbook-probe');
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'k5-magbook-probe';
      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:500px;height:400px;z-index:99999;background:#fff';
      document.body.appendChild(iframe);
    }
    iframe.src = 'https://5kings.ru/magbook.chtml?bid=' + bid + '&xdac=' + Math.random();
    await new Promise((r) => setTimeout(r, 3500));
    let iframeDump = null;
    try {
      const doc = iframe.contentDocument;
      const body = doc?.body;
      const text = (body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800);
      const html = (body?.innerHTML || '').slice(0, 5000);
      const forms = [...(doc?.querySelectorAll('form[id^="form"]') || [])].map((f) => f.id);
      const casts = [...(doc?.querySelectorAll('[onclick*="MakeCast"]') || [])].map((el) => ({
        on: el.getAttribute('onclick'),
        t: ((el.closest('tr') || el).innerText || '').replace(/\s+/g, ' ').slice(0, 120),
        html: ((el.closest('tr') || el).innerHTML || '').slice(0, 200),
      }));
      iframeDump = {
        forms,
        casts,
        text,
        htmlLen: (body?.innerHTML || '').length,
        hasMakeCast: typeof iframe.contentWindow.MakeCast,
        opener: typeof iframe.contentWindow.opener,
      };
      // also list all img titles/alts
      iframeDump.imgs = [...(doc?.querySelectorAll('img') || [])]
        .map((img) => ({ alt: img.alt, title: img.title, src: (img.src || '').split('/').pop() }))
        .filter((x) => x.alt || x.title)
        .slice(0, 40);
    } catch (e) {
      iframeDump = { err: String(e) };
    }

    // try popup
    let popDump = null;
    try {
      const pop = act.open('https://5kings.ru/magbook.chtml?bid=' + bid + '&xdac=' + Math.random(), 'MAGBOOK', 'width=800,height=600');
      await new Promise((r) => setTimeout(r, 3000));
      if (!pop) popDump = { blocked: true };
      else {
        const doc = pop.document;
        popDump = {
          forms: [...(doc?.querySelectorAll('form[id^="form"]') || [])].map((f) => f.id),
          text: (doc?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
          casts: [...(doc?.querySelectorAll('[onclick*="MakeCast"]') || [])].length,
          MakeCast: typeof pop.MakeCast,
        };
        try {
          pop.close();
        } catch (_) {}
      }
    } catch (e) {
      popDump = { err: String(e) };
    }

    return { fetches, iframeDump, popDump, bid };
  }, battle.BID);

  out.dump = dump;
  fs.writeFileSync('_tmp_magbook_live_dump.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(dump, null, 2).slice(0, 6000));
  log('OK dump written');
} catch (e) {
  out.error = String(e.stack || e);
  console.error(out.error);
  fs.writeFileSync('_tmp_magbook_live_dump.json', JSON.stringify(out, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(out.dump ? 0 : 1);
