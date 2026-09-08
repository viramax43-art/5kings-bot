/**
 * Enter big forest via gates (robust) + short v1.2.4 behavior sample.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124b_report.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('TM_GM_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('TM_GM_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function actEval(page, fn, arg) {
  return page.evaluate(fn, arg);
}

async function go(page, url) {
  await actEval(page, (u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2500);
}

async function snap(page) {
  return actEval(page, () => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      href: w?.location?.href,
      file: String(w?.location?.href || '').split('/').pop(),
      readyBig: !!(w?.Client && g),
      we: w?.global_data?.wait_event,
      my: g ? { x: g.posx, y: g.posy, stay: g.stay } : null,
      text: (w?.document?.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
      hasUlimit: !!w?.document?.querySelector('[name=ulimit]'),
    };
  });
}

async function inject(page, forestCfg, battleCfg) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(
    ({ forestCfg, battleCfg }) => {
      localStorage.setItem('K5BOT_run_forest', 'false');
      localStorage.setItem('K5BOT_run_chaos', 'false');
      const cfg = JSON.parse(localStorage.getItem('K5BOT_cfg_v4') || '{}');
      cfg.forest = Object.assign({}, cfg.forest || {}, forestCfg || {});
      cfg.battle = Object.assign({}, cfg.battle || {}, battleCfg || {});
      cfg.chaos = Object.assign({}, cfg.chaos || {}, { autoJoin: true, autoCreate: true, fight: true, ensureKit: true, maxp: 3 });
      cfg.license = Object.assign({}, cfg.license || {}, { enabled: false });
      localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(cfg));
    },
    { forestCfg, battleCfg }
  );
  for (const f of page.frames()) {
    try {
      await f.evaluate((src) => {
        try {
          eval(src);
        } catch (e) {}
      }, code);
    } catch (e) {}
  }
  await sleep(800);
  return actEval(page, () => !!window.top.document.getElementById('k5-panel'));
}

async function botLines(page) {
  return actEval(page, () => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 50) : [];
  });
}

async function enterForest(page) {
  // existing session?
  await go(page, 'newforest2.html');
  await sleep(3000);
  let s = await snap(page);
  if (s.readyBig) return s;

  for (const mode of ['gates.html', 'gates_mode_1.html', 'gates_mode_2.html', 'gates_mode_3.html']) {
    await actEval(page, (u) => {
      document.getElementById('d_act').src = u + (u.includes('?') ? '&' : '?') + 'xdac=' + Math.random();
    }, mode);
    await sleep(4500);
    s = await snap(page);
    log('try', mode, s.hasUlimit, s.text.slice(0, 120));
    if (s.readyBig) return s;
    if (!s.hasUlimit && !/Создайте свою группу|присоединитесь/i.test(s.text)) continue;

    const created = await actEval(page, () => {
      const w = document.getElementById('d_act')?.contentWindow;
      const doc = w.document;
      const ul = doc.querySelector('[name=ulimit]');
      if (ul) ul.value = '1';
      // join existing if any
      const join = [...doc.querySelectorAll('input[type=submit],input[type=button],a')].find((b) =>
        /войти|принять|присоед/i.test(b.value || b.textContent || '')
      );
      if (join) {
        join.click();
        return { join: join.value || join.textContent };
      }
      const btn = [...doc.querySelectorAll('input[type=submit],input[type=button]')].find((b) =>
        /подать|заявк|создать/i.test(b.value || '')
      );
      if (btn) {
        btn.click();
        return { create: btn.value };
      }
      if (doc.forms[0]) {
        doc.forms[0].submit();
        return { form: true };
      }
      // fallback: look for actHunter / actNewMaps create
      const hidden = doc.querySelector('input[name*=CreateGroup], input[name*=create]');
      if (hidden && hidden.form) {
        hidden.form.submit();
        return { hidden: hidden.name };
      }
      return {
        fail: true,
        html: doc.body.innerHTML.slice(0, 2500),
        inputs: [...doc.querySelectorAll('input,select')].map((i) => i.name + ':' + i.value).slice(0, 40),
      };
    });
    log('action', created);
    if (created.html) fs.writeFileSync('_tmp_gates_body.html', created.html);
    for (let i = 0; i < 30; i++) {
      await sleep(2500);
      s = await snap(page);
      if (i % 3 === 0) log('wait', i, s.file, s.readyBig, s.my, s.text.slice(0, 80));
      if (s.readyBig) return s;
      if (/newforest/i.test(s.file || '')) {
        await sleep(3000);
        s = await snap(page);
        if (s.readyBig) return s;
      }
    }
  }
  return s;
}

const report = { at: new Date().toISOString() };
const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});

try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  // leave maps if stuck
  await actEval(page, () => {
    const w = document.getElementById('d_act')?.contentWindow;
    try {
      w.TryReturnToTown?.();
    } catch (e) {}
    try {
      w.Client?.send?.('actNewMaps-ReturnToTown=1');
    } catch (e2) {}
  });
  await sleep(4000);

  const entered = await enterForest(page);
  report.forestEnter = entered;
  log('ENTERED', entered.readyBig, entered.file);

  if (entered.readyBig) {
    await inject(page, {
      collectTrees: true,
      collectCopper: false,
      collectIron: false,
      collectGold: false,
      collectHerbs: false,
      collectMushrooms: false,
      autoSearch: true,
      searchEverySteps: 5,
      equipTool: false,
      delayMin: 350,
      delayMax: 600,
    }, {});
    await actEval(page, () => window.top.document.getElementById('k5-forest-start')?.click());
    await sleep(40000);
    const lines = await botLines(page);
    const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
    const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
    const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
    report.trees = {
      steps: steps.length,
      searches: searches.length,
      dobycha: dobycha.length,
      stepSamples: steps.slice(0, 10),
      searchSamples: searches.slice(0, 5),
      dobychaSamples: dobycha.slice(0, 5),
      okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами|event/i.test(l)),
      okSearchRare: searches.length <= Math.ceil(steps.length / 4) + 2,
      lines: lines.slice(0, 20),
    };
    log('TREES', report.trees);

    await actEval(page, () => window.top.document.getElementById('k5-forest-stop')?.click());
    await sleep(1000);

    // herbs-only reinject
    await inject(page, {
      collectTrees: false,
      collectCopper: false,
      collectIron: false,
      collectGold: false,
      collectHerbs: true,
      collectMushrooms: true,
      autoSearch: true,
      searchEverySteps: 5,
      equipTool: false,
      delayMin: 350,
      delayMax: 600,
    }, {});
    await actEval(page, () => window.top.document.getElementById('k5-forest-start')?.click());
    await sleep(30000);
    const hlines = await botLines(page);
    report.herbs = {
      searches: hlines.filter((l) => /Большой лес: поиск/.test(l)).length,
      dobycha: hlines.filter((l) => /Большой лес: добыча/.test(l)).length,
      steps: hlines.filter((l) => /Большой лес: шаг/.test(l)).length,
      toResource: hlines.filter((l) => /к ресурсу/.test(l)).length,
      lines: hlines.slice(0, 20),
    };
    report.herbs.ok = report.herbs.searches === 0 && report.herbs.dobycha === 0;
    log('HERBS', report.herbs);
    await actEval(page, () => window.top.document.getElementById('k5-forest-stop')?.click());
    await actEval(page, () => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        w.Client?.send?.('actNewMaps-ReturnToTown=1');
      } catch (e) {}
    });
    await sleep(5000);
  }

  // CHAOS with measurable delay
  await go(page, 'arena_room_1_bmode_36.html');
  const delayMin = 7000;
  const delayMax = 8000;
  await inject(page, {}, {
    delayMin,
    delayMax,
    healBelowHpPct: 30,
    useMagic: true,
    magicChance: 0,
    suboptimalChance: 0,
    summonHelper: true,
  });
  await actEval(page, () => window.top.document.getElementById('k5-chaos-start')?.click());

  let battle = null;
  for (let i = 0; i < 80; i++) {
    battle = await actEval(page, () => {
      const w = document.getElementById('d_act')?.contentWindow;
      return {
        BID: w?.BID || null,
        label: (w?.document?.getElementById('TurnLabel') || {}).innerText || '',
        hp: w?.ME?.hp,
        mhp: w?.ME?.mhp,
        href: w?.location?.href,
      };
    });
    if (i % 10 === 0) {
      const lines = await botLines(page);
      log('chaos', i, battle.BID, battle.label, lines[0]);
    }
    if (battle.BID) break;
    // if stuck in app too long, try reload room / create
    if (i === 25 || i === 50) {
      await go(page, 'arena_room_1_bmode_36.html');
    }
    await sleep(2000);
  }
  report.chaosBattle = battle;
  if (battle?.BID) {
    await sleep(40000);
    const lines = await botLines(page);
    const pauses = lines.filter((l) => /ваш ход — пауза/.test(l));
    const heals = lines.filter((l) => /— хил|хил через/.test(l));
    const actions = lines.filter((l) => /помощник|magbook|Бой ход|сближение/i.test(l));
    // parse times
    function sec(l) {
      const m = l.match(/\[(\d+):(\d+):(\d+)\]/);
      if (!m) return null;
      return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
    let minGap = null;
    for (const p of pauses) {
      const t0 = sec(p);
      if (t0 == null) continue;
      for (const a of actions) {
        const t1 = sec(a);
        if (t1 != null && t1 >= t0) {
          const gap = (t1 - t0) * 1000;
          if (minGap == null || gap < minGap) minGap = gap;
          break;
        }
      }
    }
    const hpPct = battle.mhp ? (100 * battle.hp) / battle.mhp : null;
    report.chaos = {
      pauses: pauses.length,
      heals: heals.length,
      actions: actions.length,
      minGapMs: minGap,
      delayOk: minGap == null || minGap >= delayMin - 1500,
      hpPct,
      healOk: hpPct == null || hpPct > 30 ? heals.length === 0 : true,
      lines: lines.slice(0, 25),
    };
    log('CHAOS', report.chaos);
  } else {
    report.chaos = { fail: true, lines: await botLines(page) };
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    forestEntered: !!report.forestEnter?.readyBig,
    treesSteps: (report.trees?.steps || 0) > 0,
    treesNoBlindDobycha: report.trees?.okNoBlind ?? null,
    treesSearchNotEveryStep: report.trees?.okSearchRare ?? null,
    herbsNoSearchNoDobycha: report.herbs?.ok ?? null,
    chaosInBattle: !!report.chaosBattle?.BID,
    chaosDelayOk: report.chaos?.delayOk ?? null,
    chaosNoPrematureHeal: report.chaos?.healOk ?? null,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
