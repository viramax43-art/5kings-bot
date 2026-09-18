/**
 * Customer feedback 21.08.2026 — source + logic contracts for v1.2.27
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

console.log('--- 1. экипировка: не кирка/броня каждые 5 шагов ---');
ok('1a bag skips armor via bagRowIsTool', /bagRowIsTool/.test(src) && /шлем|амулет|лат/.test(src));
ok('1b no "click any Одеть"', !/const any = win\.document\.querySelector\(/.test(src));
ok('1c basket only if not already basket', /equippedToolKind !== 'basket'/.test(src));
ok('1d pick via TOOL_MAP copper', /TOOL_MAP[\s\S]*?copper:[\s\S]*?kind: 'pick'/.test(src));
ok('1e bag throttle 8s', /lastEquipTryAt \|\| 0\) < 8000/.test(src));
ok('1f mushroom does not open bag if basket on', /equippedToolKind !== 'basket'/.test(src) && /корзина грибника/.test(src));

console.log('--- 2–3. не крутиться у скал ---');
ok('2a goto after detour', /препятствие впереди[\s\S]{0,400}hopFreeEnd/.test(src));
ok('2b bestEscapeNapr exists', /function bestEscapeNapr\(/.test(src));
ok('2c rock escape goto', /скала — уход курс/.test(src) && /gotoWorldCell\(win, escEnd/.test(src));
ok('3a detour lock 12s', /holdDetourUntil = Date\.now\(\) \+ 12000/.test(src));

console.log('--- 4. ко 2-му ресурсу не по 1 клетке ---');
ok('4a hopCap 5 for craft/vein path', /const hopCap = 5/.test(src) && /longHop/.test(src));
ok('4b farthest cell not nfGetAbs gate', /cell = path\[hopMax - 1\]/.test(src) && !/nfGetAbs\(win, path\[i\]/.test(src));
ok('4c longHop for goto/radar/mush', /dest\.fromRadar/.test(src) && /cellGotoId\(win, dest\.x, dest\.y\)/.test(src) && /longHop/.test(src));

console.log('--- 5. не разворачиваться спонтанно ---');
ok('5a random reverse only if !hold', /if \(!hold && Math\.random\(\) < 0\.03\)/.test(src));
ok('5b restore course needs 6 free cells', /hopFreeLen\(win, me, preferred, 8\) >= 6/.test(src));

console.log('--- 6. категории грибов 1/2/3 ---');
ok('6a mushroomCat1..3 cfg', /mushroomCat1: true/.test(src) && /mushroomCat2: true/.test(src) && /mushroomCat3: true/.test(src));
ok('6b UI checkboxes', /грибы 1 кат/.test(src) && /грибы 2 кат/.test(src) && /грибы 3 кат/.test(src));
ok('6c filter in listBigForestItems', /mushroomCatAllowed\(type, win\)/.test(src));
ok('6d ranges 427-432 / 433-440 / 441-448', /mushroomCat1: range\(427, 432\)/.test(src) && /mushroomCat2: range\(433, 440\)/.test(src) && /mushroomCat3: range\(441, 448\)/.test(src));

console.log('--- 7. держать курс ---');
ok('7a holdCourse default true', /holdCourse: true/.test(src));
ok('7b adoptManualFacing skipped when hold', /holdCourse !== false\) \{\s*return currentNapr/.test(src));
ok('7c UI checkbox', /держать курс \(менять только у препятствия\)/.test(src));

console.log('--- бой: клон 1 раз за раунд ---');
ok('B1 helperCastSeq per our turn', /helperCastSeq === seq/.test(src) && /battleTurnSeq/.test(src));
ok('B2 clone again next turn', /wasOurTurn/.test(src) && /можно клонить/.test(src));
ok('B3 clone on field does not lock fight', !/if \(battleHasOwnHelper/.test(src));
ok('B4 no 25s lock after clone', !/helperFailUntil = Date\.now\(\) \+ 25000/.test(src));

ok('V version 1.2.45', /@version\s+1\.2\.45/.test(src) && /VERSION = '1\.2\.45'/.test(src));

console.log('--- 8. радар / бой-таймер / точка ---');
ok('8a radar default on', /useRadar: true/.test(src) && !/cfg\.forest\.useRadar = false/.test(src));
ok('8b merge radar into step list', /listRadarItems/.test(src) && /fromRadar/.test(src));
ok('8c fog radar still there', /if \(it\.fromRadar\)/.test(src) && /stepItemStillThere/.test(src));
ok('8d walk radar without full BFS', /без полного пути — курс/.test(src) && !/if \(dest\.fromRadar\) return false/.test(src));
ok('8e turn timer', /function readTurnTimerSec/.test(src) && /time_left/.test(src) && /мало времени/.test(src));
ok('8f magselect wait 3.5s', /while \(Date\.now\(\) - t0 < 3500\)/.test(src));
ok('8g goto UI', /id="k5-goto"/.test(src) && /gotoTarget/.test(src) && /идти к точке/.test(src));
ok('8h radar longHop no faceAndStep', /if \(longHop\) \{[\s\S]*?hopFreeEnd/.test(src) && /fromRadar \? ' \(радар\)'/.test(src));
ok('8i radar mush cat filter', /typeAtCell/.test(src) && /knownType && !mushroomCatAllowed/.test(src));

console.log('--- 9. клон / жила / тактика ---');
ok('9a occupied checks UNBS', /Number\(u\.x\) === Number\(x\)/.test(src) && /banSummonHex/.test(src));
ok('9b force close magbook', /closeMagbookWin\(handle, true\)/.test(src) && /dismissBattleDialogs/.test(src));
ok('9c busy hex error', /isBusyHexError/.test(src) && /занят/.test(src));
ok('9d radius tree only trees', /kind === 'tree'\) return it\.kind === 'tree'/.test(src));
ok('9e face vein before search', /function approachAndFaceVein/.test(src) && /к лицу /.test(src));
ok('9f strip basket for pick', /Снял:/.test(src) && /equippedToolKind !== wantKind\) force = true/.test(src));
ok('9g battle tactic cfg', /tactic: 'standard'/.test(src) && /battle\.tactic/.test(src) && /агрессивный \(2 удара\)/.test(src));
ok('9h tactic apply', /tactic === 'defense'/.test(src) && /tactic === 'aggressive'/.test(src) && /1 удар \+ 2 блока/.test(src));
ok('9i magbook iframe only', /Только iframe/.test(src) && /left:-4000px/.test(src) && /opacity:0/.test(src));
{
  const m = src.match(/function launchMagselect\([\s\S]*?\n  function magselectLooksReady/);
  ok('9j launchMagselect no goRC', !!(m && !/goRC/.test(m[0])));
}
ok('9k session finish battle', /sessionExpirePending/.test(src) && /доигрываем/.test(src));
ok('9l session 20–120', /sessionMinMin: 20/.test(src) && /sessionMaxCap: 120/.test(src) && /случайно 20–120/.test(src));

console.log('\nCustomer contracts: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
