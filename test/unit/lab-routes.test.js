// Etapa C3/C4: registru echipamente și loturi (L14), controale QC (L13), starea buletinului (L10),
// separarea sarcinilor (L17), retragerea valorilor (L20), starea la recepție (L16), baza de raportare (L22),
// date de prelevare (L15), export dosar (L12). Date inventate, bază temporară.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-c34-'));
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
app.use('/api/admin', require('../../routes/admin'));
app.use('/api/lab', require('../../routes/lab'));

let server; let base; const ids = {};
const ROLE = { validator2: 'validator' };
test.before(async () => {
  for (const name of ['owner', 'operator', 'validator', 'validator2', 'admin']) {
    ids[name] = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)`).run(`${name}@test.invalid`, `Test ${name}`, ROLE[name] || name).lastInsertRowid;
  }
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });

const as = (name) => { currentUser = { id: ids[name], role: ROLE[name] || name, fullName: `Test ${name}` }; };
async function call(method, url, body) {
  const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const today = () => new Date().toLocaleDateString('en-CA');
const plusDays = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA');
const ALLOW = () => { as('admin'); return call('PUT', '/api/admin/policy', { strictRoles: false, reason: 'test' }); };
const STRICT = () => { as('admin'); return call('PUT', '/api/admin/policy', { strictRoles: true }); };

async function newSample(extra = {}) {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'făină de test', category: '', sampleDate: today(), samplingAttested: true, requestedTests: ['ota'], ...extra });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body.id;
}
const base_ = { analysisDate: today(), method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted', intakeConfirmed: true };
async function issue(id, put = {}) {
  as('operator');
  const p = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, ...put });
  assert.equal(p.status, 200, JSON.stringify(p.body));
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved', note: 'ok' })).status, 200);
  as('validator2');
  const v = await call('POST', `/api/results/${id}/validate`, {});
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return v.body.bulletinNo;
}

test('L17: implicit strict — administratorul nu introduce, nu aprobă și nu validează; același validator nu aprobă și validează', async () => {
  const id = await newSample();
  as('admin');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1, ...base_ })).status, 403);
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_ })).status, 200);
  as('admin');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved' })).status, 403);
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved' })).status, 200);
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 403);
  as('admin');
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 403);
  as('validator2');
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 200);
});

test('L17: relaxarea cere motiv și este jurnalizată; apoi același validator poate valida', async () => {
  as('admin');
  assert.equal((await call('PUT', '/api/admin/policy', { strictRoles: false })).status, 400);
  assert.equal((await ALLOW()).status, 200);
  assert.ok(db.prepare(`SELECT 1 FROM audit_log WHERE action = 'policy_updated'`).get());
  const id = await newSample();
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_ })).status, 200);
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved' })).status, 200);
  assert.equal((await call('POST', `/api/results/${id}/validate`, {})).status, 200);
  assert.equal((await STRICT()).status, 200);
});

test('L14: registru de echipamente — creare, validare, cod unic, stare calibrare, jurnal', async () => {
  as('operator');
  assert.equal((await call('POST', '/api/lab/equipment', { code: 'EQ-1' })).status, 400);
  assert.equal((await call('POST', '/api/lab/equipment', { code: 'EQ-1', name: 'x', calibrationDue: '2026-13-45' })).status, 400);
  assert.equal((await call('POST', '/api/lab/equipment', { code: 'EQ-1', name: 'x', calibrationDate: '2026-05-01', calibrationDue: '2026-01-01' })).status, 400);
  const ok = await call('POST', '/api/lab/equipment', { code: 'EQ-OK', name: 'Cititor de test', calibrationDate: today(), calibrationDue: plusDays(200) });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/api/lab/equipment', { code: 'EQ-OK', name: 'dup' })).status, 409);
  const exp = await call('POST', '/api/lab/equipment', { code: 'EQ-EXP', name: 'Expirat', calibrationDue: plusDays(-5) });
  const list = (await call('GET', '/api/lab/equipment')).body.equipment;
  assert.equal(list.find(e => e.code === 'EQ-OK').calibrationState, 'ok');
  assert.equal(list.find(e => e.code === 'EQ-EXP').calibrationState, 'expired');
  assert.equal((await call('PUT', `/api/lab/equipment/${exp.body.id}`, { calibrationDue: plusDays(100), calibrationRef: 'cert. de test' })).status, 200);
  assert.ok(db.prepare(`SELECT 1 FROM audit_log WHERE action = 'equipment_updated'`).get());
  as('owner');
  assert.equal((await call('GET', '/api/lab/equipment')).status, 403);
});

test('L14: loturi — tip, grup, date; trimiterea cere calibrare valabilă și lot neexpirat', async () => {
  as('operator');
  assert.equal((await call('POST', '/api/lab/reagent-lots', { code: 'L-1', name: 'x', kind: 'altceva', lotNo: '1' })).status, 400);
  const lot = await call('POST', '/api/lab/reagent-lots', { code: 'RM-1', name: 'Material de referință [test]', kind: 'reference_material', lotNo: 'A1', analyteGroup: 'ota', certifiedValue: 5, certifiedU: 0.4, unit: 'µg/kg', expiryDate: plusDays(100) });
  assert.equal(lot.status, 200);
  const oldLot = await call('POST', '/api/lab/reagent-lots', { code: 'RM-OLD', name: 'Expirat', kind: 'reagent', lotNo: 'B', expiryDate: plusDays(-1) });
  const eqOk = (await call('GET', '/api/lab/equipment')).body.equipment.find(e => e.code === 'EQ-OK').id;
  const eqExp = await call('POST', '/api/lab/equipment', { code: 'EQ-EXP2', name: 'Expirat 2', calibrationDue: plusDays(-5) });
  const id = await newSample();
  as('operator');
  let r = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, equipmentIds: [eqExp.body.id] });
  assert.equal(r.status, 400); assert.match(r.body.error, /calibrarea expirată/);
  r = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, equipmentIds: [eqOk], reagentLotIds: [oldLot.body.id] });
  assert.equal(r.status, 400); assert.match(r.body.error, /expirat/);
  r = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, equipmentIds: [eqOk], reagentLotIds: [lot.body.id] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = db.prepare('SELECT equipment_ids_json, reagent_lot_ids_json FROM results WHERE sample_id = ?').get(id);
  assert.deepEqual(JSON.parse(row.equipment_ids_json), [eqOk]);
});

test('L13: control QC — interval obligatoriu, verdict bilateral, istoric și stare', async () => {
  as('operator');
  const lot = (await call('GET', '/api/lab/reagent-lots')).body.lots.find(l => l.code === 'RM-1');
  assert.equal((await call('POST', '/api/lab/qc-controls', { analyteGroup: 'ota', measuredValue: 5, reagentLotId: lot.id })).status, 400);
  assert.equal((await call('POST', '/api/lab/qc-controls', { analyteGroup: 'xx', measuredValue: 5, expectedValue: 5, acceptLowPct: 80, acceptHighPct: 120 })).status, 400);
  const pass = await call('POST', '/api/lab/qc-controls', { analyteGroup: 'ota', measuredValue: 4.6, reagentLotId: lot.id, acceptLowPct: 80, acceptHighPct: 120 });
  assert.equal(pass.body.outcome, 'pass');
  assert.equal(Math.round(pass.body.recoveryPct), 92);
  const high = await call('POST', '/api/lab/qc-controls', { analyteGroup: 'don', measuredValue: 13, expectedValue: 10, acceptLowPct: 80, acceptHighPct: 120 });
  assert.equal(high.body.outcome, 'fail'); // depășire superioară a intervalului bilateral
  const low = await call('POST', '/api/lab/qc-controls', { analyteGroup: 'zea', measuredValue: 5, expectedValue: 10, acceptLowPct: 80, acceptHighPct: 120 });
  assert.equal(low.body.outcome, 'fail'); // sub limita inferioară
  const st = (await call('GET', '/api/lab/qc-status')).body.groups;
  assert.equal(st.find(g => g.analyteGroup === 'ota').state, 'ok');
  assert.equal(st.find(g => g.analyteGroup === 'don').state, 'failed');
  assert.equal(st.find(g => g.analyteGroup === 'm1').state, 'none');
  db.prepare(`INSERT INTO qc_controls (analyte_group, measured_value, expected_value, accept_low_pct, accept_high_pct, recovery_pct, outcome, created_at)
    VALUES ('m1', 1, 1, 80, 120, 100, 'pass', datetime('now','localtime','-30 days'))`).run();
  const st2 = (await call('GET', '/api/lab/qc-status')).body.groups;
  assert.equal(st2.find(g => g.analyteGroup === 'm1').state, 'stale'); // control mai vechi decât intervalul setat
  assert.throws(() => db.prepare(`UPDATE qc_controls SET outcome = 'pass'`).run(), /append-only/);
});

test('L10: retragere și înlocuire — motiv obligatoriu, o singură schimbare, vizibile pe pagina publică, instantaneu neschimbat', async () => {
  const id = await newSample();
  const no = await issue(id);
  const hashBefore = db.prepare('SELECT snapshot_hash FROM bulletin_snapshots WHERE sample_id = ?').get(id).snapshot_hash;
  as('validator');
  assert.equal((await call('POST', `/api/lab/bulletins/${id}/withdraw`, {})).status, 400);
  as('operator');
  assert.equal((await call('POST', `/api/lab/bulletins/${id}/withdraw`, { reason: 'x' })).status, 403);
  as('validator');
  assert.equal((await call('POST', `/api/lab/bulletins/${id}/withdraw`, { reason: 'eroare de transcriere [test]' })).status, 200);
  assert.equal((await call('POST', `/api/lab/bulletins/${id}/withdraw`, { reason: 'încă o dată' })).status, 409);
  const pub = await call('GET', `/api/results/public/verify/${no}`);
  assert.equal(pub.body.bulletin.lifecycle.state, 'withdrawn');
  assert.equal(db.prepare('SELECT snapshot_hash FROM bulletin_snapshots WHERE sample_id = ?').get(id).snapshot_hash, hashBefore);
  assert.throws(() => db.prepare('UPDATE bulletin_status_events SET reason = ?').run('x'), /append-only/);
  assert.throws(() => db.prepare('DELETE FROM bulletin_status_events').run(), /append-only/);
  // înlocuire
  const id1 = await newSample(); await issue(id1);
  const id2 = await newSample(); const no2 = await issue(id2);
  as('validator');
  assert.equal((await call('POST', `/api/lab/bulletins/${id1}/supersede`, { reason: 'corecție' })).status, 400);
  assert.equal((await call('POST', `/api/lab/bulletins/${id1}/supersede`, { reason: 'corecție', replacedBySampleId: id1 })).status, 400);
  const unissued = await newSample(); as('validator');
  assert.equal((await call('POST', `/api/lab/bulletins/${id1}/supersede`, { reason: 'corecție', replacedBySampleId: unissued })).status, 400);
  assert.equal((await call('POST', `/api/lab/bulletins/${id1}/supersede`, { reason: 'corecție [test]', replacedBySampleId: id2 })).status, 200);
  const no1 = db.prepare('SELECT bulletin_no FROM results WHERE sample_id = ?').get(id1).bulletin_no;
  const p1 = await call('GET', `/api/results/public/verify/${no1}`);
  assert.equal(p1.body.bulletin.lifecycle.state, 'superseded');
  assert.equal(p1.body.bulletin.lifecycle.replacedByBulletinNo, no2);
  assert.ok(db.prepare(`SELECT 1 FROM audit_log WHERE action = 'bulletin_superseded' AND sample_id = ?`).get(id1));
});

test('L16: starea la recepție se înregistrează; recepția fără descriere apare explicit ca neînregistrată', async () => {
  const id = await newSample();
  as('operator');
  let r = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, intakeCondition: { packaging: 'rupt' } });
  assert.equal(r.status, 400);
  r = await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, intakeCondition: { packaging: 'damaged', quantityAdequate: true, temperatureC: 4, transport: 'curier', notes: 'colț rupt' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = db.prepare('SELECT intake_condition_json, intake_checked_by FROM results WHERE sample_id = ?').get(id);
  assert.equal(JSON.parse(row.intake_condition_json).packaging, 'damaged');
  assert.equal(row.intake_checked_by, ids.operator);
  const id2 = await newSample(); as('operator');
  assert.equal((await call('PUT', `/api/results/${id2}`, { ota: 1.2, ...base_ })).status, 200);
  assert.equal(JSON.parse(db.prepare('SELECT intake_condition_json FROM results WHERE sample_id = ?').get(id2).intake_condition_json).packaging, 'not_recorded');
});

test('L20: valoarea introdusă greșit se retrage doar cu motiv, trasabil în versiuni și jurnal', async () => {
  const id = await newSample({ requestedTests: ['ota', 'zea'] });
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, zea: 30, ...base_, qcStatus: 'pending' })).status, 200);
  assert.equal((await call('PUT', `/api/results/${id}`, { clearFields: ['zea'] })).status, 400);
  assert.equal((await call('PUT', `/api/results/${id}`, { clearFields: ['zea'], zea: 5, clearReason: 'r' })).status, 400);
  assert.equal((await call('PUT', `/api/results/${id}`, { clearFields: ['fum'], clearReason: 'r' })).status, 400); // nu există valoare
  assert.equal((await call('PUT', `/api/results/${id}`, { clearFields: ['nume'], clearReason: 'r' })).status, 400);
  const ok = await call('PUT', `/api/results/${id}`, { clearFields: ['zea'], clearReason: 'valoare introdusă pe proba greșită [test]' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(db.prepare('SELECT zea FROM results WHERE sample_id = ?').get(id).zea, null);
  const audit = db.prepare(`SELECT details FROM audit_log WHERE sample_id = ? AND details LIKE '%clearedValues%'`).get(id);
  assert.ok(audit && JSON.parse(audit.details).clearedValues.previous.zea === 30);
});

test('L22: baza de raportare și substanța uscată — validare și stocare', async () => {
  const id = await newSample();
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, reportingBasis: 'umed' })).status, 400);
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, reportingBasis: 'dry_matter', dryMatterPct: 120 })).status, 400);
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, reportingBasis: 'dry_matter', dryMatterPct: 88.5 })).status, 200);
  const r = db.prepare('SELECT reporting_basis, dry_matter_pct FROM results WHERE sample_id = ?').get(id);
  assert.equal(r.reporting_basis, 'dry_matter'); assert.equal(r.dry_matter_pct, 88.5);
});

test('L15: date de prelevare declarate de beneficiar și date ale probei de laborator', async () => {
  as('owner');
  const bad = await call('POST', '/api/samples', { productName: 'x', sampleDate: today(), samplingAttested: true, lotSizeKg: -3 });
  assert.equal(bad.status, 400);
  const id = await newSample({ lotSizeKg: 25000, incrementsCount: 100, samplingMethod: 'plan de prelevare declarat [test]' });
  const s = db.prepare('SELECT lot_size_kg, increments_count, sampling_method FROM samples WHERE id = ?').get(id);
  assert.deepEqual([s.lot_size_kg, s.increments_count], [25000, 100]);
  as('operator');
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, labSampleMassG: 0 })).status, 400);
  assert.equal((await call('PUT', `/api/results/${id}`, { ota: 1.2, ...base_, replicates: 0 })).status, 400);
  const no = await issue(id, { labSampleMassG: 50, homogenization: 'măcinare + omogenizare', replicates: 2 });
  const snap = JSON.parse(db.prepare('SELECT snapshot_json FROM bulletin_snapshots WHERE sample_id = ?').get(id).snapshot_json);
  assert.equal(snap.samplingDeclared.lotSizeKg, 25000);
  assert.equal(snap.labSample.replicates, 2);
  assert.ok(no);
});

test('L12: export dosar — suma de control corespunde conținutului, jurnalizat, fără alte probe; retenție calculată', async () => {
  as('admin');
  assert.equal((await call('PUT', '/api/admin/policy', { retentionYears: 0 })).status, 400);
  assert.equal((await call('PUT', '/api/admin/policy', { retentionYears: 10 })).status, 200);
  const id = await newSample(); await issue(id);
  const other = await newSample();
  as('validator');
  const res = await fetch(base + `/api/lab/dossier/${id}`);
  const txt = await res.text(); if (res.status !== 200) assert.fail(txt.slice(0, 600));
  const doc = JSON.parse(txt);
  assert.equal(res.status, 200);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(doc.content)).digest('hex'), doc.contentSha256);
  assert.equal(doc.content.sample.id, id);
  assert.ok(doc.content.bulletin.snapshotHash);
  assert.equal(doc.content.retention.years, 10);
  assert.ok(doc.content.retention.retainUntil.startsWith(String(new Date().getFullYear() + 10)));
  assert.ok(!JSON.stringify(doc).includes(`"sample_id":${other}`));
  assert.ok(db.prepare(`SELECT 1 FROM audit_log WHERE action = 'dossier_exported' AND sample_id = ?`).get(id));
  as('owner');
  assert.equal((await fetch(base + `/api/lab/dossier/${id}`)).status, 403);
});

test('L19: convenția marcajelor temporale este înregistrată; atestarea prelevării folosește ora locală, nu ISO UTC', async () => {
  assert.equal(db.prepare(`SELECT value FROM app_meta WHERE key = 'timestamp_convention'`).get().value, 'local-server-time');
  assert.ok(db.prepare(`SELECT value FROM app_meta WHERE key = 'server_timezone'`).get().value);
  const id = await newSample();
  const a = db.prepare(`SELECT details FROM audit_log WHERE sample_id = ? AND action = 'sampling_attested'`).get(id);
  assert.match(JSON.parse(a.details).attestedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});
