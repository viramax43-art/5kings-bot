import { launchBrowser, ensureLoggedIn, getActFrame, sleep, log } from './src/browser.js';
import fs from 'fs';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  try {
    await d.accept();
  } catch (_) {}
});
await ensureLoggedIn(page, context);
await getActFrame(page);

async function act() {
  return page.frames().find((f) => /gates|newforest|arena|place|5kings/i.test(f.url())) || page.mainFrame();
}

async function go(url) {
  await page.evaluate((u) => {
    const w = document.getElementById('d_act')?.contentWindow;
    if (typeof w.goRC === 'function') w.goRC(u);
    else w.location.href = u;
  }, url);
  await sleep(2500);
}

async function snap() {
  return page.evaluate(() => {
    const w = document.getElementById('d_act')?.contentWindow;
    const g = w?.global_data?.my_group;
    return {
      href: w?.location?.href,
      ready: !!(w?.Client && g),
      my: g ? { x: g.posx, y: g.posy } : null,
      text: ((w?.document?.body?.innerText || '') + '').replace(/\s+/g, ' ').slice(0, 220),
      hasCreate: !!w?.document?.querySelector('input[name="actNewMaps-CreateGroup"]'),
      hasSubmit: [...(w?.document?.querySelectorAll('input[type=submit]') || [])].map((b) => b.value),
    };
  });
}

// leave if somehow stuck
await page.evaluate(() => {
  const w = document.getElementById('d_act')?.contentWindow;
  try {
    w.Client?.send?.('actNewMaps-ReturnToTown=1');
  } catch (e) {}
});
await sleep(3000);
await go('gates.html');
let s = await snap();
log('gates1', s);

if (s.ready) {
  console.log('already ready', s.my);
  fs.writeFileSync('_tmp_create_ok.json', JSON.stringify(s, null, 2));
  await browser.close();
  process.exit(0);
}

if (!s.hasCreate) {
  // maybe still loading forest client without group — return and reopen
  await go('place.html');
  await go('gates.html');
  s = await snap();
  log('gates2', s);
}

if (s.hasCreate) {
  // Use Playwright click inside d_act frame
  const frame = page.frameLocator('#d_act');
  await frame.locator('select[name=ulimit]').selectOption('1');
  await frame.locator('select[name=minlvl]').selectOption('3').catch(() => {});
  await frame.locator('select[name=maxlvl]').selectOption('50').catch(() => {});
  await frame.locator('input[type=submit][value="Подать заявку"]').click();
  log('clicked submit via frameLocator');
  await sleep(4000);
  for (let i = 0; i < 40; i++) {
    s = await snap();
    if (i % 4 === 0) log('wait', i, s.ready, (s.href || '').split('/').pop(), s.text.slice(0, 100));
    if (s.ready) break;
    await sleep(2000);
  }
}

fs.writeFileSync('_tmp_create_ok.json', JSON.stringify(s, null, 2));
console.log('FINAL', s.ready, s.my, s.href, s.text.slice(0, 120));
await browser.close();
