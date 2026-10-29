// Etapa D3: securizare finală (fără modificarea parolelor de test, a valorii implicite a secretului de
// sesiune în dezvoltare sau a politicii de lungime a parolei). Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-d3-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('../../db/database');
const { checkProductionConfig, trustProxySetting, DEV_SESSION_SECRET } = require('../../config');
const { requirePasswordChange } = require('../../middleware/password-gate');
const { ensureCsrfToken, requireCsrf } = require('../../middleware/csrf');
const rl = require('../../middleware/rate-limit');
const SqliteSessionStore = require('../../db/session-store');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(session({ store: new SqliteSessionStore(), secret: 'test-secret-with-more-than-32-characters!', resave: false, saveUninitialized: false, cookie: { httpOnly: true } }));
app.use(ensureCsrfToken);
app.use('/api', requireCsrf);
app.use('/api', requirePasswordChange);
app.use('/api/auth', require('../../routes/auth'));
app.use('/api/admin', require('../../routes/admin'));
app.get('/api/other', (req, res) => res.json({ ok: true }));

let server; let base;
test.before(async () => {
  db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, 'Admin Test', 'admin')`).run('admin@test.invalid', bcrypt.hashSync('parola-admin-1', 4));
  db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, 'Operator Test', 'operator')`).run('op@test.invalid', bcrypt.hashSync('parola-op-1234', 4));
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });
test.beforeEach(() => rl.resetAllForTests());

// Client minimal cu cookie și token CSRF.
function client(ip) {
  let cookie = ''; let csrf = null;
  const c = {
    async call(method, url, body) {
      const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || '10.1.1.1', ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const data = await res.json().catch(() => null);
      if (data && data.csrfToken) csrf = data.csrfToken;
      return { status: res.status, body: data };
    },
    async boot() { return c.call('GET', '/api/auth/me'); },
    async login(email, password) { await c.boot(); return c.call('POST', '/api/auth/login', { email, password }); }
  };
  return c;
}

test('configurare de producție: refuză secretul lipsă, cel implicit și cel scurt; dezvoltarea rămâne neschimbată', () => {
  assert.deepEqual(checkProductionConfig({ NODE_ENV: 'development' }), []);
  assert.deepEqual(checkProductionConfig({}), []);
  assert.equal(checkProductionConfig({ NODE_ENV: 'production' }).length, 1);
  assert.ok(checkProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: DEV_SESSION_SECRET })[0].includes('implicită'));
  assert.ok(checkProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'prea-scurt' })[0].includes('32'));
  assert.deepEqual(checkProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }), []);
  assert.equal(checkProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), LIMS_HOST: '0.0.0.0' }).length, 1);
  assert.deepEqual(checkProductionConfig({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), LIMS_HOST: '0.0.0.0', LIMS_TRUST_PROXY: '1' }), []);
  assert.equal(DEV_SESSION_SECRET, 'dev-secret-schimba-in-productie'); // valoarea implicită din dezvoltare nu s-a schimbat
});

test('LIMS_TRUST_PROXY: număr, nume sau nesetat', () => {
  assert.equal(trustProxySetting({}), false);
  assert.equal(trustProxySetting({ LIMS_TRUST_PROXY: '1' }), 1);
  assert.equal(trustProxySetting({ LIMS_TRUST_PROXY: 'loopback' }), 'loopback');
});

test('blocare pe cont: după 10 încercări eșuate din adrese diferite, chiar parola corectă este refuzată; se jurnalizează', async () => {
  for (let i = 1; i <= 10; i++) {
    const c = client(`10.2.0.${i}`);
    const r = await c.login('op@test.invalid', 'gresita-' + i);
    assert.equal(r.status, 401, `încercarea ${i}`);
  }
  const ok = client('10.2.0.99');
  const r = await ok.login('op@test.invalid', 'parola-op-1234');
  assert.equal(r.status, 429);
  const ev = db.prepare("SELECT action FROM audit_log WHERE action IN ('login_failed','account_locked')").all().map(x => x.action);
  assert.equal(ev.filter(a => a === 'login_failed').length, 10);
  assert.equal(ev.filter(a => a === 'account_locked').length, 1);
  // conturi inexistente: același comportament, fără a dezvălui existența
  for (let i = 1; i <= 10; i++) assert.equal((await client(`10.3.0.${i}`).login('nu-exista@test.invalid', 'x' + i)).status, 401);
  assert.equal((await client('10.3.0.99').login('nu-exista@test.invalid', 'x')).status, 429);
  // jurnalul nu păstrează textul introdus
  const raw = JSON.stringify(db.prepare("SELECT details FROM audit_log WHERE action = 'login_failed'").all());
  assert.ok(!raw.includes('nu-exista@test.invalid') && !raw.includes('gresita-'));
});

test('autentificare reușită: sesiune, jurnal și resetarea contoarelor', async () => {
  const c = client('10.4.0.1');
  for (let i = 0; i < 3; i++) await client('10.4.0.1').login('op@test.invalid', 'gresita');
  const r = await c.login('op@test.invalid', 'parola-op-1234');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.user.mustChangePassword, false);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'login_success'").get());
  assert.equal((await c.call('GET', '/api/other')).status, 200);
});

test('schimbarea parolei: validări, efect, sesiuni și jurnal', async () => {
  const c = client('10.5.0.1');
  await c.login('op@test.invalid', 'parola-op-1234');
  assert.equal((await c.call('POST', '/api/auth/change-password', { currentPassword: 'gresita', newPassword: 'noua-parola-1' })).status, 401);
  assert.equal((await c.call('POST', '/api/auth/change-password', { currentPassword: 'parola-op-1234', newPassword: 'scurta' })).status, 400);
  assert.equal((await c.call('POST', '/api/auth/change-password', { currentPassword: 'parola-op-1234', newPassword: 'parola-op-1234' })).status, 400);
  const other = client('10.5.0.2'); await other.login('op@test.invalid', 'parola-op-1234');
  const ch = await c.call('POST', '/api/auth/change-password', { currentPassword: 'parola-op-1234', newPassword: 'noua-parola-1' });
  assert.equal(ch.status, 200, JSON.stringify(ch.body));
  // sesiunea reînnoită merge; cealaltă sesiune a contului a fost închisă
  assert.equal((await c.call('GET', '/api/other')).status, 200);
  const o = await other.call('GET', '/api/auth/me');
  assert.equal(o.body.user, null);
  assert.equal((await client('10.5.0.3').login('op@test.invalid', 'parola-op-1234')).status, 401);
  assert.equal((await client('10.5.0.4').login('op@test.invalid', 'noua-parola-1')).status, 200);
  const acts = db.prepare("SELECT action FROM audit_log WHERE action LIKE 'password_%'").all().map(x => x.action);
  assert.ok(acts.includes('password_changed') && acts.includes('password_change_failed'));
  // revine la parola inițială pentru testele următoare
  const back = client('10.5.0.5'); await back.login('op@test.invalid', 'noua-parola-1');
  await back.call('POST', '/api/auth/change-password', { currentPassword: 'noua-parola-1', newPassword: 'parola-op-1234' });
});

test('resetare de către administrator: parolă temporară, sesiuni închise, schimbare obligatorie', async () => {
  const opSession = client('10.6.0.1'); await opSession.login('op@test.invalid', 'parola-op-1234');
  const admin = client('10.6.0.2'); await admin.login('admin@test.invalid', 'parola-admin-1');
  // nu se resetează contul propriu; cont inexistent; fără drept
  assert.equal((await admin.call('POST', '/api/admin/users/reset-password', { email: 'admin@test.invalid' })).status, 400);
  assert.equal((await admin.call('POST', '/api/admin/users/reset-password', { email: 'nu@test.invalid' })).status, 404);
  assert.equal((await opSession.call('POST', '/api/admin/users/reset-password', { email: 'admin@test.invalid' })).status, 403);
  const rs = await admin.call('POST', '/api/admin/users/reset-password', { email: 'op@test.invalid' });
  assert.equal(rs.status, 200, JSON.stringify(rs.body));
  assert.match(rs.body.temporaryPassword, /^[A-Za-z0-9]{14}$/);
  // sesiunea veche a contului s-a închis; parola veche nu mai merge
  assert.equal((await opSession.call('GET', '/api/auth/me')).body.user, null);
  assert.equal((await client('10.6.0.3').login('op@test.invalid', 'parola-op-1234')).status, 401);
  // autentificare cu parola temporară: acces blocat până la schimbare
  const t = client('10.6.0.4');
  const lg = await t.login('op@test.invalid', rs.body.temporaryPassword);
  assert.equal(lg.status, 200);
  assert.equal(lg.body.user.mustChangePassword, true);
  const blocked = await t.call('GET', '/api/other');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'password_change_required');
  assert.equal((await t.call('GET', '/api/auth/me')).status, 200);
  const ch = await t.call('POST', '/api/auth/change-password', { currentPassword: rs.body.temporaryPassword, newPassword: 'parola-op-1234' });
  assert.equal(ch.status, 200, JSON.stringify(ch.body));
  assert.equal((await t.call('GET', '/api/other')).status, 200);
  assert.equal(db.prepare('SELECT must_change_password AS m FROM users WHERE email = ?').get('op@test.invalid').m, 0);
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'password_reset_by_admin'").get());
  // parola temporară nu apare în jurnal
  assert.ok(!JSON.stringify(db.prepare('SELECT details FROM audit_log').all()).includes(rs.body.temporaryPassword));
});

// Pornirea reală a serverului în producție (proces separat, bază temporară).
const { spawn, spawnSync } = require('child_process');
const rootDir = path.join(__dirname, '..', '..');

test('producție: serverul refuză să pornească fără SESSION_SECRET valid', () => {
  const r = spawnSync(process.execPath, ['server.js'], { cwd: rootDir, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: '', LIMS_DB_PATH: path.join(tmp, 'prod-a.db'), PORT: '0' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Configurare nesigură pentru producție/);
  assert.match(r.stderr, /SESSION_SECRET/);
});

test('producție: cu secret valid și proxy de încredere, cookie „Secure” și HSTS', async () => {
  const port = 38000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.js'], { cwd: rootDir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'y'.repeat(48), LIMS_TRUST_PROXY: '1', LIMS_DB_PATH: path.join(tmp, 'prod-b.db'), PORT: String(port), LIMS_HOST: '127.0.0.1' } });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise(r => setTimeout(r, 250));
      up = await fetch(`http://127.0.0.1:${port}/`).then(() => true).catch(() => false);
    }
    assert.ok(up, 'serverul nu a pornit');
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { 'x-forwarded-proto': 'https' } });
    assert.match(res.headers.get('strict-transport-security') || '', /max-age=/);
    assert.match(res.headers.get('set-cookie') || '', /Secure/i);
    assert.match(res.headers.get('set-cookie') || '', /HttpOnly/i);
    assert.match(res.headers.get('cache-control') || '', /no-store/);
  } finally { child.kill(); }
});
