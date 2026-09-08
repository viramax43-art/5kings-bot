import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import 'dotenv/config';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(ROOT, '.auth', 'storage-state.json');

const browser = await chromium.launch({ headless: false, channel: 'chrome' });
const context = await browser.newContext({
  storageState: fs.existsSync(STATE) ? STATE : undefined,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

page.on('response', (r) => {
  if (/5kings/i.test(r.url()) && r.request().resourceType() === 'document') {
    console.log('DOC', r.status(), r.url());
  }
});

await page.goto('https://5kings.ru/', { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => console.log('goto err', e.message));
await page.waitForTimeout(3000);
console.log('url', page.url());
const html = await page.content();
fs.writeFileSync('_tmp_live_root.html', html);
console.log('html len', html.length, 'sample', html.replace(/\s+/g, ' ').slice(0, 500));

// try login
const login = process.env.LOGIN;
const password = process.env.PASSWORD;
console.log('has creds', !!login, !!password, 'login=', login);

const formInfo = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input')].map((i) => ({
    type: i.type,
    name: i.name,
    id: i.id,
    value: (i.value || '').slice(0, 20),
  }));
  return { inputs: inputs.slice(0, 30), text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 400) };
});
console.log(JSON.stringify(formInfo, null, 2));

if (password) {
  // fill common login
  const user = page.locator('input[name="login"], input[name="username"], input#login, input[type="text"]').first();
  const pass = page.locator('input[type="password"]').first();
  if (await pass.count()) {
    if (await user.count()) await user.fill(login);
    await pass.fill(password);
    await page.locator('input[type="submit"], button[type="submit"], input[value*="ход"], input[value*="огин"]').first().click().catch(() => page.keyboard.press('Enter'));
    await page.waitForTimeout(5000);
    console.log('after login url', page.url());
    fs.writeFileSync('_tmp_live_after_login.html', await page.content());
    const text = await page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 500));
    console.log('text', text);
  }
}

// screenshot
await page.screenshot({ path: '_tmp_live_shot.png', fullPage: true });
console.log('shot saved');

// list cookies
const cookies = await context.cookies('https://5kings.ru');
console.log('cookies', cookies.map((c) => c.name + '=' + (c.value || '').slice(0, 12)));

await page.waitForTimeout(3000);
await browser.close();
