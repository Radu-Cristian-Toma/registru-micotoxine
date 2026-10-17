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
