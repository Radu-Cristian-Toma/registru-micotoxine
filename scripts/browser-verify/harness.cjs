// Harnas pentru verificarea in browser: porneste serverul pe o baza TEMPORARA,
// cu conturi inventate (parole generate aleator la fiecare rulare, nescrise nicaieri),
// si ofera un client API cu sesiune + CSRF. Nu foloseste date reale.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function freePort() {
  return new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
}

async function startServer() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-browser-'));
  const dbPath = path.join(tmp, 'verify.db');
  const port = await freePort();
  const pw = () => 'T' + crypto.randomBytes(9).toString('hex') + '!a1';
  const accounts = {
    admin: { email: 'admin@verify.invalid', password: pw(), name: 'Admin Verificare' },
    operator: { email: 'operator@verify.invalid', password: pw(), name: 'Operator Verificare' },
    operator2: { email: 'operator2@verify.invalid', password: pw(), name: 'Operator Doi' },
    validator: { email: 'validator@verify.invalid', password: pw(), name: 'Validator Verificare' },
    validator2: { email: 'validator2@verify.invalid', password: pw(), name: 'Validator Doi' },
    owner: { email: 'beneficiar@verify.invalid', password: pw(), name: 'Beneficiar Verificare' },
  };
  const env = { PATH: process.env.PATH, LIMS_DB_PATH: dbPath, PORT: String(port), SESSION_SECRET: crypto.randomBytes(16).toString('hex') };
  const seed = spawnSync(process.execPath, ['db/seed-admin.js', accounts.admin.email, accounts.admin.password, accounts.admin.name], { cwd: root, env, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error('seed-admin: ' + seed.stdout + seed.stderr);
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server nu a pornit: ' + out)), 20000);
    const iv = setInterval(() => { if (out.includes('Server pornit')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 100);
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    base, accounts, tmp, dbPath, getLog: () => out,
    stop() { child.kill(); fs.rmSync(tmp, { recursive: true, force: true }); },
  };
}

// Client API cu cookie + CSRF.
function apiClient(base) {
  let cookie = '', csrf = '';
  const grab = (res) => { const c = res.headers.getSetCookie ? res.headers.getSetCookie() : []; if (c.length) cookie = c.map(x => x.split(';')[0]).join('; '); };
  async function call(method, url, body) {
    const res = await fetch(base + '/api' + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    grab(res);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    if (data && typeof data === 'object' && data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data };
  }
  return {
    call,
    async init() { const r = await call('GET', '/auth/me'); csrf = r.data.csrfToken; },
    async login(acc) { await this.init(); const r = await call('POST', '/auth/login', { email: acc.email, password: acc.password }); if (r.status !== 200) throw new Error('login ' + acc.email + ' ' + JSON.stringify(r.data)); csrf = r.data.csrfToken || csrf; return r; },
  };
}

module.exports = { startServer, apiClient };
