/**
 * v1.2.38 — forest: face vein, leave 6–8 on empty search, wear pickaxe, no profession false-positive
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');

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

ok('V 1.2.38', /@version\s+1\.2\.38/.test(src) && /VERSION = '1\.2\.38'/.test(src));
ok('pickFaceStand', /function pickFaceStand/.test(src) && /function approachAndFaceVein/.test(src));
ok('faceCell', /async function faceCell/.test(src) && /naprExactDelta/.test(src));
ok('leaveEmptySearchArea', /function leaveEmptySearchArea/.test(src) && /пустой поиск — ухожу на/.test(src));
ok('turnToFace uses game napr', /function turnToFace[\s\S]{0,180}facingNapr\(win\)/.test(src));
ok('left/right in-place turn', /поворот на месте курс/.test(src));
ok('no click vein on radius', !/clickMapCell\(win, v\.x, v\.y\)/.test(src));
ok('no visual vein hop without hint', !/иду к следующей жиле/.test(src));
ok('Wear URL', /actUser-Wear=/.test(src) && /bag_type_17\.html/.test(src));
ok('Кирка рудокопа not profession', /const PROFESSION_HINTS = \[[\s\S]*?нужна\?\\s\+професси/.test(src));
ok('TOOL_NEED в руках', /должны иметь в руках/.test(src));
ok('wait search result', /sawBusy && we === 0/.test(src));
ok('cardinal preferred', /function isCardinalNapr/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
