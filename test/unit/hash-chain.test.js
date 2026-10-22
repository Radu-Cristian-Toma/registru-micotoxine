// Etapa D: lanț de amprente în audit_log și result_versions, rezumat periodic exportat.
// Baze temporare, date inventate. Atacatorul este simulat printr-o conexiune brută la o COPIE a bazei.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-chain-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'main.db');

const db = require('../../db/database');
const { logEvent } = require('../../db/audit');
const { verify, verifyChain, AUDIT_CHAIN, VERSIONS_CHAIN, sha256 } = require('../../scripts/verify-integrity');
const { exportDigest } = require('../../scripts/export-digest');
const root = path.resolve(__dirname, '..', '..');

test.after(() => { try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

let n = 0;
function seed() {
  const u = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', 'Test', 'owner')`).run(`o${++n}@test.invalid`);
  const s = db.prepare(`INSERT INTO samples (code, owner_id, product_name, status) VALUES (?, ?, 'test', 'pending')`).run(`T-${n}`, u.lastInsertRowid);
  return { userId: u.lastInsertRowid, sampleId: s.lastInsertRowid };
}
function addVersion(sampleId, no, reason = null) {
  const json = JSON.stringify({ v: no });
  db.prepare('INSERT INTO result_versions (sample_id, version_no, snapshot_json, snapshot_hash, change_reason) VALUES (?, ?, ?, ?, ?)')
    .run(sampleId, no, json, sha256(json), reason);
}
// Copie a bazei curente, deschisă brut (fără funcția SHA-256 a aplicației), pentru simularea atacatorului.
async function attackerCopy() {
  const file = path.join(tmp, `copy-${++n}.db`);
  await db.backup(file);
  return { file, atk: new Database(file) };
}
const types = (res) => res.problems.map(p => p.type);

// Date de pornire: câteva evenimente, versiuni și un instantaneu de buletin.
const { userId, sampleId } = seed();
logEvent(userId, 'e1', { a: 1 }, sampleId); logEvent(userId, 'e2', { b: 'é"q' }, sampleId); logEvent(userId, 'e3', null, null);
addVersion(sampleId, 1, 'prima'); addVersion(sampleId, 2, 'a doua');
db.prepare("INSERT INTO results (sample_id, bulletin_no) VALUES (?, 'BUL-TEST-1')").run(sampleId);
const snapJson = JSON.stringify({ bulletinNo: 'BUL-TEST-1' });
db.prepare('INSERT INTO bulletin_snapshots (sample_id, bulletin_no, snapshot_json, snapshot_hash) VALUES (?, ?, ?, ?)').run(sampleId, 'BUL-TEST-1', snapJson, sha256(snapJson));

test('fiecare rând nou din audit_log și result_versions primește un element de lanț corect', () => {
  const res = verify(db);
  assert.deepEqual(res.problems, []);
  assert.ok(res.auditChainChecked >= 3 && res.versionsChainChecked >= 2);
  const rows = db.prepare('SELECT * FROM audit_chain ORDER BY id').all();
  assert.equal(rows[0].prev_hash, 'GENESIS');
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].prev_hash, rows[i - 1].row_hash);
});

test('tabelele de lanț sunt append-only', () => {
  assert.throws(() => db.prepare('UPDATE audit_chain SET row_hash = ? WHERE id = 1').run('x'), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM audit_chain WHERE id = 1').run(), /append-only/);
  assert.throws(() => db.prepare('UPDATE result_versions_chain SET row_hash = ? WHERE id = 1').run('x'), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM result_versions_chain WHERE id = 1').run(), /append-only/);
});

test('o conexiune externă fără funcția SHA-256 nu poate insera în audit_log', async () => {
  const { atk } = await attackerCopy();
  assert.throws(() => atk.prepare(`INSERT INTO audit_log (sample_id, user_id, action) VALUES (NULL, NULL, 'extern')`).run(), /no such function/);
  atk.close();
});

test('modificarea unui rând de audit (declanșator eliminat) rupe lanțul', async () => {
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_no_update');
  atk.prepare(`UPDATE audit_log SET action = 'falsificat' WHERE action = 'e2'`).run();
  const res = verify(atk);
  assert.ok(types(res).includes('audit_chain_hash_mismatch'));
  assert.ok(types(res).includes('trigger_missing'));
  atk.close();
});

test('ștergerea unui rând intermediar este detectată', async () => {
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_no_delete');
  atk.prepare(`DELETE FROM audit_log WHERE action = 'e2'`).run();
  assert.ok(types(verify(atk)).includes('audit_chain_orphan'));
  atk.close();
});

test('un rând inserat ocolind declanșatorul de lanț este detectat', async () => {
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_chain');
  atk.prepare(`INSERT INTO audit_log (sample_id, user_id, action) VALUES (NULL, NULL, 'ocolit')`).run();
  assert.ok(types(verify(atk)).includes('audit_chain_missing'));
  atk.close();
});

test('lanțul de versiuni: modificarea motivului unei versiuni este detectată', async () => {
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER result_versions_no_update');
  atk.prepare(`UPDATE result_versions SET change_reason = 'altul' WHERE version_no = 1`).run();
  assert.ok(types(verify(atk)).includes('versions_chain_hash_mismatch'));
  atk.close();
});

test('atacatorul care recalculează tot lanțul trece de verificarea simplă, dar nu de rezumatul exportat', async () => {
  const exported = exportDigest(process.env.LIMS_DB_PATH, path.join(tmp, 'digests'));
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_chain_no_update;');
  atk.prepare(`UPDATE audit_log SET action = 'rescris' WHERE action = 'e1'`).run();
  // recalculare completă a lanțului, cu aceeași formulă
  let prev = 'GENESIS';
  for (const r of atk.prepare('SELECT * FROM audit_log ORDER BY id').all()) {
    const h = sha256(prev + '|' + JSON.stringify(AUDIT_CHAIN.columns.map(c => r[c])));
    atk.prepare('UPDATE audit_chain SET prev_hash = ?, row_hash = ? WHERE id = ?').run(prev, h, r.id);
    prev = h;
  }
  const chainProblems = types(verify(atk)).filter(t => t.startsWith('audit_chain') || t.startsWith('versions_chain'));
  assert.deepEqual(chainProblems, [], 'limita N2 fără referință externă: lanțul recalculat arată consecvent');
  const withDigest = verify(atk, { digest: exported.digest });
  assert.ok(types(withDigest).includes('digest_audit_mismatch'));
  atk.close();
});

test('rezumatul rămâne valid după adăugarea de evenimente noi', () => {
  const { digest } = exportDigest(process.env.LIMS_DB_PATH, path.join(tmp, 'digests2'));
  logEvent(userId, 'ulterior', null, sampleId); addVersion(sampleId, 3);
  assert.deepEqual(verify(db, { digest }).problems, []);
});

test('rezumatul detectează modificarea unui instantaneu de buletin', async () => {
  const { digest } = exportDigest(process.env.LIMS_DB_PATH, path.join(tmp, 'digests3'));
  const { atk } = await attackerCopy();
  atk.exec('DROP TRIGGER bulletin_snapshots_no_update');
  const altJson = JSON.stringify({ bulletinNo: 'BUL-TEST-1', schimbat: true });
  atk.prepare('UPDATE bulletin_snapshots SET snapshot_json = ?, snapshot_hash = ? WHERE bulletin_no = ?').run(altJson, sha256(altJson), 'BUL-TEST-1');
  assert.ok(types(verify(atk, { digest })).includes('digest_snapshots_mismatch'));
  atk.close();
});

test('un fișier de rezumat alterat este refuzat', () => {
  const { digest } = exportDigest(process.env.LIMS_DB_PATH, path.join(tmp, 'digests4'));
  const altered = { ...digest, audit: { ...digest.audit, count: digest.audit.count + 1 } };
  assert.ok(types(verify(db, { digest: altered })).includes('digest_file_corrupt'));
});

test('exportul de rezumat este refuzat dacă lanțul are discrepanțe', async () => {
  const { file, atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_no_update');
  atk.prepare(`UPDATE audit_log SET action = 'x' WHERE action = 'e1'`).run();
  atk.close();
  assert.throws(() => exportDigest(file, path.join(tmp, 'digests5')), /discrepanțe/);
});

test('rânduri anterioare introducerii lanțului: avertisment, nu eroare', () => {
  const mem = new Database(':memory:');
  mem.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY, sample_id INTEGER, user_id INTEGER, action TEXT, details TEXT, created_at TEXT);
            CREATE TABLE audit_chain (id INTEGER PRIMARY KEY, prev_hash TEXT NOT NULL, row_hash TEXT NOT NULL);`);
  for (let i = 1; i <= 4; i++) mem.prepare('INSERT INTO audit_log VALUES (?, NULL, NULL, ?, NULL, ?)').run(i, `a${i}`, '2026-01-01 00:00:00');
  let prev = 'GENESIS';
  for (const r of mem.prepare('SELECT * FROM audit_log WHERE id >= 3 ORDER BY id').all()) {
    const h = sha256(prev + '|' + JSON.stringify(AUDIT_CHAIN.columns.map(c => r[c])));
    mem.prepare('INSERT INTO audit_chain VALUES (?, ?, ?)').run(r.id, prev, h); prev = h;
  }
  const res = verifyChain(mem, AUDIT_CHAIN);
  assert.deepEqual(res.problems, []);
  assert.deepEqual(res.warnings, [{ type: 'audit_chain_legacy_rows', count: 2 }]);
  mem.close();
});

test('CLI: export de rezumat, apoi verificare reușită și, după rescriere, eșuată', async () => {
  const dest = path.join(tmp, 'cli');
  const env = { PATH: process.env.PATH, LIMS_DB_PATH: process.env.LIMS_DB_PATH };
  const ex = spawnSync(process.execPath, ['scripts/export-digest.js', dest], { cwd: root, env, encoding: 'utf8' });
  assert.equal(ex.status, 0, ex.stderr);
  const file = path.join(dest, fs.readdirSync(dest)[0]);
  const ok = spawnSync(process.execPath, ['scripts/verify-integrity.js', '--digest', file], { cwd: root, env, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Discrepanțe: 0/);
  // baza din care a pornit rezumatul, rescrisă: copie atacată, verificată prin CLI
  const { file: copy, atk } = await attackerCopy();
  atk.exec('DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_chain_no_update;');
  atk.prepare(`UPDATE audit_log SET action = 'rescris' WHERE action = 'e1'`).run();
  let prev = 'GENESIS';
  for (const r of atk.prepare('SELECT * FROM audit_log ORDER BY id').all()) {
    const h = sha256(prev + '|' + JSON.stringify(AUDIT_CHAIN.columns.map(c => r[c])));
    atk.prepare('UPDATE audit_chain SET prev_hash = ?, row_hash = ? WHERE id = ?').run(prev, h, r.id); prev = h;
  }
  atk.close();
  const bad = spawnSync(process.execPath, ['scripts/verify-integrity.js', copy, '--digest', file], { cwd: root, env, encoding: 'utf8' });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /digest_audit_mismatch/);
});
