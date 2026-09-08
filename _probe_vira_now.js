import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages().find((p) => /5kings/i.test(p.url())) || context.pages()[0];

const info = await page.evaluate(() => {
  const t = (document.body && document.body.innerText) || '';
  return {
    url: location.href,
    title: document.title,
    dact: !!document.getElementById('d_act'),
    iframes: [...document.querySelectorAll('iframe')].map((f) => ({
      id: f.id,
      name: f.name,
      src: f.src,
    })),
    login: !!document.querySelector('#loginform, input[name="login"], input[name="pwd"]'),
    playBtn: document.querySelector('#input_button')
      ? {
          text: document.querySelector('#input_button').value || document.querySelector('#input_button').textContent,
          onclick: document.querySelector('#input_button').getAttribute('onclick'),
        }
      : null,
    snip: t.replace(/\s+/g, ' ').slice(0, 500),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '_tmp_vira_now.png', fullPage: true });
process.exit(0);
