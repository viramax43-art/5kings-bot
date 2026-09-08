import fs from 'fs';
const h = fs.readFileSync('_tmp_info_now.html', 'utf8');
const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
console.log(text.slice(0, 2500));
console.log('---');
for (const n of ['Уровень', 'уровен', 'лиценз', 'Рудокоп', 'Лесоруб', 'Опыт', 'чистот', 'ступе', 'Наличность']) {
  const i = text.indexOf(n);
  if (i >= 0) console.log(n, '=>', text.slice(Math.max(0, i - 40), i + 140));
}
const m = h.match(/"lvl"\s*:\s*(\d+)/);
console.log('lvl json', m && m[1]);
