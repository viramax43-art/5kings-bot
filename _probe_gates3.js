import { launchBrowser, ensureLoggedIn, getActFrame, log, sleep, saveState } from './src/browser.js';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function dump(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w?.document) return null;
    return {
      href: w.location.href,
      text: (w.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
      inputs: [...w.document.querySelectorAll('input,select,button')].map((el) => ({
        type: el.type,
        name: el.name,
        value: el.value,
        text: (el.textContent || '').trim().slice(0, 40),
      })),
      forms: [...w.document.forms].map((f) => f.outerHTML.slice(0, 800)),
      readyBig: !!(w.Client && w.global_data && w.global_data.my_group),
      bigApi: typeof w.StartDobycha === 'function',
    };
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

  for (const gate of ['gates.html', 'gates_mode_1.html', 'gates_mode_2.html', 'gates_mode_3.html']) {
    await goAct(page, gate);
    console.log('---', gate, JSON.stringify(await dump(page), null, 2));
  }

  await goAct(page, 'gates.html');
  const clicked = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w.document;
    // cancel old
    const cancel = [...doc.querySelectorAll('input')].find((n) => /отозвать/i.test(n.value || ''));
    if (cancel) {
      cancel.click();
      return { cancel: true };
    }
    const ul = doc.querySelector('[name=ulimit]');
    const min = doc.querySelector('[name=minlvl]');
    const max = doc.querySelector('[name=maxlvl]');
    if (ul) ul.value = '1';
    if (min) min.value = '3';
    if (max) max.value = '50';
    const btn = [...doc.querySelectorAll('input[type=submit]')].find((n) =>
      /подать|заявк/i.test(n.value || '')
    );
    if (btn) {
      btn.click();
      return { submitBtn: btn.value };
    }
    if (doc.forms[0]) {
      doc.forms[0].submit();
      return { formSubmit: true };
    }
    return { fail: true };
  });
  log('click', clicked);
  await sleep(3000);
  console.log('AFTER', JSON.stringify(await dump(page), null, 2));

  for (let i = 0; i < 20; i++) {
    await sleep(3000);
    const d = await dump(page);
    log(i, d.href, 'ready', d.readyBig, 'bigApi', d.bigApi, d.text?.slice(0, 120));
    if (d.readyBig) break;
    // reload
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (typeof w.actReload === 'function') w.actReload();
      } catch (e) {}
    });
  }
  await saveState(context);
} finally {
  await browser.close().catch(() => {});
}
