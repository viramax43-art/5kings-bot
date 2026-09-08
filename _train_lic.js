/**
 * Buy/learn рудокоп (ore) or строитель/каменщик license and check level.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function goAct(page, url) {
  return page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) return false;
    try {
      if (typeof act.goRC === 'function') act.goRC(u);
      else if (typeof act.goR === 'function') act.goR(u);
      else act.location.href = u;
      return true;
    } catch (e) {
      return String(e);
    }
  }, url);
}

async function actInfo(page) {
  return page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act?.document) return { err: 'no act' };
    const text = (act.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3500);
    const html = act.document.body?.innerHTML || '';
    const buttons = [...act.document.querySelectorAll('input,button,a')]
      .map((el) => ({
        value: (el.value || '').trim(),
        text: (el.textContent || '').trim().slice(0, 80),
        onclick: (el.getAttribute('onclick') || '').slice(0, 160),
        name: el.name || '',
        type: el.type || '',
      }))
      .filter((x) => x.value || x.text || x.name)
      .slice(0, 100);
    const forms = [...act.document.forms].map((f) => ({
      action: f.getAttribute('action') || '',
      html: f.outerHTML.slice(0, 800),
      inputs: [...f.elements]
        .map((el) => ({ name: el.name, type: el.type, value: String(el.value || '').slice(0, 100) }))
        .filter((x) => x.name),
    }));
    return { href: String(act.location.href), text, buttons, forms };
  });
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();

await goAct(page, 'lic.html');
await sleep(2000);
const lic = await actInfo(page);
console.log('LIC LIST TEXT:', lic.text);
// Extract mapping name -> mask from HTML
const mapHtml = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  const html = act?.document?.body?.innerHTML || '';
  return html;
});
fs.writeFileSync(path.join(ROOT, '_tmp_lic.html'), mapHtml);

// Parse profession rows: look for mask links near names
const pairs = [];
const re =
  /(Огранщик\w*|Кузнецы|Лесоруб\w*|Рудокоп\w*|Металлург\w*|Плотник\w*|Разбойник\w*|Строитель\w*|Наемник\w*|Лекарь|Алхимик\w*|Охотник\w*|Художник\w*|Травник\w*|Чародей\w*|Портн\w*|Скорняк\w*|Капитан\w*|Корабельн\w*|Кудесник\w*|Грибник\w*|Знахар\w*|Наставник\w*|Заклинател\w*)[\s\S]{0,400}?lic_mode_0_mask_(\d+)/gi;
let m;
while ((m = re.exec(mapHtml))) {
  pairs.push({ name: m[1], mask: m[2] });
}
console.log('PAIRS', pairs);

const interesting = pairs.filter((p) =>
  /рудок|лесор|строител|камен|травник|кузнец/i.test(p.name)
);
console.log('INTERESTING', interesting);

for (const p of interesting.length ? interesting : pairs.slice(0, 8)) {
  const url = `lic_mode_0_mask_${p.mask}.html`;
  await goAct(page, url);
  await sleep(2000);
  const info = await actInfo(page);
  console.log('\n====', p.name, url);
  console.log(info.text.slice(0, 800));
  console.log(
    'BTNS',
    info.buttons
      .filter((b) => /купить|получить|изуч|обуч|взять|оплатить|лиценз|подать|сдать|продлить|повыс|уровен/i.test(b.value + b.text + b.name))
      .slice(0, 20)
  );
  console.log(
    'ALL BTNS sample',
    info.buttons.slice(0, 15)
  );
  fs.writeFileSync(
    path.join(ROOT, `_tmp_lic_${p.mask}.json`),
    JSON.stringify(info, null, 2)
  );
}

process.exit(0);
