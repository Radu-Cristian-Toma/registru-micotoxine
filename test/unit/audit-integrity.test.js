// Etapa B3 (L7, L8): jurnal append-only, evenimente fără probă, verificarea
// sumelor de control. Bază temporară, date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b3-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');

const db = require('../../db/database');
const { logEvent } = require('../../db/audit');
const { verify } = require('../../scripts/verify-integrity');
test.after(() => { try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

function seedSample() {
  const u = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', 'Test', 'owner')`).run(`o${Math.random()}@test.invalid`);
  const s = db.prepare(`INSERT INTO samples (code, owner_id, product_name, status) VALUES (?, ?, 'test', 'pending')`).run(`T-${Math.random()}`, u.lastInsertRowid);
  return { userId: u.lastInsertRowid, sampleId: s.lastInsertRowid };
}
function addVersion(sampleId, no, snapshot, hash) {
  const json = JSON.stringify(snapshot);
  const h = hash || crypto.createHash('sha256').update(json).digest('hex');
  db.prepare('INSERT INTO result_versions (sample_id, version_no, snapshot_json, snapshot_hash) VALUES (?, ?, ?, ?)').run(sampleId, no, json, h);
}

test('audit_log: sample_id acceptă NULL (evenimente fără probă)', () => {
  const { userId } = seedSample();
  const r = logEvent(userId, 'lab_settings_updated', { changedFields: ['institution_name'] });
  const row = db.prepare('SELECT * FROM audit_log WHERE id = ?').get(r.lastInsertRowid);
  assert.equal(row.sample_id, null);
  assert.equal(JSON.parse(row.details).changedFields[0], 'institution_name');
});

test('audit_log: UPDATE și DELETE sunt blocate', () => {
  const { userId, sampleId } = seedSample();
  const r = logEvent(userId, 'x', null, sampleId);
  assert.throws(() => db.prepare('UPDATE audit_log SET action = ? WHERE id = ?').run('y', r.lastInsertRowid), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id = ?').run(r.lastInsertRowid), /append-only/);
  assert.equal(db.prepare('SELECT action FROM audit_log WHERE id = ?').get(r.lastInsertRowid).action, 'x');
});

test('result_versions: UPDATE și DELETE sunt blocate', () => {
  const { sampleId } = seedSample();
  addVersion(sampleId, 1, { a: 1 });
  assert.throws(() => db.prepare('UPDATE result_versions SET snapshot_json = ? WHERE sample_id = ?').run('{}', sampleId), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM result_versions WHERE sample_id = ?').run(sampleId), /append-only/);
});

test('verify: bază curată → fără discrepanțe', () => {
  const { sampleId } = seedSample();
  addVersion(sampleId, 1, { a: 1 }); addVersion(sampleId, 2, { a: 2 });
  assert.deepEqual(verify(db).problems.filter(p => p.sampleId === sampleId), []);
  assert.deepEqual(verify(db).problems.filter(p => p.type === 'trigger_missing'), []);
});

test('verify: suma de control greșită și golul de numerotare sunt detectate', () => {
  const { sampleId } = seedSample();
  addVersion(sampleId, 1, { a: 1 }, 'deadbeef');
  addVersion(sampleId, 3, { a: 3 });
  const types = verify(db).problems.filter(p => p.sampleId === sampleId).map(p => p.type).sort();
  assert.deepEqual(types, ['hash_mismatch', 'version_gap']);
});

test('verify: lipsa unui declanșator este raportată', () => {
  db.exec('DROP TRIGGER audit_log_no_delete');
  assert.ok(verify(db).problems.some(p => p.type === 'trigger_missing' && p.name === 'audit_log_no_delete'));
});

test('migrarea: un audit_log vechi (sample_id NOT NULL) este reconstruit cu datele păstrate', () => {
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b3m-'));
  const dbPath = path.join(tmp2, 'old.db');
  const { spawnSync } = require('child_process');
  const preload = process.execArgv.join(' ').match(/--require[= ](\S+)/);
  const base = preload ? ['--require', preload[1]] : [];
  const dbModule = JSON.stringify(path.resolve(__dirname, '../../db/database'));
  const run = (code) => spawnSync(process.execPath, [...base, '-e', code], { env: { ...process.env, LIMS_DB_PATH: dbPath }, encoding: 'utf8' });

  // 1) schema curenta, apoi revenim manual la forma veche (sample_id NOT NULL, fara declansatoare)
  const step1 = run(`const db=require(${dbModule});
    db.exec(\`DROP TRIGGER audit_log_no_update; DROP TRIGGER audit_log_no_delete; DROP TABLE audit_log;
      CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, sample_id INTEGER NOT NULL, user_id INTEGER, action TEXT NOT NULL, details TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')), FOREIGN KEY (sample_id) REFERENCES samples(id), FOREIGN KEY (user_id) REFERENCES users(id));
      INSERT INTO users (email,password_hash,full_name,role) VALUES ('m@test.invalid','x','M','owner');
      INSERT INTO samples (code, owner_id, product_name, status) VALUES ('S1', 1, 'p', 'pending');
      INSERT INTO audit_log (sample_id, action, details) VALUES (1, 'old_event', '{}');\`);`);
  assert.equal(step1.status, 0, step1.stderr);

  // 2) redeschidem prin aplicatie: migrarea trebuie sa ruleze
  const step2 = run(`const db=require(${dbModule});
    const c=db.prepare('PRAGMA table_info(audit_log)').all().find(x=>x.name==='sample_id');
    const n=db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='old_event'").get().n;
    const t=db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'audit_log_no_%'").get().n;
    console.log(JSON.stringify({notnull:c.notnull,kept:n,triggers:t}));`);
  fs.rmSync(tmp2, { recursive: true, force: true });
  assert.deepEqual(JSON.parse(step2.stdout.trim().split('\n').pop()), { notnull: 0, kept: 1, triggers: 2 }, step2.stderr);
});
