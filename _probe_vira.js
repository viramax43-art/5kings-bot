import fs from 'fs';
import path from 'path';

const state = JSON.parse(
  fs.readFileSync('c:/Users/armian/Desktop/Works/Freelance/5kings/.auth/storage-state.json', 'utf8')
);
console.log('cookies', (state.cookies || []).map((c) => `${c.name}=${String(c.value).slice(0, 40)}`));
for (const o of state.origins || []) {
  console.log('origin', o.origin);
  for (const ls of o.localStorage || []) {
    const s = `${ls.name}=${ls.value}`;
    if (/vira|user|login|name|nick|uid/i.test(s)) console.log(' LS', s.slice(0, 120));
  }
}

const base = path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data');
for (const dir of ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 5']) {
  const p = path.join(base, dir, 'Preferences');
  if (!fs.existsSync(p)) continue;
  const t = fs.readFileSync(p, 'utf8');
  const hits = [...t.matchAll(/https?:\\\/\\\/[^"\\]*5kings[^"\\]*/gi)].slice(0, 8).map((m) => m[0]);
  console.log(dir, '5kings=', hits.length, hits.slice(0, 3));
  if (/VIRA/i.test(t)) console.log(dir, 'HAS VIRA in prefs');
}

// Search TM script storage for 5kings
const tmRoot = path.join(base, 'Profile 1', 'Local Extension Settings', 'dhdgffkkebhmkfjojejmpbldmpobfkfo');
if (fs.existsSync(tmRoot)) {
  console.log('TM Local Extension Settings exists', fs.readdirSync(tmRoot).slice(0, 20));
}
const tmSync = path.join(base, 'Profile 1', 'Sync Extension Settings', 'dhdgffkkebhmkfjojejmpbldmpobfkfo');
if (fs.existsSync(tmSync)) console.log('TM Sync settings', fs.readdirSync(tmSync));

// IndexedDB / LevelDB for scripts — just list
const idb = path.join(
  base,
  'Profile 1',
  'IndexedDB'
);
if (fs.existsSync(idb)) {
  const names = fs.readdirSync(idb).filter((n) => /tamper|dhdg/i.test(n));
  console.log('IndexedDB TM-ish', names);
}
