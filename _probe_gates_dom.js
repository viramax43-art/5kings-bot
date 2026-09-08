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

await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  try {
    w.Client?.send?.('actNewMaps-ReturnToTown=1');
  } catch (e) {}
});
await sleep(3000);
await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (typeof w.goRC === 'function') w.goRC('gates.html');
  else w.location.href = 'gates.html';
});
await sleep(3000);

const info = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  const hidden = doc.querySelector('input[name="actNewMaps-CreateGroup"]');
  const ul = doc.querySelector('[name=ulimit]');
  const btn = [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать/i.test(b.value || ''));
  return {
    href: w.location.href,
    bodySlice: doc.body.innerHTML.slice(0, 4000),
    hidden: hidden
      ? {
          parent: hidden.parentElement?.tagName,
          form: !!hidden.form,
          formAction: hidden.form?.action,
          formHTML: hidden.form?.outerHTML?.slice(0, 500),
        }
      : null,
    ul: ul
      ? {
          tag: ul.tagName,
          value: ul.value,
          form: !!ul.form,
          parent: ul.parentElement?.tagName,
        }
      : null,
    btn: btn
      ? {
          value: btn.value,
          form: !!btn.form,
          formAction: btn.form?.action,
          onclick: btn.getAttribute('onclick'),
        }
      : null,
  };
});
fs.writeFileSync('_tmp_gates_dom.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify({ href: info.href, hidden: info.hidden, ul: info.ul, btn: info.btn }, null, 2));
console.log('BODY\n', info.bodySlice.slice(0, 2000));

// Try click submit properly with FormData / requestSubmit
const sub = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  const btn = [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать/i.test(b.value || ''));
  const ul = doc.querySelector('[name=ulimit]');
  const min = doc.querySelector('[name=minlvl]');
  const max = doc.querySelector('[name=maxlvl]');
  if (ul) ul.value = '1';
  if (min) min.value = '3';
  if (max) max.value = '50';
  if (!btn) return { err: 'no btn' };
  if (btn.form && btn.form.requestSubmit) {
    btn.form.requestSubmit(btn);
    return { via: 'requestSubmit', action: btn.form.action };
  }
  btn.click();
  return { via: 'click' };
});
log('sub', sub);
await sleep(5000);
const after = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const g = w?.global_data?.my_group;
  return {
    href: w.location.href,
    ready: !!(w.Client && g),
    text: (w.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 250),
  };
});
log('after', after);
await browser.close();
