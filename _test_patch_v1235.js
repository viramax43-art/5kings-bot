/**
 * v1.2.35 — customer patch map: magselect occupied, craft stick, tool map, aggressive
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

ok('V 1.2.35', /@version\s+1\.2\.35/.test(src) && /VERSION = '1\.2\.35'/.test(src));
ok('waitMagselectResult', /async function waitMagselectResult/.test(src));
ok('occupiedCells ban', /BOT\.state\.occupiedCells/.test(src) && /waitMagselectResult/.test(src));
ok('helperBusy', /helperBusy/.test(src) && /Watchdog: helper/.test(src));
ok('TOOL_MAP tree axe', /TOOL_MAP[\s\S]*?tree:\s*\{\s*name:\s*'топор'/.test(src));
ok('normalizeItemName', /function normalizeItemName/.test(src));
ok('clickMapCell', /async function clickMapCell/.test(src));
ok('faceResourceByHint', /async function faceResourceByHint/.test(src));
ok('craftStickTarget 45s', /craftStickUntil = Date\.now\(\) \+ 45000/.test(src) && /craftStickTarget/.test(src));
ok('shouldStopSession', /function shouldStopSession/.test(src) && /доигрываем/.test(src));
ok('spellMatchesPattern iu', /function spellMatchesPattern/.test(src) && /'iu'/.test(src));
ok('aggressive no block fill', /tactic !== 'aggressive'[\s\S]{0,80}applyBlocks\(side, 2\)/.test(src));
ok('healSpell восстанови', /healSpell: 'восстанови\|/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
