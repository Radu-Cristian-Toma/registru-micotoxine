// Etapa B4 (L6, L18): instantaneu de buletin la emitere, versiuni la
// validare/revizuire, verificare publică minimală. Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b4-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
delete process.env.LIMS_PUBLIC_VERIFY_RESULTS;
const express = require('express');
const db = require('../../db/database');
const { verify } = require('../../scripts/verify-integrity');

let currentUser = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/results', require('../../routes/results'));

let server; let base; const ids = {};
test.before(async () => {
  for (const role of ['owner', 'operator', 'validator', 'validator2']) {
    ids[role] = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)`).run(`${role}@test.invalid`, `Test ${role}`, role === 'validator2' ? 'validator' : role).lastInsertRowid;
  }
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

const as = (role) => { currentUser = { id: ids[role], role: role === 'validator2' ? 'validator' : role, fullName: `Test ${role}` }; };
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Parcurge fluxul complet: înregistrare → rezultate (QC acceptat) → revizuire → validare.
async function issueBulletin(product = 'făină de grâu') {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: product, category: '', sampleDate: new Date().toLocaleDateString('en-CA'), samplingAttested: true, requestedTests: ['ota'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const id = c.body.id;
  as('operator');
  const put = await call('PUT', `/api/results/${id}`, { ota: 1.2, analysisDate: new Date().toLocaleDateString('en-CA'), method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted', intakeConfirmed: true });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  as('validator');
  const rv = await call('POST', `/api/results/${id}/review`, { decision: 'approved', note: 'ok' });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  as('validator2');
  const v = await call('POST', `/api/results/${id}/validate`, {});
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { id, bulletinNo: v.body.bulletinNo };
}

test('la validare se stochează un instantaneu cu SHA-256 corect și conținut complet', async () => {
  const { id, bulletinNo } = await issueBulletin();
  const bs = db.prepare('SELECT * FROM bulletin_snapshots WHERE sample_id = ?').get(id);
  assert.ok(bs);
  assert.equal(bs.bulletin_no, bulletinNo);
  assert.equal(crypto.createHash('sha256').update(bs.snapshot_json).digest('hex'), bs.snapshot_hash);
  const snap = JSON.parse(bs.snapshot_json);
  assert.equal(snap.results.ota, 1.2);
  assert.equal(snap.limits.ota, 3);
  assert.equal(snap.limitProvenance.profileId, 'cereal-milling-products');
  assert.equal(snap.validation.validatedByName, 'Test validator2');
  assert.equal(snap.sample.productName, 'făină de grâu');
  assert.ok(db.prepare(`SELECT 1 FROM audit_log WHERE sample_id = ? AND action = 'bulletin_snapshot_stored'`).get(id));
});

test('instantaneul nu poate fi modificat sau șters', async () => {
  const { id } = await issueBulletin();
  assert.throws(() => db.prepare('UPDATE bulletin_snapshots SET snapshot_json = ? WHERE sample_id = ?').run('{}', id), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM bulletin_snapshots WHERE sample_id = ?').run(id), /append-only/);
});

test('validarea și revizuirea scriu versiuni în istoric, cu motiv', async () => {
  const { id } = await issueBulletin();
  const reasons = db.prepare('SELECT change_reason FROM result_versions WHERE sample_id = ? ORDER BY version_no').all(id).map(r => r.change_reason);
  assert.ok(reasons.includes('revizuire: approved'), JSON.stringify(reasons));
  assert.ok(reasons.includes('validare: emitere buletin'), JSON.stringify(reasons));
});

test('endpointul de instantaneu returnează conținutul și starea integrității', async () => {
  const { id, bulletinNo } = await issueBulletin();
  as('operator');
  const r = await call('GET', `/api/results/${id}/bulletin-snapshot`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.integrity, 'ok');
  assert.equal(r.body.bulletinNo, bulletinNo);
  assert.equal(r.body.snapshot.results.ota, 1.2);
});

test('verificarea publică este minimală implicit: fără rezultate, nume de produs sau limite', async () => {
  const { bulletinNo } = await issueBulletin('stafide');
  currentUser = null;
  const r = await call('GET', `/api/results/public/verify/${bulletinNo}`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const b = r.body.bulletin;
  assert.equal(b.detailLevel, 'minimal');
  assert.equal(b.bulletinNo, bulletinNo);
  assert.match(b.snapshotHash, /^[0-9a-f]{64}$/);
  const txt = JSON.stringify(r.body);
  for (const leak of ['"results"', '"limits"', 'productName', 'stafide', 'ota']) assert.ok(!txt.includes(leak), `scurgere: ${leak}`);
});

test('cu LIMS_PUBLIC_VERIFY_RESULTS=1 verificarea publică revine la varianta completă', async () => {
  const { bulletinNo } = await issueBulletin();
  process.env.LIMS_PUBLIC_VERIFY_RESULTS = '1';
  try {
    currentUser = null;
    const r = await call('GET', `/api/results/public/verify/${bulletinNo}`);
    assert.equal(r.body.bulletin.detailLevel, 'full');
    assert.equal(r.body.bulletin.results.ota, 1.2);
    assert.match(r.body.bulletin.snapshotHash, /^[0-9a-f]{64}$/);
  } finally { delete process.env.LIMS_PUBLIC_VERIFY_RESULTS; }
});

test('verify-integrity: instantanee intacte → fără discrepanțe; buletin fără instantaneu → doar avertisment', async () => {
  const { id } = await issueBulletin();
  let rep = verify(db);
  assert.deepEqual(rep.problems.filter(p => p.sampleId === id), []);
  assert.ok(rep.snapshotsChecked >= 1);
  // simulăm un buletin emis înainte de B4: rezultat validat, fără instantaneu
  const legacy = db.prepare(`INSERT INTO samples (code, owner_id, product_name, status) VALUES ('LEG-1', ?, 'x', 'pending')`).run(ids.owner).lastInsertRowid;
  db.prepare(`INSERT INTO results (sample_id, validation_status, bulletin_no) VALUES (?, 'validated', 'BUL-2020-00001')`).run(legacy);
  rep = verify(db);
  assert.ok(rep.warnings.some(w => w.sampleId === legacy && w.type === 'snapshot_missing'));
  assert.ok(!rep.problems.some(p => p.sampleId === legacy));
});

test('VAL-08 are textul corectat', () => {
  assert.match(db.prepare(`SELECT expected FROM system_validation_tests WHERE code = 'VAL-08'`).get().expected, /fără a expune rezultatele/);
});
