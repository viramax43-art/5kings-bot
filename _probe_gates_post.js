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
  if (typeof w.goRC === 'function') w.goRC('gates.html');
  else w.location.href = 'gates.html';
});
await sleep(3000);

const info = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  function chain(el) {
    const out = [];
    let n = el;
    for (let i = 0; i < 8 && n; i++) {
      out.push({
        tag: n.tagName,
        id: n.id || '',
        name: n.name || '',
        cls: (n.className || '').toString().slice(0, 40),
      });
      n = n.parentElement;
    }
    return out;
  }
  const nodes = {
    hidden: doc.querySelector('input[name="actNewMaps-CreateGroup"]'),
    ulimit: doc.querySelector('[name=ulimit]'),
    minlvl: doc.querySelector('[name=minlvl]'),
    maxlvl: doc.querySelector('[name=maxlvl]'),
    btn: [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать/i.test(b.value || '')),
  };
  const detail = {};
  for (const [k, el] of Object.entries(nodes)) {
    if (!el) {
      detail[k] = null;
      continue;
    }
    detail[k] = {
      formId: el.form?.id || null,
      formAction: el.form?.action || null,
      formChildCount: el.form ? el.form.children.length : null,
      formElements: el.form ? el.form.elements.length : null,
      chain: chain(el),
      outer: el.outerHTML.slice(0, 200),
    };
  }
  return {
    href: w.location.href,
    forms: [...doc.forms].map((f) => ({
      action: f.action,
      children: f.children.length,
      elements: f.elements.length,
      html: f.outerHTML.slice(0, 300),
    })),
    detail,
    body: doc.body.innerHTML.slice(0, 5000),
  };
});
fs.writeFileSync('_tmp_gates_chain.json', JSON.stringify(info, null, 2));
console.log(JSON.stringify({ forms: info.forms, detail: info.detail }, null, 2));

// Manual POST like browser would
const post = await page.evaluate(async () => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  const fd = new FormData();
  fd.append('actNewMaps-CreateGroup', '1');
  fd.append('ulimit', '1');
  fd.append('minlvl', '3');
  fd.append('maxlvl', '50');
  const res = await fetch('gates_mode_1.html', { method: 'POST', body: fd, credentials: 'include' });
  const text = await res.text();
  return {
    status: res.status,
    url: res.url,
    len: text.length,
    slice: text.replace(/\s+/g, ' ').slice(0, 400),
    hasCanvas: /canvas/i.test(text),
    hasCreate: /CreateGroup|Подать заявку/i.test(text),
    hasClient: /global_data|StartDobycha|newforest2/i.test(text),
  };
});
log('post', post);
fs.writeFileSync('_tmp_gates_post.json', JSON.stringify(post, null, 2));

// navigate to response by writing HTML? better: location assign after building form that actually contains fields
const built = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const doc = w.document;
  const f = doc.createElement('form');
  f.method = 'POST';
  f.action = 'gates_mode_1.html';
  const add = (n, v) => {
    const i = doc.createElement('input');
    i.type = 'hidden';
    i.name = n;
    i.value = v;
    f.appendChild(i);
  };
  add('actNewMaps-CreateGroup', '1');
  add('ulimit', '1');
  add('minlvl', '3');
  add('maxlvl', '50');
  doc.body.appendChild(f);
  f.submit();
  return true;
});
log('builtSubmit', built);
await sleep(6000);
const after = await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  const g = w?.global_data?.my_group;
  return {
    href: w.location.href,
    ready: !!(w.Client && g),
    my: g ? { x: g.posx, y: g.posy } : null,
    text: (w.document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 250),
  };
});
log('afterBuilt', after);
await browser.close();
