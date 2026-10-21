// Corecție D6: coada operator/validator trebuie să includă datele necesare buletinului.
// Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-d6-'));
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

async function finish(id) {
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

test('coada include prelevat de, numărul și data buletinului și numele validatorului', async () => {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'făină de test', category: '', sampleDate: new Date().toLocaleDateString('en-CA'), sampledBy: 'Persoană de test', samplingAttested: true, requestedTests: ['ota'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const { bulletinNo } = await finish(c.body.id);
  for (const role of ['operator', 'validator']) {
    as(role);
    const q = await call('GET', '/api/results/queue');
    assert.equal(q.status, 200);
    const row = q.body.samples.find(s => s.id === c.body.id);
    assert.equal(row.sampledBy, 'Persoană de test');
    assert.equal(row.bulletinNo, bulletinNo);
    assert.ok(row.bulletinIssuedAt);
    assert.equal(row.validatedByName, 'Test validator2');
  }
});
