/**
 * v1.2.42 — mine fail clears front hint; better message split + fingerprint
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

ok('V 1.2.42', /@version\s+1\.2\.42/.test(src) && /VERSION = '1\.2\.42'/.test(src));
ok('craftHintFingerprint', /function craftHintFingerprint/.test(src) && /replace\(\/\\d\+\/g, '#'\)/.test(src));
ok('newline split', /raw\.split\(\/\\r\?\\n\+\/\)/.test(src));
ok('fallback no-dot', /\[\\s\\S\]\{0,120\}/.test(src));
ok('mine fail clears hint', /if \(!mined\) \{[\s\S]{0,200}bigForestHint = null/.test(src));
ok('mine fail lastSearchEmpty', /if \(!mined\) \{[\s\S]{0,250}lastSearchEmpty = true/.test(src));
ok('goto fail stop return', /маршрут не удался, стоп леса/.test(src));

const start = src.indexOf('const CRAFT_EVENT_RE');
const end = src.indexOf('function nfImgMeta');
let chunk = src.slice(start, end);
// craftKindFromHint used by fingerprint — stub
chunk +=
  '\nfunction craftKindFromHint(hint){const t=((hint&&hint.txt)||hint||\"\")+\"\";if(/мед/i.test(t))return\"copper\";if(/желез/i.test(t))return\"iron\";return null;}';
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
ok('mixed → right', a && a.dir === 'right', a);

const nl = sandbox.extractLastCraftMessage('Мусор чата\nМедь слева от вас\nМедь справа от вас');
ok('newline last right', /справа/i.test(nl), nl);

const fp1 = sandbox.craftHintFingerprint('left', 'Медь слева от вас 12');
const fp2 = sandbox.craftHintFingerprint('left', 'Медь слева от вас 99');
ok('fp ignores digits', fp1 === fp2, fp1 + ' vs ' + fp2);

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
