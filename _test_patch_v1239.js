/**
 * v1.2.39 — face retry loop, leave on radius-without-front, skip mine without tool
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

ok('V 1.2.39', /@version\s+1\.2\.39/.test(src) && /VERSION = '1\.2\.39'/.test(src));
ok('face retry naprToward', /for \(let attempt = 0; attempt < 6; attempt\+\+\)/.test(src) && /faceNeeded = naprToward/.test(src));
ok('search empty flag', /поиск пустой/.test(src) && /lastSearchEmpty = true/.test(src));
ok('leave on radius not front', /dir === 'radius'[\s\S]{0,80}!BOT\.state\.bigForestHint\.front/.test(src));
ok('skip mine without tool', /инструмент не надет — пропускаю добычу/.test(src));
ok('equip fail 30s', /lastEquipFailAt && Date\.now\(\) - BOT\.state\.lastEquipFailAt < 30000/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
