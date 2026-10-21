// Etapa B3 (L8): evenimentele anterior nejurnalizate apar acum în audit_log.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b3e-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
const express = require('express');
const db = require('../../db/database');

let currentUser = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/admin', require('../../routes/admin'));
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/validation', require('../../routes/validation'));
app.use('/api/incidents', require('../../routes/incidents'));

let server; let base; let adminId; let ownerId; let sampleId;
test.before(async () => {
  adminId = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('a@test.invalid','x','Admin Test','admin')`).run().lastInsertRowid;
  ownerId = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('o@test.invalid','x','Owner Test','owner')`).run().lastInsertRowid;
  sampleId = db.prepare(`INSERT INTO samples (code, owner_id, product_name, status) VALUES ('T-1', ?, 'test', 'pending')`).run(ownerId).lastInsertRowid;
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
  currentUser = { id: adminId, role: 'admin', fullName: 'Admin Test' };
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const events = (action) => db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id').all(action);

test('crearea contului de operator și de validator este jurnalizată (fără parolă)', async () => {
  for (const [url, role] of [['/api/admin/operators', 'operator'], ['/api/admin/validators', 'validator']]) {
    const r = await call('POST', url, { email: `${role}@test.invalid`, password: 'parola-de-test', fullName: `Test ${role}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const ev = events('account_created');
  assert.equal(ev.length, 2);
  assert.deepEqual(ev.map(e => JSON.parse(e.details).role), ['operator', 'validator']);
  assert.ok(ev.every(e => e.sample_id === null && e.user_id === adminId));
  assert.ok(ev.every(e => !/parola|password/i.test(e.details)));
});

test('modificarea setărilor laboratorului: se jurnalizează numele câmpurilor, nu conținutul', async () => {
  const r = await call('PUT', '/api/admin/lab-settings', { institutionName: 'Laborator de test', signatureName: 'Test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = JSON.parse(events('lab_settings_updated').pop().details);
  assert.ok(d.changedFields.includes('institution_name'));
  assert.ok(!JSON.stringify(d).includes('Laborator de test'));
});

test('modificarea termenului de livrare este jurnalizată cu valoarea veche și cea nouă', async () => {
  const r = await call('PUT', `/api/samples/${sampleId}/due-date`, { dueDate: '2030-01-15' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = events('due_date_changed').pop();
  assert.equal(e.sample_id, sampleId);
  assert.deepEqual(JSON.parse(e.details), { from: null, to: '2030-01-15' });
});

test('înregistrarea unui test de validare este jurnalizată', async () => {
  const t = db.prepare(`SELECT id, code FROM system_validation_tests ORDER BY id LIMIT 1`).get();
  const r = await call('POST', `/api/validation/${t.id}`, { result: 'passed', note: 'test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = JSON.parse(events('validation_test_recorded').pop().details);
  assert.equal(d.code, t.code);
  assert.equal(d.result, 'passed');
});

test('incidentul fără probă este jurnalizat cu sample_id NULL', async () => {
  const r = await call('POST', '/api/incidents', { type: 'other', severity: 'low', description: 'incident de test' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const e = events('system_incident_opened').pop();
  assert.equal(e.sample_id, null);
  assert.equal(JSON.parse(e.details).code, r.body.code);
});

test('VAL-06 are textul corectat', () => {
  const t = db.prepare(`SELECT expected FROM system_validation_tests WHERE code = 'VAL-06'`).get();
  assert.match(t.expected, /nu mai poate fi modificat/);
});
