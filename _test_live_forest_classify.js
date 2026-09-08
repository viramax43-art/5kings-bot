/**
 * Live snap: enter big forest, classify abs_poses with the bot's real filters.
 * Confirms herbs/mushrooms/copper are visible to listBigForestItems.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, saveState, log, sleep } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');

function extractFunction(name) {
  const needle = '\n  function ' + name + '(';
  let idx = SRC.indexOf(needle);
  if (idx < 0) throw new Error('missing ' + name);
  idx += 1;
  const brace = SRC.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < SRC.length; p++) {
    if (SRC[p] === '{') depth++;
    else if (SRC[p] === '}') {
      depth--;
      if (depth === 0) return SRC.slice(idx, p + 1);
    }
  }
  throw new Error('unterminated ' + name);
}

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return {};
    const g = w.global_data && w.global_data.my_group;
    return {
      file: String(w.location.href || '').split('/').pop(),
      readyBig: !!(w.Client && g),
      viewmode: w.viewmode,
      my: g ? { x: Number(g.posx), y: Number(g.posy), stay: Number(g.stay), napr: Number(g.napr) } : null,
    };
  });
}

const classifySrc =
  'function range(a,b){const r=[];for(let i=a;i<=b;i++)r.push(i);return r;}\n' +
  'const NF={herbs:range(77,97),mushrooms:range(427,449),copper:[74,75,104,105,106],iron:[70,71,72,73,107,108,109,110,111,112,113],rocks:[10,11,101,102,103].concat(range(114,130)),chests:[76],blockers:[2,3,4,5,6,7,8,9,10,11,12,13,26,27,28,29,30].concat([101,102,103],range(114,130))};\n' +
  'const BOT={cfg:{forest:{collectHerbs:true,collectMushrooms:true,collectCopper:true,collectIron:true,collectGold:true}},state:{bannedAbs:new Set()}};\n' +
  extractFunction('nfImgMeta') +
  '\n' +
  extractFunction('nfTypeKind') +
  '\n' +
  extractFunction('nfViewParams') +
  '\n' +
  extractFunction('nfResolveXY') +
  '\n' +
  extractFunction('listBigForestItems') +
  '\n' +
  extractFunction('nearestBigItem') +
  '\n' +
  extractFunction('bigForestChebyshev') +
  '\n' +
  extractFunction('kindAtCell') +
  '\n' +
  extractFunction('cellAhead') +
  '\n' +
  extractFunction('bigForestNaprDeltas') +
  '\nconst WALKABLE_KINDS={herb:1,mushroom:1,chest:1};\n' +
  extractFunction('isBlockedCell') +
  '\n(' +
  function classify() {
    const w = document.getElementById('d_act') && document.getElementById('d_act').contentWindow;
    if (!w || !w.global_data) return { err: 'no gd' };
    const g = w.global_data.my_group;
    const poses = w.global_data.abs_poses || {};
    const raw = { herb: 0, mushroom: 0, copper: 0, iron: 0, block: 0, other: 0, total: 0 };
    const samples = { herb: [], mushroom: [], copper: [] };
    Object.keys(poses).forEach(function (k) {
      const it = poses[k];
      if (!it || it === 0) return;
      raw.total++;
      const kind = nfTypeKind(it.type, w);
      if (raw[kind] == null) raw[kind] = 0;
      raw[kind]++;
      if ((kind === 'herb' || kind === 'mushroom' || kind === 'copper') && samples[kind].length < 3) {
        const pos = nfResolveXY(w, k, it);
        samples[kind].push({ type: it.type, pos: pos, posx: it.posx, posy: it.posy });
      }
    });
    const me = g ? { x: Number(g.posx), y: Number(g.posy) } : null;
    const step = listBigForestItems(w, 'step');
    const craft = listBigForestItems(w, 'craft');
    const nearStep = me ? nearestBigItem(me, step, null, 'mushroom') : null;
    const ahead = me ? cellAhead(w, me, Number(g.napr) || 1) : null;
    const aheadKind = ahead ? kindAtCell(w, ahead.x, ahead.y) : null;
    const aheadBlocked = ahead ? isBlockedCell(w, ahead.x, ahead.y) : null;
    return {
      file: String(w.location.href || '').split('/').pop(),
      viewmode: w.viewmode,
      me: me,
      naprs: w.naprs_x && w.naprs_y ? true : false,
      imgByType: !!w.img_by_type,
      raw: raw,
      listed: { step: step.length, craft: craft.length },
      nearestStep: nearStep,
      ahead: ahead,
      aheadKind: aheadKind,
      aheadBlocked: aheadBlocked,
      samples: samples,
    };
  }.toString() +
  ')()';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

const report = { ok: false };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  let s = await snap(page);
  log('start', s);
  if (!s.readyBig) {
    await goAct(page, 'gates.html');
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const doc = w.document;
      if (typeof w.StartDobycha === 'function') {
        w.location.href = 'newforest2.html';
        return;
      }
      const form = [...doc.forms].find((f) => /CreateGroup/i.test(f.innerHTML));
      if (form) {
        const ul = form.querySelector('[name=ulimit]');
        if (ul) ul.value = '1';
        const btn = form.querySelector('input[type=submit]');
        if (btn) btn.click();
        else form.submit();
      }
    });
    for (let i = 0; i < 24 && !(s = await snap(page)).readyBig; i++) {
      log('wait-enter', i, s.file);
      await sleep(2500);
    }
  }
  report.enter = s;
  if (!s.readyBig) {
    report.reason = 'could not enter forest';
  } else {
    const data = await page.evaluate(classifySrc);
    report.classify = data;
    const listedStep = data.listed && data.listed.step;
    const rawHerb = (data.raw && (data.raw.herb || 0)) + (data.raw && (data.raw.mushroom || 0));
    // If the map has herbs, the filter MUST list them. If the map has none, pass (nothing to pick).
    report.ok = !!(data.imgByType && data.me && (rawHerb === 0 || listedStep > 0));
    report.checks = {
      inForest: true,
      imgByType: !!data.imgByType,
      listedHerbsIfPresent: rawHerb === 0 || listedStep > 0,
      rawHerbMushroom: rawHerb,
      listedStep: listedStep,
    };
    log('classify', JSON.stringify(report.checks), 'nearest', data.nearestStep);
  }
  await saveState(context);
} catch (e) {
  report.error = String(e.stack || e);
  console.error(e);
} finally {
  fs.writeFileSync(path.join(ROOT, '_tmp_live_forest_classify.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close().catch(() => {});
}
process.exit(report.ok ? 0 : 2);
