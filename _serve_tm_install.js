import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8767;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PAGE = fs.readFileSync(path.join(ROOT, 'tampermonkey', 'install.html'));
const JS = fs.readFileSync(path.join(ROOT, 'tampermonkey', '5kings-bot.user.js'));

const server = http.createServer((req, res) => {
  if ((req.url || '').includes('5kings-bot.user.js')) {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return void res.end(JS);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  console.log('INSTALL', url);
  spawn(CHROME, ['--profile-directory=Profile 5', url], { detached: true, stdio: 'ignore' }).unref();
});
