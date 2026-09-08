/**
 * Find where to learn/train рудокоп / каменщик and attempt to do it.
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
    const text = (act.document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500);
    const forms = [...act.document.forms].map((f) => ({
      action: f.getAttribute('action') || '',
      inputs: [...f.elements].map((el) => ({
        name: el.name,
        type: el.type,
        value: String(el.value || '').slice(0, 80),
      })).filter((x) => x.name),
    }));
    const buttons = [...act.document.querySelectorAll('input[type=button],input[type=submit],button,a')]
      .map((el) => ({
        value: (el.value || '').trim(),
        text: (el.textContent || '').trim().slice(0, 60),
        onclick: (el.getAttribute('onclick') || '').slice(0, 140),
        name: el.name || '',
      }))
      .filter((x) => x.value || x.text || x.name)
      .slice(0, 80);
    return { href: String(act.location.href), text, forms: forms.slice(0, 20), buttons };
  });
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = browser.contexts()[0].pages().find((p) => /game\.html/i.test(p.url()));
await page.bringToFront();

const places = [
  'sawmill.html', // Опушка - likely lumber
  'smith.html', // Кузница
  'lic.html', // муниципалитет
  'shop.html',
  'ability.html',
  'abilities.html',
  'param.html',
  'info.html?user=960792',
  'yard.html',
  'uchastki.html',
  'exchange.html',
  'clan.html',
  'hram.html',
  'healer.html',
  'bank.html',
  'magschool.html',
  'support.html',
  'yarmarka.html',
  'gates.html',
  'room.chtml',
];

for (const u of places) {
  await goAct(page, u);
  await sleep(1800);
  const info = await actInfo(page);
  const hit = /профес|рудок|лесор|камен|травник|дровосек|умения|навык|обуч|изуч|получить/i.test(
    info.text || ''
  );
  const formHit = JSON.stringify(info.forms || []).match(/Prof|prof|Skill|skill|Learn|learn|Profession/);
  console.log('\n====', u, 'href=', info.href, 'hit=', hit || !!formHit);
  console.log('TEXT:', (info.text || '').slice(0, 350));
  if (hit || formHit || /sawmill|smith|lic|ability|info/i.test(u)) {
    console.log('BTNS:', JSON.stringify(info.buttons?.slice(0, 25), null, 2));
    if (info.forms?.length) console.log('FORMS:', JSON.stringify(info.forms.slice(0, 8), null, 2));
    fs.writeFileSync(
      path.join(ROOT, `_tmp_place_${u.replace(/[^\w.-]+/g, '_')}.json`),
      JSON.stringify(info, null, 2)
    );
  }
}

// Deep dive info page HTML for profession table
await goAct(page, 'info.html?user=960792');
await sleep(2000);
const html = await page.evaluate(() => {
  const act = document.getElementById('d_act')?.contentWindow;
  return act?.document?.documentElement?.innerHTML?.slice(0, 50000) || '';
});
fs.writeFileSync(path.join(ROOT, '_tmp_info_960792.html'), html);
const m = html.match(/профес[\s\S]{0,400}|рудок[\s\S]{0,200}|камен[\s\S]{0,200}|лесор[\s\S]{0,200}|травник[\s\S]{0,200}/gi);
console.log('\nINFO MATCHES', m);

// Check d_pers for profession links
const persLinks = await page.evaluate(() => {
  const w = document.getElementById('d_pers')?.contentWindow;
  if (!w?.document) return [];
  return [...w.document.querySelectorAll('a,area,img[onclick],div[onclick],td[onclick]')]
    .map((el) => ({
      tag: el.tagName,
      href: el.getAttribute('href') || '',
      onclick: (el.getAttribute('onclick') || '').slice(0, 120),
      title: el.getAttribute('title') || '',
      alt: el.getAttribute('alt') || '',
      text: (el.textContent || '').trim().slice(0, 40),
    }))
    .filter((x) => x.href || x.onclick || /профес|умен|навык|скил|info|param|abil/i.test(x.title + x.alt + x.text))
    .slice(0, 50);
});
console.log('PERS LINKS', JSON.stringify(persLinks, null, 2));

process.exit(0);
