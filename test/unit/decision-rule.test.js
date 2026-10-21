// Etapa B5 (L2-L4): regula de decizie și performanța metodei. Date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { evaluateResult, decisionDetail } = require('../../db/evaluation');

const base = { afb1: 0, afb2: 0, afg1: 0, afg2: 0, ota: 3.2, limit_afb1: 2, limit_afla_sum: 4, limit_ota: 3, qc_status: 'accepted' };

test('implicit (fără regulă): comportament neschimbat — OTA 3.2 > 3 → fail', () => {
  assert.equal(evaluateResult(base), 'fail');
  assert.equal(evaluateResult({ ...base, ota: 3 }), 'ok');
  assert.equal(evaluateResult({ ...base, decision_rule: 'simple', method_performance_json: JSON.stringify({ ota: { uRelPct: 50 } }) }), 'fail');
});

test('regula „simple” ignoră incertitudinea chiar dacă este introdusă', () => {
  const r = { ...base, decision_rule: 'simple', method_performance: { ota: { uRelPct: 30 } } };
  assert.equal(evaluateResult(r), 'fail');
  assert.equal(decisionDetail(r).rows.ota.verdict, 'non_conform');
});

test('reg_2782_u: valoare − U ≤ limită → acceptat, marcat „within_uncertainty”', () => {
  const r = { ...base, decision_rule: 'reg_2782_u', method_performance: { ota: { uRelPct: 20 } } }; // 3.2 − 0.64 = 2.56 ≤ 3
  assert.equal(evaluateResult(r), 'ok');
  assert.equal(decisionDetail(r).rows.ota.verdict, 'within_uncertainty');
});

test('reg_2782_u: valoare − U > limită → respins', () => {
  const r = { ...base, ota: 4, decision_rule: 'reg_2782_u', method_performance_json: JSON.stringify({ ota: { uRelPct: 20 } }) }; // 4 − 0.8 = 3.2 > 3
  assert.equal(evaluateResult(r), 'fail');
  assert.equal(decisionDetail(r).rows.ota.verdict, 'non_conform');
});

test('reg_2782_u fără incertitudine introdusă pentru grup → cade pe comparația simplă (conservator)', () => {
  const r = { ...base, decision_rule: 'reg_2782_u' };
  assert.equal(evaluateResult(r), 'fail');
  assert.equal(decisionDetail(r).rows.ota.uRelPct, null);
});

test('limita exactă rămâne conformă la ambele reguli', () => {
  for (const rule of ['simple', 'reg_2782_u']) {
    assert.equal(evaluateResult({ ...base, ota: 3, decision_rule: rule, method_performance: { ota: { uRelPct: 10 } } }), 'ok');
  }
});

test('suma aflatoxinelor folosește incertitudinea grupului „aflatoxins”', () => {
  const r = { ...base, ota: 1, afb1: 1.5, afb2: 1, afg1: 1, afg2: 1.2, decision_rule: 'reg_2782_u', method_performance: { aflatoxins: { uRelPct: 20 } } }; // suma 4.7; 4.7 − 0.94 = 3.76 ≤ 4; AFB1 1.5 ≤ 2
  assert.equal(evaluateResult(r), 'ok');
  assert.equal(decisionDetail(r).rows.aflaSum.verdict, 'within_uncertainty');
  assert.equal(evaluateResult({ ...r, decision_rule: 'simple' }), 'fail');
});

test('„<LOQ”: valoarea sub LOQ este marcată; fără LOQ nu se marchează nimic', () => {
  const r = { ...base, ota: 0.2, decision_rule: 'simple', method_performance: { ota: { loq: 0.5 } } };
  assert.equal(decisionDetail(r).rows.ota.belowLoq, true);
  assert.equal(decisionDetail({ ...base, ota: 0.2 }).rows.ota.belowLoq, false);
  assert.equal(decisionDetail({ ...r, ota: 0.5 }).rows.ota.belowLoq, false);
});

test('regulă necunoscută → tratată ca „simple”', () => {
  assert.equal(evaluateResult({ ...base, decision_rule: 'altceva', method_performance: { ota: { uRelPct: 50 } } }), 'fail');
});

// ---------- rute ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-b5-'));
process.env.LIMS_DB_PATH = path.join(tmp, 'test.db');
const express = require('express');
const db = require('../../db/database');
let currentUser = null; let server; let baseUrl; const ids = {};
const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.session = { user: currentUser }; next(); });
app.use('/api/samples', require('../../routes/samples'));
app.use('/api/results', require('../../routes/results'));
test.before(async () => {
  for (const role of ['owner', 'operator', 'validator']) ids[role] = db.prepare(`INSERT INTO users (email, password_hash, full_name, role) VALUES (?, 'x', ?, ?)`).run(`${role}@test.invalid`, `Test ${role}`, role).lastInsertRowid;
  await new Promise(r => { server = app.listen(0, '127.0.0.1', r); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => { server.close(); try { db.close(); } catch (_) {} fs.rmSync(tmp, { recursive: true, force: true }); });
const as = (role) => { currentUser = { id: ids[role], role }; };
async function call(method, url, body) {
  const res = await fetch(baseUrl + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const today = () => new Date().toLocaleDateString('en-CA');
async function newSample() {
  as('owner');
  const c = await call('POST', '/api/samples', { productName: 'făină de grâu', sampleDate: today(), samplingAttested: true, requestedTests: ['ota'] });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body.id;
}

test('rută: performanța metodei se validează și se salvează; valori invalide → 400', async () => {
  const id = await newSample(); as('operator');
  for (const bad of [{ ota: { uRelPct: 150 } }, { ota: { recoveryPct: 0 } }, { ota: { loq: -1 } }, { xyz: { loq: 1 } }, [1]]) {
    const r = await call('PUT', `/api/results/${id}`, { ota: 1, methodPerformance: bad });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  const ok = await call('PUT', `/api/results/${id}`, { ota: 1, methodPerformance: { ota: { loq: 0.5, recoveryPct: 95, uRelPct: 20 } } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const row = db.prepare('SELECT decision_rule, method_performance_json FROM results WHERE sample_id = ?').get(id);
  assert.deepEqual(JSON.parse(row.method_performance_json), { ota: { loq: 0.5, recoveryPct: 95, uRelPct: 20 } });
  assert.equal(row.decision_rule, 'simple');
});

test('rută: schimbarea regulii de decizie cere motiv; cu motiv schimbă verdictul și se jurnalizează', async () => {
  const id = await newSample(); as('operator');
  const noReason = await call('PUT', `/api/results/${id}`, { ota: 3.2, decisionRule: 'reg_2782_u', methodPerformance: { ota: { uRelPct: 20 } } });
  assert.equal(noReason.status, 400);
  assert.match(noReason.body.error, /motiv/i);
  const simple = await call('PUT', `/api/results/${id}`, { ota: 3.2, methodPerformance: { ota: { uRelPct: 20 } } });
  assert.equal(simple.status, 200);
  assert.equal(db.prepare('SELECT status FROM samples WHERE id = ?').get(id).status, 'fail');
  const ok = await call('PUT', `/api/results/${id}`, { ota: 3.2, decisionRule: 'reg_2782_u', limitChangeReason: 'Politica laboratorului [exemplu de test]' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(db.prepare('SELECT status FROM samples WHERE id = ?').get(id).status, 'ok');
  const ev = JSON.parse(db.prepare(`SELECT details FROM audit_log WHERE sample_id = ? AND action = 'results_saved' ORDER BY id DESC`).get(id).details);
  assert.deepEqual(ev.decisionRuleChanged, { from: 'simple', to: 'reg_2782_u', reason: 'Politica laboratorului [exemplu de test]' });
  const bad = await call('PUT', `/api/results/${id}`, { ota: 3.2, decisionRule: 'inventata', limitChangeReason: 'x' });
  assert.equal(bad.status, 400);
});

test('rută: instantaneul buletinului păstrează regula și detaliul de decizie', async () => {
  const id = await newSample(); as('operator');
  const put = await call('PUT', `/api/results/${id}`, { ota: 3.2, decisionRule: 'reg_2782_u', limitChangeReason: 'test', methodPerformance: { ota: { loq: 0.5, uRelPct: 20 } },
    analysisDate: today(), method: 'm', equipment: 'e', qcStatus: 'accepted', intakeConfirmed: true });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  as('validator');
  assert.equal((await call('POST', `/api/results/${id}/review`, { decision: 'approved' })).status, 200);
  const v = await call('POST', `/api/results/${id}/validate`, {});
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const snap = JSON.parse(db.prepare('SELECT snapshot_json FROM bulletin_snapshots WHERE sample_id = ?').get(id).snapshot_json);
  assert.equal(snap.decision.rule, 'reg_2782_u');
  assert.equal(snap.decision.rows.ota.verdict, 'within_uncertainty');
  assert.equal(snap.decision.rows.ota.uRelPct, 20);
});
