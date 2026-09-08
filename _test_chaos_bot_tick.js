/**
 * Inject v1.2.9 bot, start chaos, confirm apps form (no forest ping-pong).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

async function snap(page) {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (!w) return { err: 'no' };
    const doc = w.document;
    return {
      file: String(w.location.href || '').split('/').pop(),
      forest: !!(doc.getElementById('vorota') || doc.querySelector('input[name="actNewMaps-ChangeView"]')),
      create: !!doc.querySelector('input[name="actBattle-CreateHeader"]'),
      joins: doc.querySelectorAll('input[name="actBattle-Join"]').length,
      inApp: /вы в заявке|ожидайте начала|покинуть заявку/i.test(doc.body?.innerText || ''),
    };
  });
}

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
const out = { at: new Date().toISOString() };
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  out.before = await snap(page);
  log('before', out.before);

  const code = 'var unsafeWindow=window;\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        chaos: {
          autoJoin: true,
          autoCreate: true,
          fight: false,
          ensureKit: false,
          reloadEmptyMs: 20000,
        },
        battle: { useMagic: false, summonHelper: false },
        license: { enabled: false },
        captcha: { detect: false },
      })
    );
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    localStorage.setItem('K5BOT_captcha_pause', 'false');
  });
  await page.mainFrame().evaluate((src) => {
    eval(src);
  }, code);
  await sleep(1200);
  const panel = await page.evaluate(() => !!document.getElementById('k5-panel'));
  log('panel', panel);
  out.panel = panel;
  await page.evaluate(() => document.getElementById('k5-chaos-start')?.click());
  const ticks = [];
  for (let i = 0; i < 10; i++) {
    await sleep(2000);
    const s = await snap(page);
    const L = await page.evaluate(() => {
      const el = document.getElementById('k5-log');
      return el ? [...el.querySelectorAll('div')].map((d) => d.textContent) : [];
    });
    ticks.push({ i, s, recent: L.slice(0, 12) });
    log('tick', i, s.file, 'create', s.create, 'joins', s.joins, 'inApp', s.inApp, 'forest', s.forest, L[0] || '');
    if ((s.create || s.joins > 0 || s.inApp) && /bmode_36/i.test(s.file || '')) break;
  }
  out.ticks = ticks;
  const lines = ticks.flatMap((t) => t.recent);
  const ping = lines.filter((l) => /нет формы заявки|открываю комнату/i.test(l));
  const opened = lines.filter((l) => /открываю список заявок|create \{|join \{|в заявке/i.test(l));
  out.checks = {
    panel,
    noOldPingPong: ping.length === 0,
    notForest: ticks.every((t) => !t.s.forest),
    sawBmode36: ticks.some((t) => /bmode_36/i.test(t.s.file || '')),
    sawApps: ticks.some((t) => /bmode_36/i.test(t.s.file || '') && (t.s.create || t.s.joins > 0 || t.s.inApp)),
    openedOrActed: opened.length > 0,
  };
  out.ok =
    out.checks.panel &&
    out.checks.noOldPingPong &&
    out.checks.notForest &&
    out.checks.sawBmode36 &&
    (out.checks.sawApps || out.checks.openedOrActed);
  log('checks', out.checks);
} catch (e) {
  out.error = String(e.stack || e);
  console.error(out.error);
} finally {
  fs.writeFileSync('_tmp_chaos_bot_tick.json', JSON.stringify(out, null, 2));
  console.log('OK', out.ok);
  await browser.close().catch(() => {});
}
process.exit(out.ok ? 0 : 1);
