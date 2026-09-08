/**
 * Check if Dragons approved purity / Рудокоп for test char.
 */
import 'dotenv/config';
import { ensureLoggedIn, getActFrame, launchBrowser, log, saveState, sleep } from './src/browser.js';

const UID = process.env.USER_ID || '960792';
const NICK = 'Игрок121323323';

async function go(page, url) {
  const frame = await getActFrame(page);
  await frame.evaluate((u) => {
    if (typeof goRC === 'function') goRC(u);
    else if (typeof goR === 'function') goR(u);
    else location.href = u;
  }, url);
  await sleep(1800);
}

async function actText(page) {
  const frame = await getActFrame(page);
  return frame.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 6000));
}

const { browser, context, page } = await launchBrowser();
await ensureLoggedIn(page, context);

await go(page, `info.html?user=${UID}`);
const info = await actText(page);
const hasPurity = /чист\s*перед\s*законом/i.test(info);
const hasRudokop = /рудокоп/i.test(info);
const licMatch = info.match(/професси[ия]:?\s*([^.]{0,200})/i);
log('INFO_HEAD', info.slice(0, 700));
log('INFO_PROF', licMatch ? licMatch[0] : '(нет блока профессий в срезе)');
log({ hasPurity, hasRudokop });

const pages = [
  'https://5kings.ru/forum_fid_12_tema_467_mpg_933.shtml',
  'https://5kings.ru/forum_fid_12_tema_467_mpg_934.shtml',
  'https://5kings.ru/forum_fid_12_tema_467.shtml',
];

let forumHit = null;
for (const url of pages) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const idx = text.indexOf(NICK);
  if (idx >= 0) {
    const around = text.slice(Math.max(0, idx - 40), idx + 280);
    log('FORUM', page.url(), around);
    forumHit = around;
    break;
  }
  // last page via >>
  if (/mpg_933/.test(url)) {
    const last = await page.evaluate(() => {
      const mpg = [...document.querySelectorAll('a')]
        .map((a) => Number((a.href.match(/mpg_(\d+)/) || [])[1] || 0))
        .filter(Boolean)
        .sort((a, b) => b - a)[0];
      return mpg || null;
    });
    if (last && last > 933) {
      const lastUrl = `https://5kings.ru/forum_fid_12_tema_467_mpg_${last}.shtml`;
      await page.goto(lastUrl, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      const t2 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      const i2 = t2.indexOf(NICK);
      if (i2 >= 0) {
        forumHit = t2.slice(Math.max(0, i2 - 40), i2 + 280);
        log('FORUM last', page.url(), forumHit);
      }
    }
  }
}

if (!forumHit) log('FORUM: ник в последних страницах не найден — смотри #9321 вручную');

const approvedForum = forumHit && /чист/i.test(forumHit) && !/отказ/i.test(forumHit);
log('RESULT', { hasPurity, hasRudokop, approvedForum, forumHit });

await saveState(context);
await browser.close();
process.exit(hasPurity || hasRudokop || approvedForum ? 0 : 3);
