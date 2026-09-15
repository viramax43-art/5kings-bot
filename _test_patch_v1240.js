/**
 * v1.2.40 — relative left/right mine: tool → turn ±2 → dobycha; radius is not leave
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

ok('V 1.2.40', /@version\s+1\.2\.40/.test(src) && /VERSION = '1\.2\.40'/.test(src));
ok('parse радиусе', /\/радиусе\/i\.test\(value\)/.test(src));
ok('naprRelative ±2', /function naprRelative/.test(src) && /base - 1 \+ 6/.test(src) && /base - 1 \+ 2/.test(src));
ok('mineByRelativeHint', /async function mineByRelativeHint/.test(src) && /старт добычи/.test(src));
ok('left uses mineByRelative', /hint\.dir === 'left'[\s\S]{0,200}mineByRelativeHint/.test(src));
ok('radius not leave', /dir === 'radius'[\s\S]{0,120}lastSearchEmpty = false/.test(src));
ok('priority before approach', /не выполнять переход к координате предыдущего поиска/.test(src) && /await approachAndFaceVein\(win, me, t\)/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
