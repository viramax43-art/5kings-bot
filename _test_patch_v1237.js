/**
 * v1.2.37 — break false-positive busy-alert loop (modal-only + watchdog cooldown)
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

ok('V 1.2.37', /@version\s+1\.2\.37/.test(src) && /VERSION = '1\.2\.37'/.test(src));
ok('muteGameDialogs kept', /function muteGameDialogs/.test(src) && /win\.alert\s*=\s*function/.test(src));
ok('dismiss freeCell modal only', /const modalTxt = modalEl \? String\(modalEl\.innerText/.test(src));
ok('dismiss no body freeCell', !/const pageTxt = String\(\(doc\.body[\s\S]{0,200}freeCellDlg/.test(src));
ok(
  'waitMagselect no свободн|выбер broad',
  !/занят\|невозмож\|ошибка\|error\|busy\|свободн\|выбер/.test(src)
);
ok('waitMagselect isBusy on overlay', /isBusyHexError\(overlayTxt\)/.test(src));
ok('overlay modal only no body slice', /function battleOverlayErrorText[\s\S]*?if \(modal\) t \+=[\s\S]*?return String\(t\)/.test(src));
ok('watchdog cooldown 3s', /lastWatchdogAt \|\| 0\) > 3000/.test(src) && /BOT\.state\.lastWatchdogAt = Date\.now\(\)/.test(src));
ok('isBusyHexError kept free-cell', /свободн\\w\*\\s\*клетк\|выбер\\w\*\\s\+свобод/.test(src));
ok('consumeBusyAlert kept', /function consumeBusyAlert/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
