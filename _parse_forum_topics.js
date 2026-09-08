import fs from 'fs';
const h = fs.readFileSync('_tmp_forum_fid12.html', 'utf8');
for (const line of h.split(/<\/a>/i)) {
  if (/ЧИСТОТА|лиценз|професс/i.test(line)) {
    const hm = line.match(/href="([^"]+)"/i);
    const t = line.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(-160);
    if (hm) console.log(hm[1], '|', t);
  }
}
