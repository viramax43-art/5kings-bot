/**
 * v1.2.33 — heal title/alt in magbook HTML + aggressive tactics
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
  if (idx < 0) throw new Error('not found ' + name);
  const brace = src.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, p + 1);
    }
  }
  throw new Error('unterminated ' + name);
}

const failed = [];
let passed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  PASS  ' + name);
  } else {
    failed.push(name);
    console.log('  FAIL  ' + name, extra != null ? extra : '');
  }
}

const prelude = [
  'magbookRowSlice',
  'magbookHtmlToBlob',
  'collectMagbookSpellsFromHtml',
  'isHealSpellBlob',
  'isHelperBlob',
  'pickMagbookSpell',
]
  .map(extractFunction)
  .join('\n');
const fns = new Function(
  prelude +
    '; return { magbookHtmlToBlob, collectMagbookSpellsFromHtml, isHealSpellBlob, isHelperBlob, pickMagbookSpell };'
)();

console.log('--- heal from img title ---');
ok('H1 version 1.2.34', /@version\s+1\.2\.3[34]/.test(src));
ok('H2 magbookHtmlToBlob', /function magbookHtmlToBlob/.test(src));
ok('H3 healSpell no \\\\w', /healSpell: 'восстанов\|здоровье/.test(src) && !/healSpell: 'восстанов\\\\w/.test(src));

const liveLike =
  '<tr height="100" class=item><td align="left" valign="top" nowrap>' +
  '<img title="Восстановить здоровье" alt="Восстановить здоровье"><br></td>' +
  '<td align="center">требует 50 маны</td>' +
  '<td><input type="button" value="Применить" onclick="MakeCast(10001)"></td></tr>';
const spells = fns.collectMagbookSpellsFromHtml(liveLike);
ok('H4 title kept in blob', /восстановить\s*здоровье/i.test(spells[0] && spells[0].blob), spells[0]);
ok('H5 isHeal', fns.isHealSpellBlob(spells[0].blob));
const pick = fns.pickMagbookSpell(
  spells,
  (b) => fns.isHealSpellBlob(b),
  (b) => fns.isHelperBlob(b, null),
  ''
);
ok('H6 pick heal 10001', pick && pick.formId === '10001', pick);

const healCfg = (src.match(/healSpell:\s*'([^']+)'/) || [])[1];
const healRe = new RegExp(healCfg, 'i');
ok('H7 cfg regex matches name', healRe.test('Восстановить здоровье'));

console.log('--- tactics ---');
ok('H8 aggressive no 4-block when enemies', /inRange\.length === 0 && \(tactic === 'defense' \|\| !withDist\.length\)/.test(src));
ok('H9 forceKick', /function forceKick\(side\)/.test(src));
ok('H10 healSpell UI', /data-cfg-val="battle\.healSpell"/.test(src));

console.log('\nHeal/tactic: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
