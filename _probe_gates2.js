/**
 * Dig into gates group page HTML + wait for auto-enter; dump pers/level.
 */
import {
  launchBrowser,
  ensureLoggedIn,
  getActFrame,
  saveState,
  log,
  sleep,
} from './src/browser.js';
import fs from 'fs';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) throw new Error('no d_act');
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function actHtml(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return null;
    return {
      href: w.location.href,
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2000),
      html: (w.document.body?.innerHTML || '').slice(0, 12000),
      cu: !!(w.cu && w.gd),
    };
  });
}

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  // level from pers frame
  const pers = await page.evaluate(() => {
    const w = document.getElementById('d_pers')?.contentWindow;
    if (!w?.document) return { err: 'no pers' };
    return {
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
      html: (w.document.body?.innerHTML || '').slice(0, 3000),
    };
  });
  console.log('PERS', JSON.stringify(pers, null, 2));

  await goAct(page, 'gates.html');
  // create if not already
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return;
    const cancel = [...w.document.querySelectorAll('input,a')].find((n) =>
      /отозвать/i.test(n.value || n.textContent || '')
    );
    if (cancel) return;
    const form = w.document.forms[0];
    if (form) {
      const ul = form.querySelector('[name=ulimit]');
      if (ul) ul.value = '1';
      form.submit();
    }
  });
  await sleep(2500);

  for (let i = 0; i < 12; i++) {
    // reload act
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (typeof w.actReload === 'function') w.actReload();
        else if (typeof w.goRC === 'function') w.goRC(w.location.pathname.split('/').pop());
      } catch (e) {}
    });
    await sleep(4000);
    const d = await actHtml(page);
    log('t', i, 'href', d?.href, 'cu', d?.cu, 'text', d?.text?.slice(0, 250));
    fs.writeFileSync('_tmp_gates_html.html', d?.html || '');
    if (d?.cu) {
      log('ENTERED FOREST CLIENT');
      break;
    }
    // try any new buttons
    const click = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (!w?.document) return null;
      const nodes = [...w.document.querySelectorAll('input,button,a,[onclick]')];
      for (const n of nodes) {
        const t = ((n.value || '') + ' ' + (n.textContent || '') + ' ' + (n.getAttribute('onclick') || '')).trim();
        if (/выйти|войти в лес|в лес|старт|подтверд|готов|отправ|погрузить|телепорт/i.test(t)) {
          n.click();
          return t.slice(0, 120);
        }
      }
      return null;
    });
    if (click) log('clicked', click);
  }

  // teleports / fortposts pages
  for (const u of ['teleports.html', 'teleport.html', 'fortposts.html', 'clans.html', 'map.html']) {
    await goAct(page, u);
    const d = await actHtml(page);
    log('URL', u, '→', d?.href, d?.text?.slice(0, 200));
  }

  await saveState(context);
} catch (e) {
  console.error(e);
} finally {
  await browser.close().catch(() => {});
}
