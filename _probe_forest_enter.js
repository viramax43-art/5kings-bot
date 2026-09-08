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

async function snap(label) {
  const s = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      href: w?.location?.href,
      readyBig: !!(w?.Client && g),
      hasClient: typeof w?.Client,
      hasStartDobycha: typeof w?.StartDobycha,
      my: g ? { x: g.posx, y: g.posy, stay: g.stay } : null,
      text: ((w?.document?.body?.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 350),
      forms: [...(w?.document?.forms || [])].map((f) => ({
        action: f.action,
        fields: [...f.elements].map((e) => e.name + '=' + (e.value || '').slice(0, 20)).slice(0, 12),
      })),
    };
  });
  log(label, JSON.stringify(s).slice(0, 500));
  return s;
}

await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  if (typeof w.goRC === 'function') w.goRC('gates.html');
  else w.location.href = 'gates.html';
});
await sleep(3000);
let s = await snap('gates');

if (!s.readyBig) {
  // try newforest2 directly
  await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC('newforest2.html');
    else w.location.href = 'newforest2.html';
  });
  await sleep(4000);
  s = await snap('nf2');
}

if (!s.readyBig) {
  // try fort / teleport paths seen historically
  for (const u of ['gates_mode_3.html', 'gates_mode_1.html', 'fort.html', 'teleport.html']) {
    await page.evaluate((url) => {
      const w = document.getElementById('d_act')?.contentWindow;
      if (typeof w.goRC === 'function') w.goRC(url);
      else w.location.href = url;
    }, u);
    await sleep(2800);
    s = await snap(u);
    if (s.readyBig || /создайте свою группу|ulimit|Подать заявку/i.test(s.text || '')) break;
  }
}

// if create group UI present, submit carefully
if (!s.readyBig && /Подать заявку|создайте свою группу/i.test(s.text || '')) {
  const r = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const doc = w.document;
    const ul = doc.querySelector('[name=ulimit], select[name=ulimit], #ulimit');
    if (ul) ul.value = '1';
    // set level selects if present
    const min = doc.querySelector('[name=minlvl], [name=\"Battle{minlvl}\"], select[name*=min]');
    const max = doc.querySelector('[name=maxlvl], [name=\"Battle{maxlvl}\"], select[name*=max]');
    const btn = [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать|заявк/i.test(b.value || ''));
    const hidden = doc.querySelector('[name=\"actNewMaps-CreateGroup\"]');
    if (btn) {
      if (btn.form?.requestSubmit) btn.form.requestSubmit(btn);
      else btn.click();
      return { clicked: btn.value, hasHidden: !!hidden, ul: ul?.value, formAction: btn.form?.action };
    }
    return { noBtn: true, html: doc.body.innerHTML.slice(0, 1500) };
  });
  log('submit', r);
  await sleep(5000);
  for (let i = 0; i < 20; i++) {
    s = await snap('wait' + i);
    if (s.readyBig) break;
    await sleep(2500);
  }
}

fs.writeFileSync('_tmp_forest_enter_probe.json', JSON.stringify(s, null, 2));
console.log('FINAL', s);
await browser.close();
