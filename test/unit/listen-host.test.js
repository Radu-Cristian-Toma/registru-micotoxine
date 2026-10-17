// Ascultare implicita numai locala (127.0.0.1); LIMS_HOST o poate schimba.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function hostFor(env) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, ['-e', "console.log(require('./config').HOST)"], { cwd: root, env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  return r.stdout.trim();
}

test('implicit: 127.0.0.1', () => assert.equal(hostFor({}), '127.0.0.1'));
test('LIMS_HOST gol sau cu spații: tot 127.0.0.1', () => assert.equal(hostFor({ LIMS_HOST: '  ' }), '127.0.0.1'));
test('LIMS_HOST explicit este respectat', () => assert.equal(hostFor({ LIMS_HOST: '0.0.0.0' }), '0.0.0.0'));

function tryConnect(host, port) {
  return new Promise(resolve => {
    const s = net.connect({ host, port, timeout: 1500 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

test('serverul pornit fără configurare ascultă pe loopback și nu pe adresa de rețea', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-listen-'));
  const port = await new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { PATH: process.env.PATH, PORT: String(port), LIMS_DB_PATH: path.join(tmp, 't.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('serverul nu a pornit: ' + out)), 15000);
      const iv = setInterval(() => { if (out.includes('Server pornit')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 100);
    });
    assert.match(out, new RegExp(`http://127\\.0\\.0\\.1:${port}`));
    assert.equal(await tryConnect('127.0.0.1', port), true);
    const lan = Object.values(os.networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    if (lan) assert.equal(await tryConnect(lan.address, port), false, 'nu trebuie să accepte conexiuni pe adresa de rețea');
  } finally {
    child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
