import fs from 'fs';
const ui = JSON.parse(fs.readFileSync('_tmp_forum_ui.json', 'utf8'));
console.log('total', ui.length);
console.log(ui.filter((x) => /submit|button|opisanie|actBlog|image|отправ/i.test(JSON.stringify(x))));
// also dump html around textarea from after_post if exists
const files = ['_tmp_forum_after_post.html', '_tmp_forum_fid12.html'];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, 'utf8');
  const i = h.indexOf('opisanie');
  if (i >= 0) console.log('\n', f, h.slice(i - 200, i + 800));
}
