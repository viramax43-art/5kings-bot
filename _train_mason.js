/**
 * Probe + train miner (рудокоп / "каменщик") profession for forest ore testing.
 */
import { chromium } from 'playwright';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 9222;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function actEval(page, fn, arg) {
  return page.evaluate(
    ({ fnSrc, arg }) => {
      const act = document.getElementById('d_act')?.contentWindow;
      if (!act) return { err: 'no d_act' };
      // eslint-disable-next-line no-new-func
      const fn = new Function('return (' + fnSrc + ')')();
      return fn(act, arg);
    },
    { fnSrc: fn.toString(), arg }
  );
}

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

async function actText(page) {
  return page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act?.document?.body) return '';
    return act.document.body.innerText.replace(/\s+/g, ' ').slice(0, 2000);
  });
}

async function actButtons(page) {
  return page.evaluate(() => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act?.document) return [];
    return [...act.document.querySelectorAll('input[type=button],input[type=submit],button,a')]
      .map((el) => ({
        tag: el.tagName,
        value: (el.value || '').trim(),
        text: (el.textContent || '').trim().slice(0, 80),
        onclick: (el.getAttribute('onclick') || '').slice(0, 120),
        href: (el.getAttribute('href') || '').slice(0, 120),
        name: el.name || '',
      }))
      .filter((x) => x.value || x.text || x.onclick)
      .slice(0, 60);
  });
}

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const context = browser.contexts()[0];
let page = context.pages().find((p) => /5kings\.ru\/game\.html/i.test(p.url()));
if (!page) {
  page = await context.newPage();
  await page.goto('https://5kings.ru/game.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(4000);
}
await page.bringToFront();
console.log('page', page.url());

// Character snapshot from d_pers
const pers = await page.evaluate(() => {
  try {
    const w = document.getElementById('d_pers')?.contentWindow || top.frames['d_pers'];
    const nd = w?.nd || w?.pers || null;
    if (!nd) {
      return {
        text: (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
      };
    }
    return {
      id: nd.id,
      nk: nd.nk,
      lvl: nd.lvl,
      hp: nd.hp,
      mhp: nd.mhp,
      snip: (w.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 800),
    };
  } catch (e) {
    return { err: String(e) };
  }
});
console.log('PERS', JSON.stringify(pers, null, 2));

// Open user info / skills if possible
await goAct(page, 'user.html');
await sleep(2500);
console.log('USER TEXT', await actText(page));
console.log('USER BTNS', JSON.stringify(await actButtons(page), null, 2));
await page.screenshot({ path: path.join(ROOT, '_tmp_prof_user.png') });

// Try common profession pages
const candidates = [
  'prof.html',
  'profs.html',
  'profession.html',
  'skills.html',
  'ability.html',
  'abilities.html',
  'param.html',
  'params.html',
  'info.html?user=' + (pers.id || 960792),
  'nastavniki.html',
  'school.html',
  'guild.html',
  'guilds.html',
  'craft.html',
  'works.html',
  'work.html',
  'mine.html',
  'kamen.html',
  'rudokop.html',
  'lib.shtml?id=53',
];

for (const u of candidates) {
  await goAct(page, u);
  await sleep(1500);
  const t = await actText(page);
  const href = await page.evaluate(() => {
    try {
      return document.getElementById('d_act')?.contentWindow?.location?.href;
    } catch {
      return null;
    }
  });
  const hit = /профес|рудок|лесор|камен|навык|умения|травник|дровосек/i.test(t);
  console.log('TRY', u, '->', href, 'hit=', hit, 'snip=', t.slice(0, 180));
  if (hit) {
    fs.writeFileSync(path.join(ROOT, `_tmp_prof_${u.replace(/[^\w.-]+/g, '_')}.txt`), t);
    console.log('BUTTONS', JSON.stringify(await actButtons(page), null, 2));
  }
}

// City street search for profession trainers
await goAct(page, 'place_street_5.html');
await sleep(2000);
console.log('STREET', await actText(page));
console.log('STREET BTNS', JSON.stringify(await actButtons(page), null, 2));

process.exit(0);
