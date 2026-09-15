/**
 * v1.2.34 — craft hints left/radius, tree≠pick, bag iframe
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

ok('V 1.2.41', /@version\s+1\.2\.41/.test(src));
ok('reactToCraftHint', /async function reactToCraftHint/.test(src));
ok('left via mineByRelative', /mineByRelativeHint/.test(src) && /naprRelative/.test(src));
ok('hint left branch', /hint\.dir === 'left' \|\| hint\.dir === 'right' \|\| hint\.dir === 'back'/.test(src));
ok('radius branch', /hint\.dir === 'radius'/.test(src) && /в радиусе/.test(src));
ok('no overwrite tree with copper', /approachAndFaceVein/.test(src) && !/scanKind === 'tree'\) scanKind = BOT\.state\.veinScanKind/.test(src));
ok('old bug gone', !/scanKind === 'tree'\) scanKind = BOT\.state\.veinScanKind/.test(src));
ok('craft trees in list', /kind === 'tree'[\s\S]{0,40}collectTrees/.test(src));
ok('bag iframe', /k5-bag/.test(src) && /bag_type_17_mode_0\.html/.test(src));
ok('force equip at vein', /equipCraftTool\(hint\.txt \|\| kind, kind, true\)/.test(src));
ok('keep hint after mine', /craftStickUntil/.test(src) && /craftStickTarget/.test(src));
ok('axe for trees', /TOOL_MAP[\s\S]*?tree:[\s\S]*?axe/.test(src));
ok('acceptForestHint', /function acceptForestHint/.test(src));
ok('gotoOnly mode', /gotoOnly/.test(src));

console.log('\nCraft fix: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
