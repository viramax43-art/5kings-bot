import fs from 'fs';
const a =
  fs.readFileSync('_tmp_nf_newforest_all.js', 'utf8') +
  fs.readFileSync('_tmp_nf_newforest_all_part2.js', 'utf8');
const start = a.indexOf('var img_by_type');
const chunk = a.slice(start, start + 120000);
fs.writeFileSync('_tmp_img_by_type_snip.js', chunk.slice(0, 80000));
const re = /(\d+)\s*:\s*\{[^}]{0,260}title\s*:\s*["']([^"']+)["']/gi;
const hits = [];
let m;
while ((m = re.exec(chunk)) && hits.length < 400) {
  const t = m[2];
  if (/гриб|трав|мед|желез|золот|сосна|дуб|скал|мор|дерев|руд|цвет|ягод|куст|пенек|пень/i.test(t)) {
    hits.push(m[1] + ':' + t);
  }
}
console.log(hits.join('\n'));
console.log('--- total filtered', hits.length);
// also dump all titles briefly
const all = [];
re.lastIndex = 0;
while ((m = re.exec(chunk)) && all.length < 500) {
  all.push(m[1] + ':' + m[2]);
}
fs.writeFileSync('_tmp_img_titles.json', JSON.stringify({ filtered: hits, sample: all.slice(0, 200) }, null, 2));
console.log('sample first 40:\n' + all.slice(0, 40).join('\n'));
