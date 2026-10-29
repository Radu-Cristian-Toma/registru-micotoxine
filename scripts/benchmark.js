// Test de performanță reproductibil (date inventate, bază temporară): latența endpoint-urilor frecvente și timpul de
// verificare a lanțului de amprente, la 100, 500 și 1000 de probe validate. Nu atinge baza locală și nu folosește date reale.
//   node scripts/benchmark.js [--sizes 100,500,1000] [--json iesire.json]
// Fiecare probă parcurge fluxul complet prin API: înregistrare, rezultate, aprobare, validare (4 cereri).
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const SIZES = arg('--sizes', '100,500,1000').split(',').map(Number);
const PW = 'Bench-LIMS-2026!';

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
function client(base) {
  let cookie = '', csrf = '';
  async function call(method, url, body) {
    const res = await fetch(base + '/api' + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    const c = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (c.length) cookie = c.map(x => x.split(';')[0]).join('; ');
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text();
    if (data && typeof data === 'object' && data.csrfToken) csrf = data.csrfToken;
    if (res.status !== 200) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(data).slice(0, 200)}`);
    return data;
  }
  return { call, async login(email) { await call('GET', '/auth/me'); await call('POST', '/auth/login', { email, password: PW }); return this; } };
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function time(fn, n) { const t = []; for (let i = 0; i < n; i++) { const s = process.hrtime.bigint(); await fn(i); t.push(Number(process.hrtime.bigint() - s) / 1e6); } return { p50: +pct(t, 0.5).toFixed(1), p95: +pct(t, 0.95).toFixed(1) }; }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-bench-'));
  const dbPath = path.join(tmp, 'bench.db');
  const port = await freePort();
  const env = { PATH: process.env.PATH, LIMS_DB_PATH: dbPath, PORT: String(port), SESSION_SECRET: crypto.randomBytes(24).toString('hex'), NODE_ENV: 'development' };
  // Conturi: inserate direct (parola hash), pe baza temporară.
  const dbInit = spawnSync(process.execPath, ['-e', `
    const db=require('./db/database'),b=require('bcryptjs');const h=b.hashSync(${JSON.stringify(PW)},4);
    for(const [e,r] of [['op@b.invalid','operator'],['v1@b.invalid','validator'],['v2@b.invalid','validator'],['o@b.invalid','owner']]) db.prepare("INSERT INTO users (email,password_hash,full_name,role) VALUES (?,?,?,?)").run(e,h,e,r);db.close();`], { cwd: root, env, encoding: 'utf8' });
  if (dbInit.status !== 0) throw new Error(dbInit.stderr);
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(out)), 20000); const iv = setInterval(() => { if (out.includes('Server pornit')) { clearTimeout(t); clearInterval(iv); res(); } }, 100); });
  const base = `http://127.0.0.1:${port}`;
  const [owner, op, v1, v2] = [await client(base).login('o@b.invalid'), await client(base).login('op@b.invalid'), await client(base).login('v1@b.invalid'), await client(base).login('v2@b.invalid')];
  const intake = { intakeConfirmed: true, intakeCondition: { packaging: 'intact', quantityAdequate: true, temperatureC: 5 } };
  const vals = { afb1: 0.8, afb2: 0.2, afg1: 0.2, afg2: 0.1, ota: 1.1, don: 300, zea: 20, analysisDate: '2026-10-05', method: 'metodă fictivă', equipment: 'EQ-bench', qcStatus: 'accepted' };
  const results = []; let done = 0, lastBn = null;
  const createTimes = [];
  for (const size of SIZES) {
    while (done < size) {
      const t0 = process.hrtime.bigint();
      const { id } = await owner.call('POST', '/samples', { productName: `Probă ${done}`, category: 'Cereale / produse derivate pentru consumatorul final', sampleDate: '2026-10-01', samplingAttested: true });
      createTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
      await op.call('PUT', `/results/${id}`, { ...intake, ...vals });
      await v1.call('POST', `/results/${id}/review`, { decision: 'approved', note: 'ok' });
      const v = await v2.call('POST', `/results/${id}/validate`, {}); lastBn = v.bulletinNo || lastBn; done++;
    }
    const queue = await time(() => op.call('GET', '/results/queue'), 20);
    const archive = await time(() => op.call('GET', '/results/archive?pageSize=50'), 20);
    const mine = await time(() => owner.call('GET', '/samples/mine'), 20);
    const bn = `BUL-2026-${String(Math.max(1, Math.floor(done / 2))).padStart(5, '0')}`;
    const verify = await time(async () => { const r = await fetch(`${base}/api/results/public/verify/${bn}`); await r.json(); }, 30);
    const t1 = Date.now(); const vi = spawnSync(process.execPath, ['scripts/verify-integrity.js'], { cwd: root, env, encoding: 'utf8' }); const verifyMs = Date.now() - t1;
    const m = /Lanț audit: (\d+)\. Lanț versiuni: (\d+)/.exec(vi.stdout) || [];
    const t2 = Date.now(); const bk = spawnSync(process.execPath, ['scripts/backup-db.js', path.join(tmp, 'bk' + size)], { cwd: root, env, encoding: 'utf8' }); const backupMs = Date.now() - t2;
    const dbBytes = fs.statSync(dbPath).size;
    results.push({ samples: size, createP50ms: +pct(createTimes, 0.5).toFixed(1), queue, archive, mine, publicVerify: verify, verifyIntegritySeconds: +(verifyMs / 1000).toFixed(2), integrityExit: vi.status, auditRows: +m[1] || null, versionRows: +m[2] || null, backupSeconds: +(backupMs / 1000).toFixed(2), backupExit: bk.status, dbMB: +(dbBytes / 1048576).toFixed(1) });
    console.log(JSON.stringify(results[results.length - 1]));
  }
  child.kill();
  const meta = { node: process.version, cpu: os.cpus()[0].model, cores: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1), platform: `${os.type()} ${os.release()}` };
  const full = { meta, results };
  if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(full, null, 2));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(JSON.stringify(meta));
})().catch(e => { console.error(e); process.exit(1); });
