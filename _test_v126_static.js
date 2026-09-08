/**
 * Static checks for v1.2.6 forest/battle fixes.
 */
import fs from 'fs';

const src = fs.readFileSync('tampermonkey/5kings-bot.user.js', 'utf8');
const checks = [
  ['version 1.2.6', /VERSION = '1\.2\.6'/],
  ['NF herbs', /herbs:\s*range\(77,\s*97\)/],
  ['NF mushrooms', /mushrooms:\s*range\(427,\s*449\)/],
  ['NF copper', /copper:\s*\[74,\s*75/],
  ['refreshCfg', /function refreshCfg\(/],
  ['faceAndStep', /async function faceAndStep\(/],
  ['stuck detect', /stuckCount/],
  ['equipCraftTool', /async function equipCraftTool\(/],
  ['no unconditional heal after summon', /повторный хил только при реальной нужде/],
  ['dead skip', /мёртв\/без HP/],
  ['helper cooldown', /helperFailUntil/],
  ['cfg sync note', /Панель живёт в top/],
  ['radius hint', /dir = 'radius'/],
];

let fail = 0;
for (const [name, re] of checks) {
  const ok = re.test(src);
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) fail++;
}

// ensure orphaned duplicate summon footer gone
if (/magbook открыт, «.*» не найден \(клетка/.test(src)) {
  console.log('WARN old helper log still present (ok if only in comments)');
}
if (/await tryBattleHealOrMagic\(win, live\);\s*\n\s*\n\s*const live2/.test(src)) {
  console.log('FAIL unconditional heal still present');
  fail++;
} else {
  console.log('PASS no unconditional heal call');
}

process.exit(fail ? 1 : 0);
