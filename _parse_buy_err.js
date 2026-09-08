import fs from 'fs';

function win1251(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let s = '';
  for (const c of b) {
    if (c >= 0xc0 && c <= 0xff) s += String.fromCharCode(0x410 + (c - 0xc0));
    else if (c === 0xa8) s += 'Ё';
    else if (c === 0xb8) s += 'ё';
    else if (c === 0x98) s += 'ё'; // sometimes
    else if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else if (c === 10 || c === 13 || c === 9) s += String.fromCharCode(c);
    else s += ' ';
  }
  return s;
}

for (const f of ['_tmp_buy_rudokop_now.html', '_tmp_info_rudokop.html', '_tmp_buy_result.html']) {
  if (!fs.existsSync(f)) continue;
  const t = win1251(fs.readFileSync(f));
  console.log('\n====', f, '====');
  const pr = t.match(/preRoll\("([^"]*)","([^"]*)"\)/);
  if (pr) console.log('preRoll:', pr[1], '|', pr[2]);
  for (const k of ['Ошиб', 'чистот', 'рудокоп', 'лиценз', 'закон', 'необход', 'не хват', 'приобр']) {
    let i = 0,
      n = 0;
    while ((i = t.toLowerCase().indexOf(k.toLowerCase(), i)) >= 0 && n < 3) {
      console.log(k, '->', t.slice(Math.max(0, i - 30), i + 140).replace(/\s+/g, ' '));
      i += k.length;
      n++;
    }
  }
}
