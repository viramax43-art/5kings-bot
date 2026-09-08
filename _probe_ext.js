import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = await context.newPage();

await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: '_tmp_ext_page.png', fullPage: true });

const info = await page.evaluate(() => {
  const mgr = document.querySelector('extensions-manager');
  const text = mgr?.shadowRoot?.textContent || document.body?.innerText || '';
  return text.replace(/\s+/g, ' ').slice(0, 1500);
});
console.log('EXT PAGE:', info);

const game = context.pages().find((p) => /5kings\.ru\/game/i.test(p.url()));
if (game) {
  const logs = [];
  game.on('console', (m) => logs.push(m.type() + ' ' + m.text().slice(0, 200)));
  const errs = await game.evaluate(() => {
    const topDoc = (() => {
      try {
        return window.top.document;
      } catch (e) {
        return document;
      }
    })();
    return {
      url: location.href,
      beacon: !!topDoc.getElementById('k5-beacon'),
      panel: !!topDoc.getElementById('k5-panel'),
      dact: !!document.getElementById('d_act'),
      extIds: [...document.querySelectorAll('script')].map((s) => s.src).filter(Boolean).slice(0, 20),
    };
  });
  console.log('GAME', errs);
  await game.reload({ waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 4000));
  console.log('LOGS', logs.slice(0, 40));
  const after = await game.evaluate(() => ({
    beacon: !!document.getElementById('k5-beacon'),
    panel: !!document.getElementById('k5-panel'),
  }));
  console.log('AFTER RELOAD', after);
}

process.exit(0);
