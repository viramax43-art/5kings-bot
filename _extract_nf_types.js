import fs from 'fs';
const buf = fs.readFileSync('_tmp_nf_newforest_all.js');
// try windows-1251
const a = buf.toString('latin1');
const start = a.indexOf('var img_by_type');
const chunk = a.slice(start, start + 100000);
const re = /'(\d+)':\s*\{'img':'([^']*)'[^}]*?'(?:alt|title)':'([^']*)'/g;
const rows = [];
let m;
while ((m = re.exec(chunk))) {
  rows.push({ id: Number(m[1]), img: m[2], title: m[3] });
}
fs.writeFileSync(
  '_tmp_nf_types.json',
  JSON.stringify(
    rows.filter((r) => /travy|grib|med|zhelez|zolot|sosna|dub|skala|more|kust|el\b|listv|hvoi|rud/i.test(r.img + r.title)),
    null,
    2
  )
);
console.log('parsed', rows.length);
const interesting = rows.filter((r) =>
  /travy|grib|med|zhelez|zolot|sosna|dub|skala|more|rud|el2|el\b|listv|hvoi|kust|sunduk/i.test(r.img)
);
console.log(interesting.map((r) => r.id + ' ' + r.img).join('\n'));
