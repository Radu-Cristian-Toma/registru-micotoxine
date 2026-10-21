// Etapa C2: antetul și semnătura buletinului emis rămân cele de la emitere (date inventate).
// Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-c2b-'));
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


test('buletinul emis păstrează antetul și imaginile de la emitere după schimbarea setărilor', async () => {
  db.prepare(`UPDATE lab_settings SET institution_name = 'Laborator inițial', signature_name = 'Semnatar inițial', signature_data_url = 'data:image/png;base64,AAAA' WHERE id = 1`).run();
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'făină de test', category: '', sampleDate: new Date().toLocaleDateString('en-CA'), samplingAttested: true, requestedTests: ['ota'] });
  const id = c.body.id;
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, analysisDate: new Date().toLocaleDateString('en-CA'), method: 'metodă', equipment: 'echipament', qcStatus: 'accepted', intakeConfirmed: true })).status, 200);
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved', note: 'ok' })).status, 200);
  as('validator2');
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 200);

  db.prepare(`UPDATE lab_settings SET institution_name = 'Laborator schimbat', signature_name = 'Semnatar nou', signature_data_url = 'data:image/png;base64,BBBB' WHERE id = 1`).run();
  as('owner');
  const r = await call('GET', `/api/results/${id}/issued-branding`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.institutionName, 'Laborator inițial');
  assert.equal(r.body.signatureName, 'Semnatar inițial');
  assert.equal(r.body.signatureDataUrl, 'data:image/png;base64,AAAA');
  assert.equal(r.body.partial, false);
  assert.throws(() => db.prepare('DELETE FROM branding_assets').run(), /append-only/);
});
