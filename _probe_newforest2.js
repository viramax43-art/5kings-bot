/**
 * Inspect newforest2.html global API after entering big forest via gates.
 */
import fs from 'fs';
import {
  launchBrowser,
  ensureLoggedIn,
  getActFrame,
  saveState,
  log,
  sleep,
} from './src/browser.js';

async function goAct(page, url) {
  await page.evaluate((u) => {
    const act = document.getElementById('d_act')?.contentWindow;
    if (!act) throw new Error('no d_act');
    if (typeof act.goRC === 'function') act.goRC(u);
    else if (typeof act.goR === 'function') act.goR(u);
    else act.location.href = u;
  }, url);
  await sleep(2000);
}

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);

  // Ensure in newforest2
  let href = await page.evaluate(() => document.getElementById('d_act')?.contentWindow?.location?.href);
  log('start href', href);
  if (!/newforest2/i.test(href || '')) {
    await goAct(page, 'gates.html');
    await page.evaluate(() => {
      const w = document.getElementById('d_act')?.contentWindow;
      const form = w?.document?.forms?.[0];
      if (form) {
        const ul = form.querySelector('[name=ulimit]');
        if (ul) ul.value = '1';
        form.submit();
      }
    });
    for (let i = 0; i < 20; i++) {
      await sleep(2000);
      href = await page.evaluate(() => document.getElementById('d_act')?.contentWindow?.location?.href);
      log('wait', i, href);
      if (/newforest2/i.test(href || '')) break;
    }
  }

  // wait scripts
  await sleep(5000);

  const info = await page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no' };
    const keys = Object.keys(w).filter((k) => {
      try {
        const v = w[k];
        return (
          typeof v === 'function' ||
          (v && typeof v === 'object' && (k.length <= 4 || /bot|map|craft|search|user|me|grid|cell|send|ws|socket|cu|gd|nf|forest/i.test(k)))
        );
      } catch (e) {
        return false;
      }
    });
    const interesting = {};
    for (const k of [
      'cu',
      'gd',
      'ws',
      'socket',
      'StartDobycha',
      'StartSearch',
      'TryReturnToTown',
      'IdtiPoDoroge',
      'RezhimAgres',
      'ChangeView',
      'myX',
      'myY',
      'UserID',
      'userid',
      'bots',
      'map',
      'NF',
      'nf',
      'ij',
      'f3',
    ]) {
      try {
        const v = w[k];
        interesting[k] =
          typeof v === 'function'
            ? 'fn'
            : v == null
              ? null
              : typeof v === 'object'
                ? { type: 'obj', keys: Object.keys(v).slice(0, 40) }
                : typeof v + ':' + String(v).slice(0, 80);
      } catch (e) {
        interesting[k] = 'err';
      }
    }
    const scripts = [...w.document.querySelectorAll('script[src]')].map((s) => s.src);
    const inlines = [...w.document.querySelectorAll('script:not([src])')].map((s) =>
      (s.textContent || '').slice(0, 500)
    );
    // probe common patterns
    let sendLike = [];
    for (const k of Object.getOwnPropertyNames(w)) {
      try {
        if (typeof w[k] === 'function' && /send|craft|search|move|dobych|walk|click/i.test(k)) sendLike.push(k);
      } catch (e) {}
    }
    return {
      href: w.location.href,
      scripts,
      inlines: inlines.slice(0, 10),
      interesting,
      sendLike: sendLike.slice(0, 80),
      keySample: keys.slice(0, 120),
      canvas: !!w.document.getElementById('canvas'),
      hasVorota: !!w.document.getElementById('vorota'),
    };
  });
  fs.writeFileSync('_tmp_newforest2_api.json', JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info, null, 2));

  // download main scripts locally for analysis
  for (const src of info.scripts || []) {
    if (!/newforest|forest|mapupdate/i.test(src)) continue;
    try {
      const res = await page.request.get(src);
      const body = await res.text();
      const name = src.split('/').pop().split('?')[0];
      fs.writeFileSync('_tmp_nf_' + name, body.slice(0, 500000));
      log('saved', name, body.length);
    } catch (e) {
      log('fetch fail', src, e.message);
    }
  }

  await saveState(context);
} catch (e) {
  console.error(e);
} finally {
  await browser.close().catch(() => {});
}
