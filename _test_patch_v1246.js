/**
 * v1.2.46 — три бага из отчёта заказчика:
 *   1) «в радиусе 5» перебивало left/right → бот сканировал спиной;
 *   2) жила «справа» (железо) не отрабатывалась: поворот не подтверждён → stopForest,
 *      инструмент не подтверждён → stopForest;
 *   3) «Инструмент в сумке не найден (кирка)» без диагностики — неотличимо от «страница не та».
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'), 'utf8');
// убираем строчные комментарии — иначе старые формулировки в комментариях ломают проверки
const code = src.replace(/^\s*\/\/.*$/gm, '');

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

ok('V 1.2.46', /@version\s+1\.2\.46/.test(src) && /VERSION = '1\.2\.46'/.test(src));

// --- 1) приоритет маркеров направления ---
ok('DIR_PRIO есть', /const DIR_PRIO = \{ front: 5/.test(code));
ok('radiusN парсится', /radiusN = Math\.max\(1, Math\.min\(12/.test(code));
ok('radiusN в hint', /radiusN: radiusN/.test(code));

// --- 2) стойка и отсутствие stopForest там, где бот раньше вставал ---
ok('hintStanceIntact', /function hintStanceIntact\(win, hint\)/.test(code));
ok('snapshot naprSrv', /hint\.naprSrv = serverNapr\(win\) \|\| 0/.test(code));
ok('mineByRelativeHint сверяет стойку', /!hintStanceIntact\(win, hint\)[\s\S]{0,160}устарела/.test(code));

const turnBlock = /поворот не подтверждён[^\n]*\n([\s\S]{0,400})/.exec(code);
ok('поворот: блок найден', !!turnBlock);
ok('поворот: без stopForest', !!turnBlock && !/stopForest\(\)/.test(turnBlock[1]));
ok('поворот: markVeinScanned', !!turnBlock && /markVeinScanned/.test(turnBlock[1]));
ok('поворот: отпускает охоту', !!turnBlock && /craftHuntUntil = 0/.test(turnBlock[1]));

const equipBlock =
  /if \(BOT\.cfg\.forest\.equipTool\) \{\s*let ready = false;[\s\S]{0,900}?return true;\s*\}\s*\}/.exec(code);
ok('radius equip-fail: блок найден', !!equipBlock);
ok('radius equip-fail: без stopForest', !!equipBlock && !/stopForest\(\)/.test(equipBlock[0]));
ok('radius equip-fail: lastEquipFailAt', !!equipBlock && /lastEquipFailAt/.test(equipBlock[0]));
ok('radius equip-fail: сброс equippedToolKind', !!equipBlock && /equippedToolKind = null/.test(equipBlock[0]));
ok('radius equip-fail: отпускает охоту', !!equipBlock && /craftHuntUntil = 0/.test(equipBlock[0]));
ok('radius equip-fail: release vein', !!equipBlock && /markVeinScanned/.test(equipBlock[0]));

// --- 3) диагностика сумки ---
ok('bagDump', /BOT\.state\.bagDump = \{ path: paths\[pi\]/.test(code));
ok('radiusN управляет охотой', /Number\(\(hint && hint\.radiusN\) \|\| 0\) \|\| Number\(BOT\.cfg\.forest\.searchRadius\)/.test(code));
ok('диагностика в логе ошибки', /строк в сумке[\s\S]{0,140}sawToolish/.test(code));

// --- изолированный прогон парсера подсказок ---
const pStart = src.indexOf('  function parseBigForestHint(text) {');
const pEnd = src.indexOf('  function hintFresh(hint, ms) {');
ok('extract parseBigForestHint', pStart > 0 && pEnd > pStart);
if (pStart > 0 && pEnd > pStart) {
  const head = [
    'const CRAFT_EVENT_RE = /сосна|дуб|красн\\w*\\s*дерев|медь|желез|золот|дерев[оа]|в\\s+радиусе/i;',
    'const FRONT_EVENT_RE = /прямо\\s+перед\\s+вами|перед\\s+вами/i;',
    'function extractLastCraftMessage(t){return String(t||"").replace(/\\s+/g," ").trim();}',
    'function craftHintFingerprint(dir,v){return dir+"|"+String(v).length;}',
  ].join('\n');
  let api = null;
  try {
    api = vm.runInNewContext(head + '\n' + src.slice(pStart, pEnd) + '\n;({parseBigForestHint})', {}, { timeout: 1000 });
  } catch (e) {
    ok('vm parseBigForestHint', false, e.message);
  }
  if (api) {
    const radiusOnly = api.parseBigForestHint('Большой лес: железо в радиусе 5');
    ok('«в радиусе 5» → dir=radius', radiusOnly && radiusOnly.dir === 'radius', radiusOnly && radiusOnly.dir);
    ok('«в радиусе 5» → radiusN=5', radiusOnly && radiusOnly.radiusN === 5, radiusOnly && radiusOnly.radiusN);
    ok('«в радиусе 5» не front', !(radiusOnly && radiusOnly.front));

    const ironRight = api.parseBigForestHint('Большой лес: событие «железо справа от Вас»');
    ok('«железо справа» → dir=right', ironRight && ironRight.dir === 'right', ironRight && ironRight.dir);

    const rightThenRadius = api.parseBigForestHint('железо справа от Вас, в радиусе 5');
    ok(
      'справа + «в радиусе 5» → right (не radius)',
      rightThenRadius && rightThenRadius.dir === 'right',
      rightThenRadius && rightThenRadius.dir
    );
    ok(
      'справа + радиус → radiusN=5 сохранён',
      rightThenRadius && rightThenRadius.radiusN === 5,
      rightThenRadius && rightThenRadius.radiusN
    );

    const back = api.parseBigForestHint('в радиусе 5, руда сзади');
    ok('«радиус … сзади» → back', back && back.dir === 'back', back && back.dir);

    const front = api.parseBigForestHint('в радиусе 5 и прямо перед вами медь');
    ok('front бьёт радиус', front && front.dir === 'front', front && front.dir);

    const left = api.parseBigForestHint('в радиусе 5, медь слева от вас');
    ok('«радиус … слева» → left', left && left.dir === 'left', left && left.dir);

    ok('не-событие → null', api.parseBigForestHint('привет всем') === null);
  }
}

console.log('\nPatch map v1.2.46: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
