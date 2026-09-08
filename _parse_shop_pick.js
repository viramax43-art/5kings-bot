import fs from 'fs';

function win1251(buf) {
  let s = '';
  for (const c of buf) {
    if (c >= 0xc0 && c <= 0xff) s += String.fromCharCode(0x410 + (c - 0xc0));
    else if (c === 0xa8) s += 'Ё';
    else if (c === 0xb8) s += 'ё';
    else if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else if (c === 10 || c === 13 || c === 9) s += String.fromCharCode(c);
    else s += ' ';
  }
  return s;
}

// We don't have shop html saved as 1251 file - fetch from last evaluate dump
// Parse forest and bag
for (const f of ['_tmp_forest_now2.html', '_tmp_bag17_now.html']) {
  if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  console.log('\n====', f, t.length);
  console.log(t.slice(0, 2500));
}
