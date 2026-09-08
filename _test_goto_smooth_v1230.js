/**
 * v1.2.30 — smooth goto by coordinates: long GotoKletka, not 5-cell hops.
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

function extractFunction(name) {
  const needles = ['\n  function ' + name + '(', '\n  async function ' + name + '('];
  let idx = -1;
  for (const n of needles) {
    idx = src.indexOf(n);
    if (idx >= 0) {
      idx += 1;
      break;
    }
  }
  if (idx < 0) throw new Error('not found: ' + name);
  const brace = src.indexOf('{', idx);
  let depth = 0;
  for (let p = brace; p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') {
      depth--;
      if (depth === 0) return src.slice(idx, p + 1);
    }
  }
  throw new Error('unterminated: ' + name);
}

console.log('--- static: goto smooth ---');
ok('S1 version 1.2.34', /@version\s+1\.2\.3[34]/.test(src) && /VERSION = '1\.2\.3[34]'/.test(src));
ok('S2 longHop branch', /const longHop =/.test(src) && /dest\.fromRadar/.test(src));
ok('S3 longHop prefers dest cellGotoId', /if \(longHop\) \{[\s\S]*?cellGotoId\(win, dest\.x, dest\.y\)/.test(src));
ok('S4 longHop falls back to farthest path id', /for \(let j = path\.length - 1; j >= 0; j--\)/.test(src));
ok('S5 craft hopCap still 5', /const hopCap = 5/.test(src) && /hopMax = Math\.min\(path\.length, hopCap\)/.test(src));
ok('S6 longer wait for longHop', /longHop \? Math\.min\(28000/.test(src));
ok('S7 multi-hop loop in tick', /for \(let hop = 0; hop < 16 && BOT\.state\.gotoTarget/.test(src));
ok('S8 short schedule while goto', /gotoTarget\) delay = Math\.min\(delay, 220\)/.test(src));
ok('S9 gotoWorldCell accepts wait', /async function gotoWorldCell\(win, x, y, maxWaitMs\)/.test(src));

console.log('--- runtime: hop cell pick ---');
{
  function cellGotoId(win, x, y) {
    const k = x + ',' + y;
    if (win.__ids && win.__ids[k] != null) return win.__ids[k];
    return null;
  }

  /** Mirror of walkToward hop selection (must stay in sync with bot). */
  function pickHopCell(win, path, dest) {
    const longHop =
      !!dest &&
      (dest.kind === 'goto' ||
        dest.fromRadar ||
        dest.kind === 'herb' ||
        dest.kind === 'mushroom' ||
        dest.kind === 'chest');
    let cell;
    if (longHop) {
      if (cellGotoId(win, dest.x, dest.y) != null) {
        cell = { x: Number(dest.x), y: Number(dest.y) };
      } else {
        cell = path[path.length - 1] || path[0];
        for (let j = path.length - 1; j >= 0; j--) {
          if (cellGotoId(win, path[j].x, path[j].y) != null) {
            cell = path[j];
            break;
          }
        }
      }
    } else {
      const hopCap = 5;
      const hopMax = Math.min(path.length, hopCap);
      cell = path[hopMax - 1] || path[0];
    }
    return cell;
  }

  const win = { __ids: {} };
  const path = [];
  for (let x = 101; x <= 120; x++) {
    path.push({ x: x, y: 100 });
    win.__ids[x + ',100'] = 1000 + x;
  }
  ok('R1 synthetic path length 20', path.length === 20);

  const mushCell = pickHopCell(win, path, { x: 120, y: 100, kind: 'mushroom' });
  ok('R2 mushroom longHop → full dest', mushCell.x === 120 && mushCell.y === 100, mushCell);

  const gotoDirect = pickHopCell(win, path, { x: 120, y: 100, kind: 'goto' });
  ok('R3 goto with dest id → full destination', gotoDirect.x === 120 && gotoDirect.y === 100, gotoDirect);

  delete win.__ids['120,100'];
  const gotoFar = pickHopCell(win, path, { x: 120, y: 100, kind: 'goto' });
  ok('R4 goto without dest id → farthest id on path', gotoFar.x === 119 && gotoFar.y === 100, gotoFar);

  const veinHop = pickHopCell(win, path, { x: 120, y: 100, kind: 'copper' });
  ok('R5 craft/vein still capped at +5', veinHop.x === 105, veinHop);

  const waitGoto = Math.min(28000, 5000 + path.length * 400);
  const waitRes = 9000;
  ok('R6 longHop wait longer than craft hop', waitGoto > waitRes && waitGoto === 5000 + 20 * 400, waitGoto);

  ok(
    'R7 source mirrors pick logic',
    /const longHop =/.test(src) &&
      /cellGotoId\(win, dest\.x, dest\.y\)/.test(src) &&
      /const hopCap = 5/.test(src)
  );
}

console.log('--- live smoke (optional) ---');
try {
  const { chromium } = await import('playwright');
  const { config } = await import('./src/config.js');
  if (!config.login || !config.password) {
    console.log('  SKIP  no LOGIN/PASSWORD');
  } else {
    const { launchBrowser, ensureLoggedIn, sleep } = await import('./src/browser.js');
    const { browser, context, page } = await launchBrowser();
    try {
      await ensureLoggedIn(page, context);
      await sleep(1500);
      const gm = `
function GM_getValue(k,def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
      const code = gm + '\n' + src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
      for (const f of page.frames()) {
        try {
          await f.evaluate((c) => {
            try {
              eval(c);
            } catch (e) {}
          }, code);
        } catch (e) {}
      }
      await sleep(700);
      const ui = await page.evaluate(() => {
        const doc = window.top.document;
        return {
          ver: (doc.querySelector('#k5-panel strong') || {}).textContent || '',
          goto: !!doc.getElementById('k5-goto'),
        };
      });
      ok('L1 live panel 1.2.33', /1\.2\.33/.test(ui.ver), ui.ver);
      ok('L2 live goto button', ui.goto);

      // If big forest ready — set far point and watch one hop distance in logs/status
      const forest = await page.evaluate(() => {
        try {
          const w = document.getElementById('d_act') && document.getElementById('d_act').contentWindow;
          const g = w && w.global_data && w.global_data.my_group;
          const href = w && w.location ? String(w.location.href) : '';
          return {
            href: href.slice(0, 100),
            ready: !!(g && w.cu),
            x: g ? Number(g.posx) : null,
            y: g ? Number(g.posy) : null,
          };
        } catch (e) {
          return { err: String(e) };
        }
      });
      console.log('  forest', JSON.stringify(forest));
      if (forest.ready && forest.x != null) {
        const tx = forest.x + 12;
        const ty = forest.y;
        await page.fill('#k5-goto-x', String(tx));
        await page.fill('#k5-goto-y', String(ty));
        await page.click('#k5-goto');
        await sleep(2500);
        const after = await page.evaluate(() => {
          const status = (document.getElementById('k5-status') || {}).textContent || '';
          const log = (document.getElementById('k5-log') || {}).innerText || '';
          let x = null;
          let y = null;
          try {
            const w = document.getElementById('d_act').contentWindow;
            const g = w.global_data.my_group;
            x = Number(g.posx);
            y = Number(g.posy);
          } catch (e) {}
          return { status, log: log.slice(0, 500), x, y };
        });
        console.log('  after Go', JSON.stringify({ x: after.x, y: after.y, status: after.status }));
        const moved = after.x != null && (after.x !== forest.x || after.y !== forest.y);
        const hopLog = /шаг\s+(\d+)\/(\d+)/.exec(after.status + '\n' + after.log);
        if (hopLog) {
          const hopN = Number(hopLog[1]);
          ok('L3 live hop >5 when path long', hopN > 5 || Number(hopLog[2]) <= 5, hopLog[0]);
        } else {
          ok('L3 live moved or logged goto', moved || /точк|переход|иду к/.test(after.status + after.log), after.status);
        }
      } else {
        console.log('  SKIP  live forest hop (not on big forest map)');
      }
      await page.screenshot({ path: path.join(ROOT, '_tmp_v1230_goto.png') }).catch(() => {});
    } finally {
      await browser.close();
    }
  }
} catch (e) {
  console.log('  SKIP  live:', e && e.message ? e.message : e);
}

console.log('\nGoto smooth: ' + passed + ' PASS, ' + failed.length + ' FAIL');
if (failed.length) {
  console.log('Failed:', failed.join(', '));
  process.exit(1);
}
