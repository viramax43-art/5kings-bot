import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const USER_JS = path.join(ROOT, 'tampermonkey', '5kings-bot.user.js');
function strip(src) {
  return src.replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/m, '');
}

const { browser, context, page } = await launchBrowser();
try {
  await ensureLoggedIn(page, context);
  await getActFrame(page);
  await page.evaluate(() => {
    localStorage.setItem(
      'K5BOT_cfg_v4',
      JSON.stringify({
        chaos: { autoJoin: true, autoCreate: true, fight: false, ensureKit: false },
        license: { enabled: false },
        captcha: { detect: false },
      })
    );
    localStorage.setItem('K5BOT_run_forest', 'false');
    localStorage.setItem('K5BOT_run_chaos', 'false');
    localStorage.setItem('K5BOT_captcha_pause', 'false');
  });
  const code = 'var unsafeWindow=window;\n' + strip(fs.readFileSync(USER_JS, 'utf8'));
  const bootInfo = await page.mainFrame().evaluate((src) => {
    try {
      eval(src);
    } catch (e) {
      return { evalErr: String(e.stack || e) };
    }
    return {
      runner: window.__k5_bot_runner,
      id: window.__k5_bot_id,
      same: window.__k5_bot_runner === window.__k5_bot_id,
      panel: !!document.getElementById('k5-panel'),
      d_act: !!document.getElementById('d_act'),
      isTop: window === window.top,
    };
  }, code);
  log('boot', bootInfo);
  await sleep(800);
  const afterClick = await page.evaluate(() => {
    document.getElementById('k5-chaos-start')?.click();
    return {
      chaosFlag: localStorage.getItem('K5BOT_run_chaos'),
      runner: window.__k5_bot_runner,
      id: window.__k5_bot_id,
      same: window.__k5_bot_runner === window.__k5_bot_id,
    };
  });
  log('afterClick', afterClick);
  await sleep(4000);
  const later = await page.evaluate(() => {
    const el = document.getElementById('k5-log');
    const w = document.getElementById('d_act')?.contentWindow;
    return {
      logs: el ? [...el.querySelectorAll('div')].map((d) => d.textContent).slice(0, 20) : [],
      file: String(w?.location?.href || '').split('/').pop(),
      chaosFlag: localStorage.getItem('K5BOT_run_chaos'),
      vorota: !!w?.document?.getElementById('vorota'),
      changeView: !!w?.document?.querySelector('input[name="actNewMaps-ChangeView"]'),
      StartDobycha: typeof w?.StartDobycha,
      Client: !!(w?.Client && w.Client.send),
      create: !!w?.document?.querySelector('input[name="actBattle-CreateHeader"]'),
      href: String(w?.location?.href || ''),
    };
  });
  log('later', later);
  fs.writeFileSync('_tmp_chaos_diag.json', JSON.stringify({ bootInfo, afterClick, later }, null, 2));
} finally {
  await browser.close();
}
