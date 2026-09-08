import fs from 'fs';
import { launchBrowser, ensureLoggedIn, sleep, log } from './src/browser.js';

const { browser, context, page } = await launchBrowser();
const out = { at: new Date().toISOString(), urls: [] };
try {
  await ensureLoggedIn(page, context);
  await sleep(2500);
  const urls = ['/magbook.chtml', '/mbook.chtml', '/bmbook.html'];
  for (const u of urls) {
    const html = await page.evaluate(async (path) => {
      const r = await fetch(path, { credentials: 'include' });
      return { status: r.status, text: await r.text() };
    }, u);
    const text = String(html.text || '');
    const spells = [];
    const re = /<(?:img|input|a|td)[^>]{0,200}?(?:title|alt|value)=["']([^"']{3,80})["'][^>]*>/gi;
    let m;
    while ((m = re.exec(text))) spells.push(m[1]);
    const names = [...text.matchAll(/>([^<]{0,40}(?:клон|помощ|восстанов|магselect|Применить)[^<]{0,40})</gi)].map(
      (x) => x[1].replace(/\s+/g, ' ').trim()
    );
    out.urls.push({
      u,
      status: html.status,
      len: text.length,
      magselect: /magselect\.chtml/i.test(text),
      helper: /помощник|вызвать\s*помощ/i.test(text),
      clone: /создать\s*клон|клон/i.test(text),
      makeCast: /MakeCast/i.test(text),
      sample: text.replace(/\s+/g, ' ').slice(0, 400),
      names: names.slice(0, 20),
    });
    log(u, 'len', text.length, 'clone', /клон/i.test(text), 'helper', /помощ/i.test(text), 'magselect', /magselect/i.test(text));
  }
  fs.writeFileSync('_tmp_magbook_spells_now.json', JSON.stringify(out, null, 2));
  console.log('WROTE _tmp_magbook_spells_now.json');
} catch (e) {
  console.error(e);
  out.err = String(e && e.message ? e.message : e);
  fs.writeFileSync('_tmp_magbook_spells_now.json', JSON.stringify(out, null, 2));
} finally {
  await browser.close();
}
