// Etapa D1: loturi cu mai multe probe de laborator. Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-lots-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
delete process.env.LIMS_PUBLIC_VERIFY_RESULTS;
const express = require('express');
const db = require('../../db/database');
const { evaluateLot } = require('../../db/lots');

let currentUser = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/results', require('../../routes/results'));
app.use('/api/lots', require('../../routes/lots'));
app.use('/api/lab', require('../../routes/lab'));

let server; let base; const ids = {};
test.before(async () => {
  for (const role of ['owner', 'owner2', 'operator', 'validator', 'validator2']) {
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

// Probă cu rezultat OTA introdus (nevalidat); U relativă 30 %, regula 2782.
async function sampleWithOta(ota, owner = 'owner') {
  as(owner);
  const c = await call('POST', '/api/samples', { productName: 'smochine uscate', category: '', sampleDate: today(), samplingAttested: true, requestedTests: ['ota'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const id = c.body.id;
  as('operator');
  const put = await call('PUT', `/api/results/${id}`, {
    ota, analysisDate: today(), method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted', intakeConfirmed: true,
    decisionRule: 'reg_2782_u', methodPerformance: { ota: { uRelPct: 30 } }, limitOta: 5, limitChangeReason: 'limită și regulă fixate pentru test'
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  return id;
}
async function validate(id) {
  as('validator');
  const rv = await call('POST', `/api/results/${id}/review`, { decision: 'approved', note: 'ok' });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  as('validator2');
  const v = await call('POST', `/api/results/${id}/validate`, {});
  assert.equal(v.status, 200, JSON.stringify(v.body));
}

test('constituirea lotului: validări de intrare', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(6.5);
  const other = await sampleWithOta(4, 'owner2');
  as('operator');
  assert.equal((await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a] })).status, 400);
  assert.equal((await call('POST', '/api/lots', { lotMode: 'max', sampleIds: [a, b] })).status, 400);
  const mixed = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, other] });
  assert.equal(mixed.status, 400);
  assert.match(mixed.body.error, /aceluiași beneficiar/);
  assert.equal((await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, a] })).status, 400);
  as('owner');
  assert.equal((await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] })).status, 403);
});

test('decizia de lot diferă după mod: none_exceeds → în incertitudine; average → conform', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(6.5);
  as('operator');
  const L1 = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] });
  assert.equal(L1.status, 200, JSON.stringify(L1.body));
  assert.match(L1.body.code, /^LOT-\d{4}-0001$/);
  let e = evaluateLot(L1.body.id);
  assert.equal(e.analytes.ota.verdict, 'within_uncertainty'); // 6,5 > 5, dar 6,5 − 30 % = 4,55 ≤ 5
  assert.equal(e.overall, 'within_uncertainty');
  assert.equal(e.final, false);
  // același set în mod „average”: media 4,75 ≤ 5 → conform
  const c = await sampleWithOta(3);
  const d = await sampleWithOta(6.5);
  const L2 = await call('POST', '/api/lots', { lotMode: 'average', sampleIds: [c, d] });
  e = evaluateLot(L2.body.id);
  assert.equal(e.analytes.ota.verdict, 'conform');
  assert.equal(e.overall, 'conform');
});

test('respingere de lot: o probă depășește dincolo de îndoială', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(9);   // 9 − 30 % = 6,3 > 5
  as('operator');
  const r = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] });
  const e = evaluateLot(r.body.id);
  assert.equal(e.analytes.ota.verdict, 'non_conform');
  assert.equal(e.overall, 'non_conform');
});

test('motive de lipsă a verdictului: limite diferite și valori lipsă', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(4);
  as('operator');
  const r = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] });
  db.prepare('UPDATE results SET limit_ota = 8 WHERE sample_id = ?').run(b);
  let e = evaluateLot(r.body.id);
  assert.ok(e.analytes.ota.issues.includes('limits_differ'));
  assert.equal(e.analytes.ota.verdict, null);
  db.prepare('UPDATE results SET limit_ota = 5, ota = NULL WHERE sample_id = ?').run(b);
  e = evaluateLot(r.body.id);
  assert.ok(e.analytes.ota.issues.includes('incomplete'));
  assert.equal(e.overall, null);
});

test('lotul se îngheață după validarea unei probe; beneficiarul vede decizia numai când lotul este final', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(6.5);
  as('operator');
  const r = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] });
  const lotId = r.body.id;
  await validate(a);
  as('operator');
  assert.equal((await call('DELETE', `/api/lots/${lotId}/members/${a}`)).status, 409);
  assert.equal((await call('DELETE', `/api/lots/${lotId}`)).status, 409);
  as('owner');
  const partial = await call('GET', `/api/lots/by-sample/${a}`);
  assert.equal(partial.status, 200);
  assert.equal(partial.body.final, false);
  assert.equal(partial.body.overall, undefined);          // fără verdict preliminar
  assert.equal(partial.body.analytes, undefined);
  await validate(b);
  as('owner');
  const fin = await call('GET', `/api/lots/by-sample/${a}`);
  assert.equal(fin.body.final, true);
  assert.equal(fin.body.overall, 'within_uncertainty');
  // alt beneficiar: acces refuzat
  as('owner2');
  assert.ok([403, 404].includes((await call('GET', `/api/lots/by-sample/${a}`)).status));
});

test('adăugarea și scoaterea de membri, desființarea lotului și jurnalul de audit', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(4);
  const c = await sampleWithOta(5);
  as('operator');
  const r = await call('POST', '/api/lots', { lotMode: 'average', sampleIds: [a, b] });
  const lotId = r.body.id;
  assert.equal((await call('POST', `/api/lots/${lotId}/members`, { sampleId: c })).status, 200);
  assert.equal(evaluateLot(lotId).members.length, 3);
  assert.equal((await call('DELETE', `/api/lots/${lotId}/members/${c}`)).status, 200);
  assert.equal((await call('DELETE', `/api/lots/${lotId}/members/${b}`)).status, 400); // sub 2 probe
  assert.equal((await call('DELETE', `/api/lots/${lotId}`)).status, 200);
  assert.equal(db.prepare('SELECT lot_id FROM samples WHERE id = ?').get(a).lot_id, null);
  const actions = db.prepare("SELECT action FROM audit_log WHERE action LIKE 'lot_%' ORDER BY id").all().map(x => x.action);
  for (const need of ['lot_created', 'lot_member_added', 'lot_member_removed', 'lot_dissolved']) assert.ok(actions.includes(need), need);
});

test('dosarul probei conține lotul (cod, mod, coduri) fără valorile celorlalte probe și fără verdict până la validare', async () => {
  const a = await sampleWithOta(3);
  const b = await sampleWithOta(6.5);
  as('operator');
  const r = await call('POST', '/api/lots', { lotMode: 'none_exceeds', sampleIds: [a, b] });
  const d = await call('GET', `/api/lab/dossier/${a}`);
  assert.equal(d.status, 200, JSON.stringify(d.body));
  const lot = d.body.content.lot;
  assert.equal(lot.code, r.body.code);
  assert.equal(lot.lotMode, 'none_exceeds');
  assert.equal(lot.memberCodes.length, 2);
  assert.equal(lot.final, false);
  assert.equal(lot.overall, null);
  assert.ok(!JSON.stringify(lot).includes('6.5'));
});
