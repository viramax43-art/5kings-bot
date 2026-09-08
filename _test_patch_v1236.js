/**
 * v1.2.36 — mute alert «свободная клетка» so magselect does not freeze the bot
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

ok('V 1.2.36', /@version\s+1\.2\.36/.test(src) && /VERSION = '1\.2\.36'/.test(src));
ok('muteGameDialogs', /function muteGameDialogs/.test(src) && /win\.alert\s*=\s*function/.test(src));
ok('muteBattleAndBook', /function muteBattleAndBook/.test(src));
ok('consumeBusyAlert', /function consumeBusyAlert/.test(src));
ok('isBusyHex free cell', /свободн\\w\*\\s\*клетк/.test(src));
ok('finishMagselect mute', /async function finishMagselect[\s\S]*?muteBattleAndBook/.test(src));
ok('watchdog 25s', /helperBusySince \|\| 0\) > 25000/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
