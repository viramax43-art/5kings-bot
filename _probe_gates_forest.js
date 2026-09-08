/**
 * Probe gates.html UI and try solo group → big forest.
 * Also dump character level.
 */
import {
  launchBrowser,
  ensureLoggedIn,
  getActFrame,
  saveState,
  log,
  sleep,
} from './src/browser.js';

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

async function dumpAct(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return { err: 'no' };
    const forms = [...w.document.forms].map((f, i) => ({
      i,
      action: f.action,
      method: f.method,
      html: f.outerHTML.slice(0, 2500),
    }));
    const inputs = [...w.document.querySelectorAll('input,select,button,a')].map((el) => ({
      tag: el.tagName,
      type: el.type || '',
      name: el.name || '',
      value: (el.value || '').slice(0, 80),
      text: (el.textContent || '').trim().slice(0, 80),
      onclick: (el.getAttribute('onclick') || '').slice(0, 120),
    }));
    return {
      href: w.location.href,
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200),
      forms: forms.slice(0, 8),
      inputs: inputs.slice(0, 60),
    };
  });
}

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  await goAct(page, 'info.html');
  log('INFO', JSON.stringify(await dumpAct(page), null, 2).slice(0, 2000));

  await goAct(page, 'gates.html');
  const g1 = await dumpAct(page);
  console.log('GATES1', JSON.stringify(g1, null, 2));

  // try create group size 1
  const created = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return { err: 'no' };
    // set size 1 if select/radio
    const sels = [...w.document.querySelectorAll('select,input')];
    for (const s of sels) {
      if (/числ|maxp|people|num|kol|size|group/i.test(s.name + s.id + (s.outerHTML || ''))) {
        try {
          s.value = '1';
        } catch (e) {}
      }
    }
    // click create / создать
    const nodes = [...w.document.querySelectorAll('input,button,a,[onclick]')];
    for (const n of nodes) {
      const t = (n.value || '') + ' ' + (n.textContent || '') + ' ' + (n.getAttribute('onclick') || '');
      if (/создать|создай|новая группа|выезд|выйти в лес|отправить/i.test(t)) {
        n.click();
        return { clicked: t.trim().slice(0, 150) };
      }
    }
    // submit first form
    if (w.document.forms[0]) {
      w.document.forms[0].submit();
      return { submitted: true };
    }
    return { clicked: null };
  });
  log('create', created);
  await sleep(3000);
  const g2 = await dumpAct(page);
  console.log('GATES2', JSON.stringify(g2, null, 2).slice(0, 4000));

  // look for join / enter forest buttons after create
  for (let i = 0; i < 5; i++) {
    const hit = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (!w?.document) return null;
      const nodes = [...w.document.querySelectorAll('input,button,a,[onclick]')];
      for (const n of nodes) {
        const t = (n.value || '') + ' ' + (n.textContent || '') + ' ' + (n.getAttribute('onclick') || '');
        if (/войти|выход|лес|старт|подтверд|готово|дальше|начать/i.test(t) && !/создать группу/i.test(t)) {
          n.click();
          return t.trim().slice(0, 150);
        }
      }
      return null;
    });
    log('step', i, hit);
    await sleep(2500);
    const snap = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (!w) return {};
      let city = false;
      try {
        const nodes = w.document.querySelectorAll('input,button,a,[onclick]');
        for (const n of nodes) {
          const t = (n.value || '') + (n.textContent || '') + (n.getAttribute('onclick') || '');
          if (/place_street_|на улицу/i.test(t)) city = true;
        }
      } catch (e) {}
      return {
        href: w.location.href,
        cu: !!(w.cu && w.gd),
        city,
        text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
      };
    });
    log('snap', snap);
    if (snap.cu && !snap.city) {
      log('BIG FOREST OK');
      break;
    }
  }

  await page.screenshot({ path: '_tmp_gates_probe.png' });
  await saveState(context);
} catch (e) {
  console.error(e);
} finally {
  await browser.close().catch(() => {});
}
