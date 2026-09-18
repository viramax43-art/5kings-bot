/**
 * v1.2.43 — forceNew only for OpenModal; chat history false; DOM chat last message
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

ok('V 1.2.46', /@version\s+1\.2\.46/.test(src) && /VERSION = '1\.2\.46'/.test(src));
ok('readLastCraftFromChatDom', /function readLastCraftFromChatDom/.test(src));
ok('search clears fp', /bigForestDoSearch[\s\S]{0,400}lastHintFp = ''/.test(src));
ok('search modal false', /modalTxt \? acceptForestHint\(win, modalTxt, false\)/.test(src));
ok('chat fallback false', /acceptForestHint\(win, txt, false\)/.test(src));
ok('tick modal false', /acceptForestHint\(win, mtxt, false\)/.test(src));
ok('OpenModal still true', /OpenModal = function[\s\S]{0,200}acceptForestHint\(win, txt, true\)/.test(src));
ok('mine fail clear', /if \(!mined\) \{[\s\S]{0,400}bigForestHint = null/.test(src));

console.log('\nPatch map: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
