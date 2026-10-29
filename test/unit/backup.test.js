// L11: scriptul de backup produce o copie valida, verificata, inclusiv pentru
// date aflate (inca) in fisierul WAL. Baze temporare, date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { backupDatabase, verifyDatabase } = require('../../scripts/backup-db');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-backup-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function makeSource() {
  const file = path.join(tmp, `src-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0'); // datele raman in WAL, nu in fisierul principal
  db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (id INTEGER PRIMARY KEY, pid INTEGER REFERENCES parent(id), v TEXT)');
  db.exec(`INSERT INTO parent VALUES (1),(2); INSERT INTO child (pid, v) VALUES (1,'a'),(2,'b'),(2,'c')`);
  return { db, file };
}

test('copia are aceleași date ca sursa, inclusiv cele din WAL, și trece verificarea', async () => {
  const { db, file } = makeSource();
  assert.ok(fs.existsSync(file + '-wal') && fs.statSync(file + '-wal').size > 0, 'datele trebuie să fie în WAL');
  const r = await backupDatabase(file, path.join(tmp, 'out1'));
  assert.ok(r.check.ok);
  assert.ok(fs.existsSync(r.destPath));
  assert.deepEqual(fs.readdirSync(path.join(tmp, 'out1')), [path.basename(r.destPath)], 'copia este un singur fișier, fără -wal/-shm');
  const copy = new Database(r.destPath, { readonly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM child').get().n, 3);
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM parent').get().n, 2);
  copy.close();
  db.close();
});

test('baza sursă nu este modificată de backup', async () => {
  const { db, file } = makeSource();
  const before = db.prepare('SELECT COUNT(*) n FROM child').get().n;
  await backupDatabase(file, path.join(tmp, 'out2'));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM child').get().n, before);
  db.close();
});

test('verifyDatabase respinge un fișier care nu este bază SQLite', () => {
  const bad = path.join(tmp, 'bad.db');
  fs.writeFileSync(bad, 'acesta nu este un fisier sqlite, ci text inventat '.repeat(100));
  assert.equal(verifyDatabase(bad).ok, false);
});

test('verifyDatabase semnalează încălcări de chei străine', () => {
  const file = path.join(tmp, 'fk.db');
  const db = new Database(file);
  db.pragma('foreign_keys = OFF'); // permite crearea intenționată a unei încălcări
  db.exec('CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (pid INTEGER REFERENCES p(id)); INSERT INTO c VALUES (99);');
  db.close();
  const r = verifyDatabase(file);
  assert.equal(r.ok, false);
  assert.equal(r.foreignKeyViolations, 1);
});

test('baza sursă inexistentă produce eroare, fără fișier de destinație', async () => {
  await assert.rejects(() => backupDatabase(path.join(tmp, 'nu-exista.db'), path.join(tmp, 'out3')), /nu există/);
  assert.equal(fs.existsSync(path.join(tmp, 'out3')), false);
});

// Etapa D3: copie criptată (AES-256-GCM, parolă din mediu).
const { backupEncrypted } = require('../../scripts/backup-db');
const { encryptFile, decryptFile } = require('../../scripts/backup-crypto');
const { spawnSync } = require('child_process');

test('copie criptată: fișierul nu conține datele în clar, se decriptează cu parola corectă și trece verificarea', async () => {
  const { db, file } = makeSource();
  const r = await backupEncrypted(file, path.join(tmp, 'enc1'), 'parola-de-test-lunga');
  assert.ok(r.destPath.endsWith('.db.enc'));
  assert.equal(fs.readdirSync(path.join(tmp, 'enc1')).filter(f => !f.endsWith('.enc')).length, 0, 'copia în clar trebuie ștearsă');
  const raw = fs.readFileSync(r.destPath);
  assert.ok(!raw.includes('SQLite format 3'), 'antetul SQLite nu trebuie să apară în fișierul criptat');
  const out = path.join(tmp, 'restored.db');
  decryptFile(r.destPath, out, 'parola-de-test-lunga');
  assert.ok(verifyDatabase(out).ok);
  const copy = new Database(out, { readonly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) n FROM child').get().n, 3);
  copy.close(); db.close();
});

test('copie criptată: parolă greșită, fișier modificat și parolă prea scurtă sunt refuzate', async () => {
  const { db, file } = makeSource();
  const r = await backupEncrypted(file, path.join(tmp, 'enc2'), 'parola-de-test-lunga');
  assert.throws(() => decryptFile(r.destPath, path.join(tmp, 'x1.db'), 'parola-gresita-lunga'), /parola este greșită sau fișierul a fost modificat/);
  const tampered = fs.readFileSync(r.destPath); tampered[tampered.length - 1] ^= 1;
  const t = path.join(tmp, 'tampered.db.enc'); fs.writeFileSync(t, tampered);
  assert.throws(() => decryptFile(t, path.join(tmp, 'x2.db'), 'parola-de-test-lunga'), /modificat/);
  await assert.rejects(() => backupEncrypted(file, path.join(tmp, 'enc3'), 'scurta'), /cel puțin 12 caractere/);
  assert.equal(fs.readdirSync(path.join(tmp, 'enc3')).length, 0, 'după eșec nu rămâne copie în clar');
  assert.ok(!fs.existsSync(path.join(tmp, 'x1.db')));
  db.close();
});

test('CLI: --encrypt și --decrypt cu parola din mediu (nu din argumente)', async () => {
  const { db, file } = makeSource(); db.close();
  const env = { ...process.env, LIMS_DB_PATH: file, LIMS_BACKUP_PASSPHRASE: 'parola-de-test-lunga' };
  const script = path.join(__dirname, '..', '..', 'scripts', 'backup-db.js');
  const e = spawnSync(process.execPath, [script, '--encrypt', path.join(tmp, 'enc4')], { env, encoding: 'utf8' });
  assert.equal(e.status, 0, e.stderr);
  const encFile = path.join(tmp, 'enc4', fs.readdirSync(path.join(tmp, 'enc4'))[0]);
  const d = spawnSync(process.execPath, [script, '--decrypt', encFile, path.join(tmp, 'cli-restored.db')], { env, encoding: 'utf8' });
  assert.equal(d.status, 0, d.stderr);
  const bad = spawnSync(process.execPath, [script, '--decrypt', encFile, path.join(tmp, 'cli-bad.db')], { env: { ...env, LIMS_BACKUP_PASSPHRASE: 'alta-parola-lunga-1' }, encoding: 'utf8' });
  assert.equal(bad.status, 1);
});
