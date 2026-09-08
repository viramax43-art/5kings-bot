/**
 * Forest-only live test after chaos passed: enter gates via ulimit form, verify search cadence.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
const REPORT = path.join(ROOT, '_tmp_test_v124e_forest.json');

const gm = `
function GM_getValue(k, def){try{const v=localStorage.getItem('K5BOT_'+k);if(v==null)return def;return JSON.parse(v)}catch(e){return def}}
function GM_setValue(k,v){try{localStorage.setItem('K5BOT_'+k,JSON.stringify(v))}catch(e){}}
function GM_addStyle(css){const s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s)}
var unsafeWindow=window;
`;
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function go(page, url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else if (typeof w.goR === 'function') w.goR(u);
    else w.location.href = u;
  }, url);
  await sleep(2500);
}

async function leaveFight(page) {
  for (let i = 0; i < 6; i++) {
    const bid = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      try {
        if (typeof w.Capitulate === 'function') w.Capitulate();
      } catch (e) {}
      try {
        if (w.BID) w.PrepareReq?.('bid=' + w.BID + '&actBattle-Capitulate=1');
      } catch (e2) {}
      try {
        if (typeof w.TryReturnToTown === 'function') w.TryReturnToTown();
      } catch (e3) {}
      try {
        w.Client?.send?.('actNewMaps-ReturnToTown=1');
      } catch (e4) {}
      return w?.BID || null;
    });
    log('leave', i, 'BID', bid);
    if (!bid) break;
    await sleep(3000);
  }
  await go(page, 'place.html');
  await sleep(1500);
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    const ul = w?.document?.querySelector('[name=ulimit]');
    return {
      file: String(w?.location?.href || '').split('/').pop(),
      readyBig: !!(w?.Client && g),
      BID: w?.BID || null,
      my: g ? { x: g.posx, y: g.posy } : null,
      hasUlimit: !!ul,
      formNames: [...(w?.document?.forms || [])].map((f) => f.name || f.id || f.action || 'anon').slice(0, 8),
      inputs: [...(w?.document?.querySelectorAll('input') || [])]
        .map((i) => ({ n: i.name, v: (i.value || '').slice(0, 40), t: i.type }))
        .filter((x) => x.n || /подать|создать|заявк/i.test(x.v))
        .slice(0, 20),
      text: ((w?.document?.body?.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 280),
    };
  });
}

async function inject(page) {
  const code = gm + '\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    const base = {
      forest: {
        collectTrees: true,
        collectOre: false,
        collectHerbs: false,
        collectMushrooms: false,
        autoSearch: true,
        searchEverySteps: 5,
        searchRadius: 5,
        equipTool: false,
        delayMin: 400,
        delayMax: 700,
      },
      battle: { delayMin: 7000, delayMax: 8000, healBelowHpPct: 30, summonHelper: true, useMagic: true },
      chaos: { ensureKit: false, autoJoin: false, autoCreate: false, fight: false },
      license: { enabled: false },
    };
    localStorage.setItem('K5BOT_cfg_v4', JSON.stringify(base));
    localStorage.setItem('K5BOT_run_forest', JSON.stringify(false));
    localStorage.setItem('K5BOT_run_chaos', JSON.stringify(false));
  });
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
  return !!((await page.evaluate(() => window.top.document.getElementById('k5-panel'))));
}

async function botLines(page) {
  return page.evaluate(() => {
    const el = window.top.document.getElementById('k5-log');
    return el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 40) : [];
  });
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
  await leaveFight(page);
  report.inject = await inject(page);
  log('inject', report.inject);

  await go(page, 'gates.html');
  let s = await snap(page);
  report.gates1 = s;
  log('gates1', s.file, s.readyBig, s.hasUlimit, s.inputs, s.text.slice(0, 120));

  if (!s.readyBig) {
    // if redirected to arena — leave again and retry gates
    if (/arena|bmode|battle/i.test(s.file || '') || s.BID) {
      await leaveFight(page);
      await go(page, 'gates.html');
      s = await snap(page);
      report.gates2 = s;
      log('gates2', s.file, s.hasUlimit, s.text.slice(0, 120));
    }

    const create = await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const doc = w.document;
      if (typeof w.StartDobycha === 'function' && w.Client) {
        return { alreadyReady: true };
      }
      const cancel = [...doc.querySelectorAll('input')].find((n) => /отозвать/i.test(n.value || ''));
      if (cancel) {
        // already in group queue — wait
        return { waiting: cancel.value };
      }
      const ul = doc.querySelector('[name=ulimit]');
      if (ul) {
        ul.value = '1';
        const form = ul.form;
        const btn =
          (form &&
            [...form.querySelectorAll('input[type=submit], input[type=button], button')].find((b) =>
              /подать|создать|заявк|войти|ok/i.test(b.value || b.textContent || '')
            )) ||
          null;
        if (btn && form?.requestSubmit) form.requestSubmit(btn);
        else if (btn) btn.click();
        else if (form) form.submit();
        else ul.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          viaUlimit: true,
          btn: btn ? btn.value || btn.textContent : null,
          action: form?.action || null,
          htmlSnippet: form ? form.innerHTML.slice(0, 300) : null,
        };
      }
      // fallback: any submit near "группу"
      const btn2 = [...doc.querySelectorAll('input[type=submit]')].find((b) => /подать|создать|заявк/i.test(b.value || ''));
      if (btn2) {
        btn2.click();
        return { viaBtn: btn2.value };
      }
      return {
        noForm: true,
        forms: [...doc.forms].map((f) => f.innerHTML.slice(0, 120)),
        text: (doc.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
      };
    });
    report.create = create;
    log('create', create);

    let entered = null;
    for (let i = 0; i < 36; i++) {
      await sleep(2500);
      entered = await snap(page);
      if (i % 4 === 0) log('waitF', i, entered.file, entered.readyBig, entered.text.slice(0, 80));
      if (entered.readyBig) break;
      // bounced to arena?
      if (/arena|bmode/i.test(entered.file || '') && i > 2 && i % 8 === 0) {
        await go(page, 'gates.html');
      }
    }
    report.enter = entered;
  } else {
    report.enter = s;
  }

  if (report.enter?.readyBig) {
    await page.evaluate(() => window.top.document.getElementById('k5-forest-start')?.click());
    await sleep(45000);
    const lines = await botLines(page);
    const steps = lines.filter((l) => /Большой лес: шаг/.test(l));
    const searches = lines.filter((l) => /Большой лес: поиск/.test(l));
    const dobycha = lines.filter((l) => /Большой лес: добыча/.test(l));
    report.forest = {
      steps: steps.length,
      searches: searches.length,
      dobycha: dobycha.length,
      stepSamples: steps.slice(0, 12),
      searchSamples: searches.slice(0, 6),
      dobychaSamples: dobycha.slice(0, 6),
      okNoBlind: dobycha.length === 0 || dobycha.every((l) => /перед вами/i.test(l)),
      okSearchRare: searches.length === 0 || searches.length <= Math.ceil(Math.max(steps.length, 1) / 4) + 2,
      lines: lines.slice(0, 20),
    };
    log('FOREST', report.forest);
    await page.evaluate(() => window.top.document.getElementById('k5-forest-stop')?.click());
  }
} catch (e) {
  report.error = String(e.stack || e);
  log('ERR', report.error);
} finally {
  report.verdict = {
    forestEntered: !!report.enter?.readyBig,
    forestNoBlindDobycha: report.forest?.okNoBlind ?? null,
    forestSearchNotEveryStep: report.forest?.okSearchRare ?? null,
    forestHasSteps: (report.forest?.steps || 0) > 0,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n=== VERDICT ===\n' + JSON.stringify(report.verdict, null, 2));
  await browser.close().catch(() => {});
}
process.exit(Object.values(report.verdict).some((v) => v === false) ? 1 : 0);
