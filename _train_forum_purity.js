/**
 * Find forum topics for purity (licenses) and try to post application.
 */
import 'dotenv/config';
import fs from 'fs';
import { ensureLoggedIn, getActFrame, launchBrowser, log, saveState, sleep } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
page.on('dialog', async (d) => {
  log('DIALOG', d.message());
  await d.accept();
});
await ensureLoggedIn(page, context);

async function go(url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(2000);
}

async function dump(tag) {
  const frame = await getActFrame(page);
  const info = await frame.evaluate(() => ({
    href: location.href,
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 2500),
    links: [...document.querySelectorAll('a')]
      .map((a) => ({ t: (a.textContent || '').trim().slice(0, 80), h: a.getAttribute('href') || '', o: (a.getAttribute('onclick') || '').slice(0, 120) }))
      .filter((x) => x.t || x.h)
      .slice(0, 60),
  }));
  log(tag, info.href, info.text.slice(0, 500));
  fs.writeFileSync(`_tmp_forum_${tag}.json`, JSON.stringify(info, null, 2));
  return info;
}

// Try in-game forum entry points
for (const u of ['forum.html', 'forum.shtml', 'support.html', 'laws.shtml', 'lib.shtml?id=44']) {
  try {
    await go(u);
    await dump(u.replace(/[^\w]+/g, '_'));
  } catch (e) {
    log('fail', u, e.message);
  }
}

// Top-level navigate to mobile forum cave of dragons
await page.goto('https://m.5kings.ru/forum_fid_12.shtml', { waitUntil: 'domcontentloaded' });
await sleep(2500);
log('M FORUM', page.url(), (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
fs.writeFileSync(
  '_tmp_forum_fid12.html',
  await page.content()
);

// List topics mentioning ЧИСТОТА / лиценз
const topics = await page.evaluate(() =>
  [...document.querySelectorAll('a')]
    .map((a) => ({ t: (a.textContent || '').trim(), h: a.href }))
    .filter((x) => /чист|лиценз|профес|рудок|лесор/i.test(x.t + x.h))
    .slice(0, 40)
);
log('TOPICS', topics);

await saveState(context);
await browser.close();
