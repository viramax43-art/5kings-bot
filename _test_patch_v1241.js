/**
 * v1.2.41 — hint isolation, mine return, vein rotate, craft hunt lock, goto-only
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

ok('V 1.2.41', /@version\s+1\.2\.41/.test(src) && /VERSION = '1\.2\.41'/.test(src));
ok('extractLastCraftMessage', /function extractLastCraftMessage/.test(src));
ok('acceptForestHint fp', /function acceptForestHint/.test(src) && /lastHintFp/.test(src));
ok('mine returns dobycha', /return !!mined/.test(src));
ok('craftRadiusTried', /craftRadiusWasTried/.test(src) && /markCraftRadiusTried/.test(src));
ok('craftHuntActive', /function craftHuntActive/.test(src) && /охота за ресурсом/.test(src));
ok('gotoOnly', /gotoOnly/.test(src) && /skipStartTurn/.test(src));
ok('empty goto rejected', /!xs \|\| !ys/.test(src));

const start = src.indexOf('const CRAFT_EVENT_RE');
const end = src.indexOf('function nfImgMeta');
const chunk = src.slice(start, end);
const sandbox = {
  BOT: { state: {} },
  facingNapr: () => 5,
  currentNapr: () => 5,
  discoverMeBig: () => ({ x: 10, y: 20 }),
  getMe: () => ({ x: 10, y: 20 }),
  Date,
  console,
};
vm.createContext(sandbox);
vm.runInContext(chunk, sandbox);

const a = sandbox.parseBigForestHint('Медь слева от вас. Медь справа от вас.');
ok('last message wins right', a && a.dir === 'right', a);
const b = sandbox.parseBigForestHint('Железо в радиусе 5 клеток.');
ok('radius parse', b && b.dir === 'radius', b);
const c = sandbox.parseBigForestHint('Медь прямо перед вами');
ok('front parse', c && c.front && c.dir === 'front', c);

const h1 = sandbox.acceptForestHint(null, 'Медь слева от вас.', true);
const t1 = h1 && h1.t;
const h2 = sandbox.acceptForestHint(null, 'Медь слева от вас.', false);
ok('fp blocks refresh', h2 && h2.t === t1 && h2.napr === 5, h2);

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
