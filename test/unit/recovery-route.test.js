// Etapa C2: validarea rutei pentru corecția de recuperare (date inventate).
// Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-c2-'));
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


async function newSample() {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'porumb de test', category: '', sampleDate: new Date().toLocaleDateString('en-CA'), samplingAttested: true, requestedTests: ['don'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body.id;
}
const body = (extra = {}) => ({ don: 700, analysisDate: new Date().toLocaleDateString('en-CA'), method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted', intakeConfirmed: true, ...extra });

test('corecția cere recuperare validă', async () => {
  const id = await newSample(); as('operator');
  const r = await call('PUT', `/api/results/${id}`, body({ methodPerformance: { don: { corrected: true } }, limitChangeReason: 'test' }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /recuperare/i);
});

test('bifarea corecției necesită motiv scris și schimbă verdictul', async () => {
  const id = await newSample(); as('operator');
  const perf = { don: { recoveryPct: 80, corrected: true } };
  const fara = await call('PUT', `/api/results/${id}`, body({ methodPerformance: perf }));
  assert.equal(fara.status, 400);
  const cu = await call('PUT', `/api/results/${id}`, body({ methodPerformance: perf, limitChangeReason: 'validare metodă: recuperare 80 %' }));
  assert.equal(cu.status, 200, JSON.stringify(cu.body));
  const q = await call('GET', '/api/results/queue');
  const row = q.body.samples.find(s => s.id === id);
  assert.equal(row.status, 'fail'); // 700 / 0,8 = 875 > 750
  const ev = db.prepare(`SELECT details FROM audit_log WHERE sample_id = ? AND details LIKE '%correctionChanged%'`).get(id);
  assert.ok(ev, 'evenimentul de audit conține correctionChanged');
});

test('necorectat: aceeași valoare rămâne conformă', async () => {
  const id = await newSample(); as('operator');
  const r = await call('PUT', `/api/results/${id}`, body({ methodPerformance: { don: { recoveryPct: 80 } } }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const q = await call('GET', '/api/results/queue');
  assert.notEqual(q.body.samples.find(s => s.id === id).status, 'fail');
});
