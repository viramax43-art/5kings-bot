/**
 * Deep dump magbook/mbag/bmbook + network during your turn.
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
const net = [];
page.on('response', async (res) => {
  const u = res.url();
  if (/magbook|mbag|bmbook|mag|spell|cast|book/i.test(u)) {
    let len = 0;
    try {
      len = (await res.text()).length;
    } catch (_) {}
    net.push({ u: u.slice(0, 120), status: res.status(), len });
  }
});

const out = { at: new Date().toISOString(), net };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  await page.evaluate((u) => {
    document.getElementById('d_act').src = 'https://5kings.ru/' + u + '?xdac=' + Math.random();
  }, APPS);
  await sleep(2500);

  // wait existing battle from previous probe or join
  let bid = null;
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const join = w?.document?.querySelector('input[name="actBattle-Join"]');
      if (join && !w.BID) {
        const form = join.form;
        const btn = form && [...form.querySelectorAll('input[type=submit]')].find((b) => /принять|войти/i.test(b.value || ''));
        if (btn && form.requestSubmit) form.requestSubmit(btn);
        else if (btn) btn.click();
      }
      return {
        BID: w?.BID || null,
        your: /ваш ход/i.test((w?.document?.getElementById('TurnLabel') || {}).innerText || ''),
        label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
      };
    });
    if (i % 5 === 0) log('wait', i, s);
    if (s.BID) {
      bid = s.BID;
      if (s.your) break;
    }
    await sleep(1500);
  }
  out.bid = bid;
  if (!bid) throw new Error('no bid');

  // Wait your turn a bit
  for (let i = 0; i < 30; i++) {
    const your = await page.evaluate(() =>
      /ваш ход/i.test(
        (document.getElementById('d_act')?.contentWindow?.document?.getElementById('TurnLabel') || {}).innerText || ''
      )
    );
    if (your) break;
    await sleep(1000);
  }

  const dump = await page.evaluate(async (bid) => {
    const act = document.getElementById('d_act')?.contentWindow;
    // Click Магия button if present (opens mbag)
    const magicBtn = [...(act.document.querySelectorAll('input[type=button]') || [])].find((b) =>
      /маг/i.test(b.value || '')
    );

    function scrape(doc, label) {
      if (!doc) return { label, err: 'no doc' };
      const forms = [...doc.querySelectorAll('form')].map((f) => ({
        id: f.id,
        action: f.getAttribute('action'),
        html: f.outerHTML.slice(0, 300),
      }));
      const clicks = [...doc.querySelectorAll('[onclick]')].map((el) => ({
        on: (el.getAttribute('onclick') || '').slice(0, 120),
        t: ((el.innerText || el.value || '') + '').replace(/\s+/g, ' ').slice(0, 80),
      }));
      const imgs = [...doc.querySelectorAll('img')].map((img) => ({
        alt: img.alt,
        title: img.title,
        src: (img.getAttribute('src') || '').slice(0, 80),
      }));
      return {
        label,
        title: doc.title,
        text: (doc.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1000),
        forms,
        clicks: clicks.slice(0, 40),
        imgs: imgs.filter((x) => x.alt || x.title || /spell|mag|scroll|pomosh|помощ/i.test(x.src)).slice(0, 40),
        htmlLen: (doc.body?.innerHTML || '').length,
        html: (doc.body?.innerHTML || '').slice(0, 8000),
      };
    }

    const pages = {};
    for (const path of [
      'magbook.chtml?bid=' + bid,
      'mbag.chtml?bid=' + bid,
      'bmbook.html?bid=' + bid,
      'magbook.chtml',
      'mbag.chtml',
    ]) {
      const r = await fetch('/' + path.replace(/^\//, ''), { credentials: 'include' });
      const buf = await r.arrayBuffer();
      // try decode windows-1251
      let t1251 = '';
      try {
        t1251 = new TextDecoder('windows-1251').decode(buf);
      } catch (e) {
        t1251 = new TextDecoder('utf-8').decode(buf);
      }
      pages[path] = {
        status: r.status,
        len: buf.byteLength,
        hasForm: /form\d+|MakeCast/i.test(t1251),
        hasHelper: /помощ|Вызвать|pomosh/i.test(t1251),
        snippet: t1251.replace(/\s+/g, ' ').slice(0, 500),
        formIds: [...t1251.matchAll(/id=["']form(\d+)["']/gi)].map((m) => m[1]),
        makeCasts: [...t1251.matchAll(/MakeCast\s*\(\s*(\d+)/gi)].map((m) => m[1]),
      };
    }

    // Open magbook as child of act (like real button pattern) via iframe inside act document
    let actIframeDump = null;
    try {
      const ifr = act.document.createElement('iframe');
      ifr.id = 'k5probe';
      ifr.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px;z-index:99;background:#fff';
      act.document.body.appendChild(ifr);
      ifr.src = 'magbook.chtml?bid=' + bid + '&xdac=' + Math.random();
      await new Promise((r) => setTimeout(r, 4000));
      actIframeDump = scrape(ifr.contentDocument, 'act-iframe-magbook');
    } catch (e) {
      actIframeDump = { err: String(e) };
    }

    // mbag via iframe in act
    let mbagDump = null;
    try {
      const ifr2 = act.document.createElement('iframe');
      ifr2.id = 'k5probe2';
      ifr2.style.cssText = 'position:fixed;left:0;top:420px;width:600px;height:400px;z-index:99;background:#fff';
      act.document.body.appendChild(ifr2);
      ifr2.src = 'mbag.chtml?bid=' + bid + '&xdac=' + Math.random();
      await new Promise((r) => setTimeout(r, 4000));
      mbagDump = scrape(ifr2.contentDocument, 'act-iframe-mbag');
    } catch (e) {
      mbagDump = { err: String(e) };
    }

    // bmbook
    let bmDump = null;
    try {
      const ifr3 = act.document.createElement('iframe');
      ifr3.id = 'k5probe3';
      ifr3.src = 'bmbook.html?bid=' + bid + '&xdac=' + Math.random();
      act.document.body.appendChild(ifr3);
      await new Promise((r) => setTimeout(r, 4000));
      bmDump = scrape(ifr3.contentDocument, 'act-iframe-bmbook');
    } catch (e) {
      bmDump = { err: String(e) };
    }

    return {
      magicBtn: magicBtn ? magicBtn.value + '|' + magicBtn.getAttribute('onclick') : null,
      pages,
      actIframeDump,
      mbagDump,
      bmDump,
      me: act.ME ? { mp: act.ME.mp, hp: act.ME.hp, tn: act.ME.tn } : null,
    };
  }, bid);

  out.dump = dump;
  fs.writeFileSync('_tmp_magbook_deep.json', JSON.stringify(out, null, 2));
  fs.writeFileSync('_tmp_magbook_act_iframe.html', dump.actIframeDump?.html || '');
  fs.writeFileSync('_tmp_mbag_act_iframe.html', dump.mbagDump?.html || '');
  fs.writeFileSync('_tmp_bmbook_act_iframe.html', dump.bmDump?.html || '');
  console.log(
    JSON.stringify(
      {
        magicBtn: dump.magicBtn,
        me: dump.me,
        pages: dump.pages,
        mag: { forms: dump.actIframeDump?.forms?.length, text: dump.actIframeDump?.text?.slice(0, 200), clicks: dump.actIframeDump?.clicks?.slice(0, 10) },
        mbag: { forms: dump.mbagDump?.forms?.length, text: dump.mbagDump?.text?.slice(0, 200), clicks: dump.mbagDump?.clicks?.slice(0, 10), imgs: dump.mbagDump?.imgs?.slice(0, 10) },
        bm: { forms: dump.bmDump?.forms?.length, text: dump.bmDump?.text?.slice(0, 200), clicks: dump.bmDump?.clicks?.slice(0, 10) },
        net: net.slice(0, 30),
      },
      null,
      2
    )
  );
} catch (e) {
  out.error = String(e.stack || e);
  console.error(out.error);
  fs.writeFileSync('_tmp_magbook_deep.json', JSON.stringify(out, null, 2));
} finally {
  await browser.close().catch(() => {});
}
