import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';
import fs from 'fs';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
await ensureLoggedIn(page, context);
await getActFrame(page);

async function go(url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2500);
}

async function snap() {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      href: w?.location?.href,
      ready: !!(w?.Client && g),
      my: g ? { x: g.posx, y: g.posy } : null,
      text: ((w?.document?.body?.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 300),
      forms: [...(w?.document?.forms || [])].map((f) => ({
        action: f.action,
        html: f.outerHTML.slice(0, 1000),
        fields: [...f.elements].map((e) => ({
          tag: e.tagName,
          name: e.name,
          type: e.type,
          value: (e.value || '').slice(0, 40),
        })),
      })),
    };
  });
}

// leave forest if inside
await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  try {
    w.Client?.send?.('actNewMaps-ReturnToTown=1');
  } catch (e) {}
  try {
    if (typeof w.TryReturnToTown === 'function') w.TryReturnToTown();
  } catch (e2) {}
});
await sleep(4000);
await go('place.html');
await go('gates.html');
let s = await snap();
log('gates', s.ready, s.text.slice(0, 150), 'forms', s.forms.length);
fs.writeFileSync('_tmp_gates_create.json', JSON.stringify(s, null, 2));

if (!s.ready && /Подать заявку|создайте свою группу/i.test(s.text)) {
  const r = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w.document;
    // find create form by hidden field
    const hidden = doc.querySelector('input[name="actNewMaps-CreateGroup"]');
    const form = hidden?.form || [...doc.forms].find((f) => /CreateGroup|ulimit|Подать/i.test(f.innerHTML));
    if (!form) {
      // click submit by value
      const btn = [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать/i.test(b.value || ''));
      if (btn) {
        // set nearby selects
        const root = btn.form || doc;
        const ul = root.querySelector('[name=ulimit]');
        if (ul) ul.value = '1';
        btn.click();
        return { clickedOrphan: btn.value, hasForm: !!btn.form };
      }
      return { no: true, body: doc.body.innerHTML.slice(0, 2000) };
    }
    const ul = form.querySelector('[name=ulimit]');
    if (ul) ul.value = '1';
    const btn = [...form.querySelectorAll('input[type=submit]')].find((b) => /подать/i.test(b.value || '')) ||
      form.querySelector('input[type=submit]');
    if (btn && form.requestSubmit) form.requestSubmit(btn);
    else if (btn) btn.click();
    else form.submit();
    return { ok: true, action: form.action, ul: ul?.value, btn: btn?.value, fields: [...form.elements].map((e) => e.name) };
  });
  log('create', r);
  for (let i = 0; i < 30; i++) {
    await sleep(2500);
    s = await snap();
    if (i % 3 === 0) log('wait', i, s.ready, (s.href || '').split('/').pop(), s.text.slice(0, 80));
    if (s.ready) break;
  }
}

fs.writeFileSync('_tmp_gates_after_create.json', JSON.stringify(s, null, 2));
console.log('FINAL ready', s.ready, s.my, s.href);
await browser.close();
