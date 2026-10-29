// Etapa E: prima pornire (secret, primul administrator), instanța demo și verificarea licențelor.
// Baze și fișiere temporare, date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { spawnSync } = require('child_process');
const fr = require('../../scripts/first-run');
const { checkProductionConfig, isDemo, DEV_SESSION_SECRET } = require('../../config');
const licenseCheck = require('../../scripts/license-check');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-dist-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function usersDb() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, full_name TEXT, role TEXT, must_change_password INTEGER NOT NULL DEFAULT 0)`);
  return db;
}

test('parola temporară: lungime, alfabet fără caractere ambigue, valori diferite', () => {
  const a = fr.generateTempPassword(), b = fr.generateTempPassword();
  assert.equal(a.length, 16);
  assert.match(a, /^[A-HJ-NP-Za-km-z2-9]+$/);
  assert.notEqual(a, b);
  assert.ok(fr.generateSecret().length >= 32);
});

test('primul administrator: creat cu parolă temporară și schimbare obligatorie; a doua rulare nu face nimic', () => {
  const db = usersDb();
  const r = fr.ensureFirstAdmin(db, bcrypt, ' Admin@Lab.Invalid ', 'Admin Lab');
  assert.equal(r.created, true);
  assert.equal(r.email, 'admin@lab.invalid');
  const row = db.prepare('SELECT * FROM users').get();
  assert.equal(row.role, 'admin');
  assert.equal(row.must_change_password, 1);
  assert.ok(bcrypt.compareSync(r.password, row.password_hash));
  assert.notEqual(row.password_hash, r.password);
  assert.equal(fr.ensureFirstAdmin(db, bcrypt, 'altul@lab.invalid').created, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n, 1);
});

test('primul administrator: e-mail invalid sau ocupat de un cont non-admin este refuzat', () => {
  const db = usersDb();
  assert.throws(() => fr.ensureFirstAdmin(db, bcrypt, 'fara-arond'), /nu este validă/);
  db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('op@lab.invalid','x','Op','operator')`).run();
  assert.throws(() => fr.ensureFirstAdmin(db, bcrypt, 'op@lab.invalid'), /nu este administrator/);
});

test('.env: creat din șablon cu SESSION_SECRET generat, fără a rescrie un secret existent; permisiuni restrânse', () => {
  const env = path.join(tmp, 'x.env');
  const example = path.join(tmp, 'ex.env');
  fs.writeFileSync(example, '# exemplu\n# SESSION_SECRET=\nLIMS_HOST=127.0.0.1\n');
  assert.equal(fr.ensureEnvFile(env, example).created, true);
  const t1 = fs.readFileSync(env, 'utf8');
  const m = t1.match(/^SESSION_SECRET=(\S{32,})$/m);
  assert.ok(m, 'secret generat');
  assert.ok(t1.includes('LIMS_HOST=127.0.0.1'));
  assert.equal(fs.statSync(env).mode & 0o077, 0, 'fără drepturi pentru grup/alții');
  assert.equal(fr.ensureEnvFile(env, example).created, false);
  assert.equal(fs.readFileSync(env, 'utf8'), t1);
});

test('fișier de secret: creat o dată, apoi păstrat', () => {
  const f = path.join(tmp, 'data', 'session-secret');
  assert.equal(fr.ensureSecretFile(f).created, true);
  const v = fs.readFileSync(f, 'utf8');
  assert.equal(fr.ensureSecretFile(f).created, false);
  assert.equal(fs.readFileSync(f, 'utf8'), v);
});

test('LIMS_DEMO este refuzat în producție și acceptat în dezvoltare', () => {
  assert.equal(isDemo({ LIMS_DEMO: '1' }), true);
  assert.equal(isDemo({ LIMS_DEMO: 'true' }), true);
  assert.equal(isDemo({ LIMS_DEMO: '0' }), false);
  assert.equal(isDemo({}), false);
  const prod = { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), LIMS_DEMO: '1' };
  assert.ok(checkProductionConfig(prod).some(e => e.includes('LIMS_DEMO')));
  assert.deepEqual(checkProductionConfig({ NODE_ENV: 'development', LIMS_DEMO: '1' }), []);
  assert.ok(!checkProductionConfig({ ...prod, LIMS_DEMO: '' }).some(e => e.includes('LIMS_DEMO')));
  assert.ok(DEV_SESSION_SECRET); // valoarea implicită nu este modificată
});

test('demo-seed refuză fără LIMS_DEMO=1 și în producție', () => {
  const script = path.join(__dirname, '..', '..', 'scripts', 'demo-seed.js');
  const base = { PATH: process.env.PATH, LIMS_DB_PATH: path.join(tmp, 'refuz.db') };
  const a = spawnSync(process.execPath, [script], { env: base, encoding: 'utf8' });
  assert.equal(a.status, 1); assert.match(a.stderr, /LIMS_DEMO=1/);
  const b = spawnSync(process.execPath, [script], { env: { ...base, LIMS_DEMO: '1', NODE_ENV: 'production' }, encoding: 'utf8' });
  assert.equal(b.status, 1); assert.match(b.stderr, /producție/);
  assert.ok(!fs.existsSync(path.join(tmp, 'refuz.db')), 'nu se creează baza când scriptul refuză');
});

test('licențele dependențelor de execuție sunt permisive (compatibile AGPL-3.0-or-later)', () => {
  const rows = licenseCheck.check();
  assert.ok(rows.length > 50);
  assert.deepEqual(rows.filter(r => !r.ok), []);
});

test('LICENSE conține AGPL-3.0 integral, iar package.json declară aceeași licență', () => {
  const lic = fs.readFileSync(path.join(__dirname, '..', '..', 'LICENSE'), 'utf8');
  assert.match(lic, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.ok(lic.includes('13. Remote Network Interaction;'));
  assert.ok(lic.includes('END OF TERMS AND CONDITIONS'));
  assert.equal(require('../../package.json').license, 'AGPL-3.0-or-later');
});
