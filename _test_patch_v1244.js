/**
 * v1.2.44 — server napr confirm, pickaxe filter, equip verify, stay on equip fail
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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

ok('V 1.2.46', /@version\s+1\.2\.46/.test(src) && /VERSION = '1\.2\.46'/.test(src));
ok('serverNapr', /function serverNapr\(/.test(src));
ok('waitServerNapr', /async function waitServerNapr\(/.test(src));
ok('faceCell uses server', /async function faceCell[\s\S]{0,500}serverNapr\(win\)/.test(src));
ok('no wander on equip fail', !/нет инструмента, пауза 30с — иду блуждать/.test(src));
ok('holdCraftNearMe', /function holdCraftNearMe\(/.test(src));
ok('lastCraftFailReason', /lastCraftFailReason/.test(src));
ok('equip verify hand', /handHasTool\(wantKind\)[\s\S]{0,400}Экипировал/.test(src));
ok('findBag without wear', /equippedOnly \|\| anyTool/.test(src));
ok('pickaxe axe split', /function bagHasAxeWords[\s\S]{0,200}pickaxe/.test(src));
ok('no оружи reject before pick', /позитив раньше брони/.test(src));

// Isolated bagRowIsTool evaluation
const start = src.indexOf('function bagRowIdentity');
const end = src.indexOf('function findWearTarget');
ok('extract bag helpers', start > 0 && end > start);
if (start > 0 && end > start) {
  const chunk =
    'function normalizeItemName(s){return String(s||"").toLowerCase().replace(/\\u00a0/g," ").replace(/\\s+/g," ").replace(/ё/g,"е").trim();}\n' +
    src.slice(start, end) +
    '\n;({bagRowIsTool,bagHasPickWords,bagHasAxeWords,bagRowIdentity})';
  let api;
  try {
    api = vm.runInNewContext(chunk, {}, { timeout: 1000 });
  } catch (e) {
    ok('vm bag helpers', false, e.message);
    api = null;
  }
  if (api) {
    ok('Кирка → pick', api.bagRowIsTool('Кирка', 'pick') === true);
    ok('pickaxe → pick', api.bagRowIsTool('pickaxe', 'pick') === true);
    ok('Кирка pickaxe.gif → pick', api.bagRowIsTool('Кирка <img src="pickaxe.gif">', 'pick') === true);
    ok('Кирка Тип: оружие → pick', api.bagRowIsTool('Кирка Тип: оружие', 'pick') === true);
    ok('топор → not pick', api.bagRowIsTool('топор лесоруба', 'pick') === false);
    ok('топор → axe', api.bagRowIsTool('топор лесоруба', 'axe') === true);
    ok('pickaxe → not axe', api.bagRowIsTool('pickaxe', 'axe') === false);
  }
}

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
