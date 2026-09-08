/**
 * Magbook helper/heal matching — run several times before calling the work done.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');

function extractFunction(name) {
  const needles = ['\n  function ' + name + '(', '\n  async function ' + name + '('];
  let idx = -1;
  for (const n of needles) {
    idx = src.indexOf(n);
    if (idx >= 0) {
      idx += 1;
      break;
    }
  }
  if (idx < 0) throw new Error('function not found: ' + name);
  const brace = src.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, p + 1);
    }
  }
  throw new Error('unterminated: ' + name);
}

const prelude = `
${extractFunction('magbookRowSlice')}
${extractFunction('magbookHtmlToBlob')}
${extractFunction('collectMagbookSpellsFromHtml')}
${extractFunction('mergeMagbookSpells')}
${extractFunction('pickMagbookSpell')}
${extractFunction('normalizeItemName')}
${extractFunction('spellMatchesPattern')}
${extractFunction('isHelperBlob')}
${extractFunction('isHealSpellBlob')}
${extractFunction('magselectLooksReady')}
`;
const fns = new Function(prelude + '; return { collectMagbookSpellsFromHtml, mergeMagbookSpells, pickMagbookSpell, isHelperBlob, isHealSpellBlob, magselectLooksReady };')();

const failed = [];
let passed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed.push(name);
    console.log('  FAIL  ' + name, extra || '');
  }
}

const helperRe = /помощник|вызвать\s*помощ/i;
const page1 = `
<table>
<tr><td>Восстановить здоровье требует 50 маны</td><td><form id="form10001"></form><a onclick="MakeCast(10001)">cast</a></td></tr>
<tr><td>Боевой клич требует 100 маны</td><td><form id="form10021"></form><a onclick="MakeCast(10021)">cast</a></td></tr>
<tr><td>Сила духа требует 25 маны</td><td><form id="form10007"></form><a onclick="MakeCast(10007)">cast</a></td></tr>
<tr><td>Веерная защита требует 75 маны</td><td><form id="form10011"></form><a onclick="MakeCast(10011)">cast</a></td></tr>
<tr><td>Берсерк требует 100 маны</td><td><form id="form10017"></form><a onclick="MakeCast(10017)">cast</a></td></tr>
</table>`;

const page2 = `
<table>
<tr><td>Вызвать помощника требует 75 маны. Создается помощник</td>
<td><form id="form10003"></form><a onclick="MakeCast(10003)">cast</a></td></tr>
<tr><td>Магический панцирь требует 40 маны</td>
<td><form id="form10009"></form><a onclick="MakeCast(10009)">cast</a></td></tr>
</table>`;

const customerLogHtml = page1; // exactly the 5 spells from the customer's log

console.log('--- collect page 1 (customer log) ---');
const p1 = fns.collectMagbookSpellsFromHtml(page1);
ok('M1 five fighter spells', p1.length === 5, p1.map((s) => s.formId));
ok('M2 no helper on page 1', !p1.some((s) => fns.isHelperBlob(s.blob, helperRe)));
ok('M3 heal is 10001', p1.some((s) => s.formId === '10001' && fns.isHealSpellBlob(s.blob)));

console.log('--- collect page 2 (mage) ---');
const p2 = fns.collectMagbookSpellsFromHtml(page2);
ok('M4 helper form 10003', p2.some((s) => s.formId === '10003' && fns.isHelperBlob(s.blob, helperRe)));
ok('M5 helper is not heal', fns.isHealSpellBlob(p2.find((s) => s.formId === '10003').blob) === false);

console.log('--- merge pages like the new walker ---');
const all = fns.mergeMagbookSpells(p1.slice(), p2);
ok('M6 merged has 7', all.length === 7, all.map((s) => s.formId));
const pick = fns.pickMagbookSpell(
  all,
  (b) => fns.isHelperBlob(b, helperRe),
  (b) => fns.isHealSpellBlob(b),
  ''
);
ok('M7 pick helper 10003 from merged', pick && pick.formId === '10003', pick);

console.log('--- preferFormId must still match the spell name (IDs in хаосе могут смениться) ---');
const pickPref = fns.pickMagbookSpell(p1, (b) => /боевой\s*клич/i.test(b), () => false, '10021');
ok('M8 preferId + name still 10021', pickPref && pickPref.formId === '10021');
const pickPrefWrong = fns.pickMagbookSpell(p1, (b) => fns.isHelperBlob(b, helperRe), () => false, '10021');
ok('M8b preferId ignored if name is not helper', !pickPrefWrong);

console.log('--- helper and heal in neighboring rows ---');
const shared = fns.collectMagbookSpellsFromHtml(
  '<tr><td>Восстановить здоровье требует 50 маны</td><td><form id="form10001"></form><a onclick="MakeCast(10001)"></a></td></tr>' +
    '<tr><td>Вызвать помощника требует 75 маны. Создается помощник</td><td><form id="form10003"></form><a onclick="MakeCast(10003)"></a></td></tr>'
);
const pickShared = fns.pickMagbookSpell(
  shared,
  (b) => fns.isHelperBlob(b, helperRe),
  (b) => fns.isHealSpellBlob(b),
  ''
);
ok('M9 helper found next to heal', pickShared && pickShared.formId === '10003', pickShared);
const pickHeal = fns.pickMagbookSpell(
  shared,
  (b) => fns.isHealSpellBlob(b),
  (b) => fns.isHelperBlob(b, helperRe),
  ''
);
ok('M9b heal still 10001', pickHeal && pickHeal.formId === '10001', pickHeal);

console.log('--- name variants ---');
ok('M10 Вызвать помощника', fns.isHelperBlob('Вызвать помощника', helperRe));
ok('M11 помощника', fns.isHelperBlob('вызов помощника в клетку', helperRe));
ok('M12 heal not helper', fns.isHelperBlob('Восстановить здоровье требует 50 маны', helperRe) === false);
ok('M13 berserk not helper', fns.isHelperBlob('Берсерк требует 100 маны', helperRe) === false);
ok('M14 create clone is helper', fns.isHelperBlob('Создать клон требует 80 маны', helperRe) === true);
ok(
  'M18 magselect clone is helper',
  fns.isHelperBlob('Создать клон magselect.chtml?cid=384173', helperRe) === true
);

console.log('--- magselect helper (live combat book, not MakeCast) ---');
const magSelHtml =
  '<tr height="100" class=item><td align="left" valign="top" nowrap>' +
  '<img title="Вызвать помощника" alt="Вызвать помощника"><br>Вызвать помощника</td>' +
  '<td align="center">требует 75 маны</td>' +
  '<td><input type="button" value="Применить" onclick="goRC(\'magselect.chtml?bid=11034833&cid=384173\')"></td></tr>' +
  '<tr><td>Восстановить здоровье</td><td><form id="form10001"></form>' +
  '<input onclick="MakeCast(10001)" value="Применить"></td></tr>';
const magSel = fns.collectMagbookSpellsFromHtml(magSelHtml);
ok('M15 magselect cid parsed', magSel.some((s) => s.formId === 'sel:384173' && s.kind === 'magselect'), magSel);
ok(
  'M16 helper is magselect not 10001',
  fns.pickMagbookSpell(magSel, (b) => fns.isHelperBlob(b, helperRe), (b) => fns.isHealSpellBlob(b), '') &&
    fns.pickMagbookSpell(magSel, (b) => fns.isHelperBlob(b, helperRe), (b) => fns.isHealSpellBlob(b), '').formId ===
      'sel:384173'
);
ok(
  'M17 garbled helper+magselect',
  fns.isHelperBlob("Р’С‹Р·РІР°С‚СЊ РїРѕРјРѕС‰РЅРёРєР° magselect.chtml?cid=384173", helperRe)
);

console.log('--- source contracts ---');
ok('S1 version 1.2.35', /@version\s+1\.2\.3[45]/.test(src) && /VERSION = '1\.2\.3[45]'/.test(src));
ok('S2 large iframe', /width:850px;height:650px/.test(src) && !/width:1px;height:1px/.test(src));
ok('S3 page extras', /page=2/.test(src) && /mode=1/.test(src) && /magbookClickReveal/.test(src));
ok('S4 helperFormId cfg', /helperFormId:\s*''/.test(src) && /preferFormId: cfg\.helperFormId/.test(src));
ok('S5 opener before src', /iframe\.src = 'about:blank'/.test(src) && /iframe\.contentWindow\.opener = win/.test(src));
ok('S6 wait stable', /function waitMagbookStable\(/.test(src));
ok('S7 summon checkbox', /battle\.summonHelper/.test(src));
ok('S8 tries mbook + live href', /mbook\.chtml/.test(src) && /function findLiveBattleBookUrl/.test(src));
ok(
  'M19 clone spell in default helper regex',
  /клон|создать\\s\*клон|clone/.test(src) && fns.isHelperBlob('Создать клон goRC("magselect.chtml?cid=1")', /клон|создать\\s*клон/i)
);
ok(
  'M20 battle nick клон is not magselect',
  fns.magselectLooksReady({
    location: { href: 'https://5kings.ru/arena_room_1_bmode_36.html' },
    document: {
      body: { innerHTML: '<canvas id="mapCanvas"></canvas> function MakeTurn(){} Hm malo4ik клон 1' },
      getElementById: function () { return {}; },
    },
  }) === false
);
ok(
  'M21 magselect.chtml href is ready',
  fns.magselectLooksReady({
    location: { href: 'https://5kings.ru/magselect.chtml?bid=1&cid=2' },
    document: { body: { innerHTML: '<canvas id="mapCanvas"></canvas>' }, getElementById: function () { return {}; } },
  }) === true
);

const report = {
  at: new Date().toISOString(),
  passed,
  failed: failed.length,
  failedNames: failed,
  customerPage1: p1.map((s) => s.formId + ':' + s.blob.slice(0, 40)),
  mergedPick: pick && { formId: pick.formId, blob: pick.blob.slice(0, 60) },
};
fs.writeFileSync(path.join(ROOT, '_tmp_magbook_v1214_report.json'), JSON.stringify(report, null, 2));

console.log('\nMagbook: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
