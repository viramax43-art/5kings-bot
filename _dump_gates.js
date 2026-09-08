import { launchBrowser, ensureLoggedIn, getActFrame, sleep } from './src/browser.js';
import fs from 'fs';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
await ensureLoggedIn(page, context);
await getActFrame(page);
await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (typeof w.goRC === 'function') w.goRC('gates.html');
  else w.location.href = 'gates.html';
});
await sleep(3000);
const info = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  return {
    href: w.location.href,
    forms: [...doc.forms].map((f, i) => ({
      i,
      name: f.name,
      id: f.id,
      action: f.action,
      method: f.method,
      html: f.outerHTML.slice(0, 1200),
      fields: [...f.elements].map((e) => ({
        tag: e.tagName,
        name: e.name,
        type: e.type,
        value: (e.value || '').slice(0, 40),
        id: e.id,
      })),
    })),
    allSelects: [...doc.querySelectorAll('select')].map((s) => ({
      name: s.name,
      id: s.id,
      inForm: !!s.form,
      options: [...s.options].map((o) => o.value).slice(0, 10),
    })),
  };
});
fs.writeFileSync('_tmp_gates_forms.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
await browser.close();
