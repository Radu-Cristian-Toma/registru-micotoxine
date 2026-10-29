// Etapa D2 (O1): beneficiarul nu vede valori, verdict, observații, istoric de valori sau conținutul
// jurnalului înainte de validare; le vede după validare. Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-d2-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
delete process.env.LIMS_PUBLIC_VERIFY_RESULTS;
const express = require('express');
const db = require('../../db/database');

let currentUser = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/results', require('../../routes/results'));

let server; let base; const ids = {};
test.before(async () => {
  for (const role of ['owner', 'operator', 'validator', 'validator2']) {
    ids[role] = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)`).run(`${role}@test.invalid`, `Test ${role}`, role.replace(/2$/, '')).lastInsertRowid;
  }
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

const as = (role) => { currentUser = { id: ids[role], role: role.replace(/2$/, ''), fullName: `Test ${role}` }; };
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const today = () => new Date().toLocaleDateString('en-CA');

async function enter(ota) {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'făină de grâu', category: '', sampleDate: today(), samplingAttested: true, requestedTests: ['ota'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const id = c.body.id;
  as('operator');
  const put = await call('PUT', `/api/results/${id}`, { ota, analysisDate: today(), method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted', intakeConfirmed: true, notes: 'observație internă' });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  return id;
}
async function validate(id) {
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved', note: 'ok' })).status, 200);
  as('validator2');
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 200);
}

test('înainte de validare: lista beneficiarului nu arată valori, verdict sau observații', async () => {
  const id = await enter(99);          // peste orice limită: ar fi „fail” preliminar
  as('owner');
  const r = await call('GET', '/api/samples/mine');
  const s = r.body.samples.find(x => x.id === id);
  assert.equal(s.ota, null);
  assert.equal(s.notes, null);
  assert.notEqual(s.status, 'fail');
  assert.notEqual(s.status, 'ok');
  assert.equal(s.validationStatus, 'draft');
});

test('înainte de validare: arhiva, exportul, detaliul, jurnalul și versiunile nu scurg valori', async () => {
  const id = await enter(99);
  as('owner');
  const arch = await call('GET', '/api/samples/archive');
  const a = arch.body.samples.find(x => x.id === id);
  assert.equal(a.ota, null);
  assert.ok(!['ok', 'fail'].includes(a.status));
  const exp = await fetch(base + '/api/samples/archive/export');
  const csv = await exp.text();
  assert.ok(!csv.includes('99'), 'valoarea 99 apare în exportul CSV');
  const det = await call('GET', `/api/samples/${id}`);
  assert.equal(det.body.sample.ota, null);
  assert.ok(!['ok', 'fail'].includes(det.body.sample.status));
  const aud = await call('GET', `/api/samples/${id}/audit`);
  assert.ok(aud.body.audit.length > 0);
  assert.ok(aud.body.audit.every(e => e.details === null));
  const ver = await call('GET', `/api/results/${id}/versions`);
  assert.deepEqual(ver.body.versions, []);
});

test('personalul vede în continuare valorile și verdictul', async () => {
  const id = await enter(99);
  as('operator');
  const q = await call('GET', '/api/results/queue');
  const s = q.body.samples.find(x => x.id === id);
  assert.equal(s.ota, 99);
  assert.equal(s.status, 'fail');
  const aud = await call('GET', `/api/samples/${id}/audit`);
  assert.ok(aud.body.audit.some(e => e.details && e.details.includes('99')));
});

test('după validare beneficiarul vede valorile, verdictul, jurnalul și versiunile', async () => {
  const id = await enter(1.2);
  await validate(id);
  as('owner');
  const mine = (await call('GET', '/api/samples/mine')).body.samples.find(x => x.id === id);
  assert.equal(mine.ota, 1.2);
  assert.ok(['ok', 'fail'].includes(mine.status));
  const aud = await call('GET', `/api/samples/${id}/audit`);
  assert.ok(aud.body.audit.some(e => e.details !== null));
  const ver = await call('GET', `/api/results/${id}/versions`);
  assert.ok(ver.body.versions.length >= 1);
});
