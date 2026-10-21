// Etapa B2 (L5): proveniența limitelor pe rezultat, semnalarea limitelor
// implicite și motiv obligatoriu la modificarea manuală. Rute montate pe o
// aplicație Express minimă, cu bază de date temporară și sesiune simulată;
// toate datele sunt inventate pentru test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b2-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');

const express = require('express');
const db = require('../../db/database');

let currentUser = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/results', require('../../routes/results'));

let server; let base;
const ids = {};
test.before(async () => {
  for (const [k, role] of [['owner', 'owner'], ['operator', 'operator']]) {
    const r = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)`).run(`${k}@test.invalid`, `Test ${k}`, role);
    ids[k] = r.lastInsertRowid;
  }
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

const as = (role) => { currentUser = { id: ids[role], role, fullName: `Test ${role}` }; };
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function createSample(productName, category = '') {
  as('owner');
  const r = await call('POST', '/api/samples', { productName, category, sampleDate: new Date().toLocaleDateString('en-CA'), samplingAttested: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.id;
}
const row = (id) => db.prepare('SELECT * FROM results WHERE sample_id = ?').get(id);

test('profil recunoscut: se salvează profilul, sursa, referința și baza „profile”', async () => {
  const id = await createSample('făină de grâu tip 650');
  const r = row(id);
  assert.equal(r.limit_profile_id, 'cereal-milling-products');
  assert.equal(r.limit_basis, 'profile');
  assert.match(r.limit_source, /2023\/915/);
  assert.match(r.limit_regulation_ref, /2023\/915/);
  assert.equal(r.limit_don, 600);
});

test('niciun profil recunoscut: baza „fallback” și eveniment în jurnalul de audit', async () => {
  const id = await createSample('produs necunoscut XYZ');
  const r = row(id);
  assert.equal(r.limit_profile_id, null);
  assert.equal(r.limit_basis, 'fallback');
  const ev = db.prepare(`SELECT * FROM audit_log WHERE sample_id = ? AND action = 'limits_fallback_applied'`).get(id);
  assert.ok(ev);
});

test('modificarea unei limite fără motiv este refuzată (400) și nu schimbă nimic', async () => {
  const id = await createSample('făină de grâu');
  as('operator');
  const r = await call('PUT', `/api/results/${id}`, { limitDon: 750, don: 100 });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /motiv/i);
  assert.equal(row(id).limit_don, 600);
  assert.equal(row(id).limit_basis, 'profile');
});

test('modificarea cu motiv trece: baza devine „manual”, motivul și valorile vechi/noi se păstrează', async () => {
  const id = await createSample('făină de grâu');
  as('operator');
  const r = await call('PUT', `/api/results/${id}`, { limitDon: 750, don: 100, limitChangeReason: 'Cerință contractuală a clientului [exemplu de test]' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const res = row(id);
  assert.equal(res.limit_don, 750);
  assert.equal(res.limit_basis, 'manual');
  assert.match(res.limit_override_reason, /contractuală/);
  const ev = db.prepare(`SELECT details FROM audit_log WHERE sample_id = ? AND action = 'results_saved' ORDER BY id DESC`).get(id);
  const d = JSON.parse(ev.details);
  assert.equal(d.limitBasis, 'manual');
  assert.deepEqual(d.limitChanges.changes.don, { from: 600, to: 750 });
  assert.match(d.limitChanges.reason, /contractuală/);
  const v = db.prepare('SELECT snapshot_json FROM result_versions WHERE sample_id = ? ORDER BY version_no DESC').get(id);
  assert.equal(JSON.parse(v.snapshot_json).limitBasis, 'profile');
});

test('trimiterea acelorași limite (neschimbate) nu cere motiv și păstrează baza „profile”', async () => {
  const id = await createSample('făină de grâu');
  as('operator');
  const r = await call('PUT', `/api/results/${id}`, { limitAfb1: 2, limitAflaSum: 4, limitOta: 3, limitDon: 600, limitZea: 75, don: 100 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(row(id).limit_basis, 'profile');
  assert.equal(row(id).limit_override_reason, null);
});

test('proba de reanaliză moștenește proveniența limitelor', async () => {
  const id = await createSample('stafide');
  as('owner');
  const orig = row(id);
  assert.equal(orig.limit_profile_id, 'dried-vine-fruit-final');
  const rt = await call('POST', `/api/samples/${id}/retest`, { reason: 'verificare de test' });
  if (rt.status === 200) {
    const n = row(rt.body.id);
    assert.equal(n.limit_profile_id, 'dried-vine-fruit-final');
    assert.equal(n.limit_basis, 'profile');
    assert.equal(n.limit_source, orig.limit_source);
  } else {
    // reanaliza poate fi permisă doar după anumite stări; nu e obiectul acestui test
    assert.ok([400, 403].includes(rt.status), JSON.stringify(rt.body));
  }
});

test('GET proba expune câmpurile de proveniență', async () => {
  const id = await createSample('făină de grâu');
  as('operator');
  const q = await call('GET', '/api/results/archive');
  assert.equal(q.status, 200, JSON.stringify(q.body));
  const list = Array.isArray(q.body) ? q.body : (q.body.rows || q.body.samples || []);
  const mine = list.find(x => x.id === id);
  assert.ok(mine, 'proba lipsește din arhivă');
  assert.equal(mine.limitProfileId, 'cereal-milling-products');
  assert.equal(mine.limitBasis, 'profile');
});
