// Etapa C3/C4: registru de echipamente și loturi (L14), controale QC cu interval
// de acceptare (L13), starea buletinelor emise (L10) și exportul dosarului probei (L12).
const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { logEvent } = require('../db/audit');
const { nowLocal } = require('../db/clock');
const { bulletinLifecycle } = require('../db/bulletin-state');
const { requireRole, requireSampleAccess } = require('../middleware/auth');

const router = express.Router();
const STAFF = ['operator', 'validator', 'admin'];
const GROUPS = ['aflatoxins', 'ota', 'm1', 'don', 'zea', 'fum'];
const LOT_KINDS = ['reagent', 'reference_material', 'standard', 'kit'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const text = (v, n) => { const t = String(v === undefined || v === null ? '' : v).trim().slice(0, n); return t || null; };
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const validDate = (v) => v === null || (ISO_DATE.test(v) && !Number.isNaN(Date.parse(v)));
const today = () => new Date().toLocaleDateString('en-CA');

// Starea calibrării față de data curentă (date comparate ca text ISO AAAA-LL-ZZ).
function calibrationState(due) {
  if (!due) return 'unknown';
  const t = today();
  if (due < t) return 'expired';
  const soon = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
  return due <= soon ? 'due_soon' : 'ok';
}
function expiryState(exp) {
  if (!exp) return 'unknown';
  const t = today();
  if (exp < t) return 'expired';
  const soon = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA');
  return exp <= soon ? 'due_soon' : 'ok';
}

// --- Echipamente ---------------------------------------------------------
const EQ_SELECT = `SELECT id, code, name, equipment_type AS type, serial_no AS serialNo, location, calibration_date AS calibrationDate,
  calibration_due AS calibrationDue, calibration_ref AS calibrationRef, status, notes, created_at AS createdAt FROM equipment`;

router.get('/equipment', requireRole(...STAFF), (req, res) => {
  const rows = db.prepare(`${EQ_SELECT} ORDER BY status, code`).all().map(r => ({ ...r, calibrationState: calibrationState(r.calibrationDue) }));
  res.json({ equipment: rows });
});

function parseEquipment(body, partial) {
  const o = {};
  const f = (k, v) => { if (!partial || body[k] !== undefined) o[k] = v; };
  f('code', text(body.code, 40)); f('name', text(body.name, 200)); f('type', text(body.type, 100));
  f('serialNo', text(body.serialNo, 100)); f('location', text(body.location, 100));
  f('calibrationDate', text(body.calibrationDate, 10)); f('calibrationDue', text(body.calibrationDue, 10));
  f('calibrationRef', text(body.calibrationRef, 200)); f('notes', text(body.notes, 500));
  if (!partial && (!o.code || !o.name)) return { error: 'Codul și denumirea echipamentului sunt obligatorii.' };
  for (const k of ['calibrationDate', 'calibrationDue']) {
    if (o[k] !== undefined && !validDate(o[k])) return { error: 'Datele calibrării se introduc în formatul AAAA-LL-ZZ.' };
  }
  if (o.calibrationDate && o.calibrationDue && o.calibrationDue < o.calibrationDate) return { error: 'Scadența calibrării nu poate fi anterioară datei calibrării.' };
  return { o };
}

router.post('/equipment', requireRole('operator', 'admin'), (req, res) => {
  const { o, error } = parseEquipment(req.body, false);
  if (error) return res.status(400).json({ error });
  if (db.prepare('SELECT 1 FROM equipment WHERE code = ?').get(o.code)) return res.status(409).json({ error: 'Există deja un echipament cu acest cod.' });
  const info = db.prepare(`INSERT INTO equipment (code, name, equipment_type, serial_no, location, calibration_date, calibration_due, calibration_ref, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.code, o.name, o.type ?? null, o.serialNo ?? null, o.location ?? null, o.calibrationDate ?? null, o.calibrationDue ?? null, o.calibrationRef ?? null, o.notes ?? null, req.session.user.id);
  logEvent(req.session.user.id, 'equipment_created', { id: info.lastInsertRowid, code: o.code });
  res.json({ id: info.lastInsertRowid });
});

router.put('/equipment/:id', requireRole('operator', 'admin'), (req, res) => {
  const cur = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Echipamentul nu există.' });
  const { o, error } = parseEquipment(req.body, true);
  if (error) return res.status(400).json({ error });
  const status = req.body.status === undefined ? cur.status : req.body.status;
  if (!['active', 'retired'].includes(status)) return res.status(400).json({ error: 'Starea trebuie să fie „active” sau „retired”.' });
  if (o.code !== undefined && o.code !== cur.code && db.prepare('SELECT 1 FROM equipment WHERE code = ?').get(o.code)) return res.status(409).json({ error: 'Există deja un echipament cu acest cod.' });
  const map = { code: 'code', name: 'name', type: 'equipment_type', serialNo: 'serial_no', location: 'location', calibrationDate: 'calibration_date', calibrationDue: 'calibration_due', calibrationRef: 'calibration_ref', notes: 'notes' };
  const next = { ...cur, status };
  const changed = {};
  for (const [k, col] of Object.entries(map)) if (o[k] !== undefined) { if ((cur[col] ?? null) !== o[k]) changed[k] = { from: cur[col] ?? null, to: o[k] }; next[col] = o[k]; }
  if (status !== cur.status) changed.status = { from: cur.status, to: status };
  if (!next.code || !next.name) return res.status(400).json({ error: 'Codul și denumirea echipamentului sunt obligatorii.' });
  db.prepare(`UPDATE equipment SET code=?, name=?, equipment_type=?, serial_no=?, location=?, calibration_date=?, calibration_due=?, calibration_ref=?, notes=?, status=? WHERE id=?`)
    .run(next.code, next.name, next.equipment_type, next.serial_no, next.location, next.calibration_date, next.calibration_due, next.calibration_ref, next.notes, next.status, cur.id);
  if (Object.keys(changed).length) logEvent(req.session.user.id, 'equipment_updated', { id: cur.id, code: cur.code, changed });
  res.json({ ok: true });
});

// --- Loturi de reactivi / materiale de referință -----------------------------
const LOT_SELECT = `SELECT id, code, name, kind, lot_no AS lotNo, supplier, expiry_date AS expiryDate, analyte_group AS analyteGroup,
  certified_value AS certifiedValue, certified_u AS certifiedU, unit, status, notes, created_at AS createdAt FROM reagent_lots`;

router.get('/reagent-lots', requireRole(...STAFF), (req, res) => {
  const rows = db.prepare(`${LOT_SELECT} ORDER BY status, code`).all().map(r => ({ ...r, expiryState: expiryState(r.expiryDate) }));
  res.json({ lots: rows });
});

function parseLot(body, partial) {
  const o = {};
  const f = (k, v) => { if (!partial || body[k] !== undefined) o[k] = v; };
  f('code', text(body.code, 40)); f('name', text(body.name, 200)); f('kind', text(body.kind, 30)); f('lotNo', text(body.lotNo, 100));
  f('supplier', text(body.supplier, 200)); f('expiryDate', text(body.expiryDate, 10)); f('analyteGroup', text(body.analyteGroup, 20));
  f('certifiedValue', num(body.certifiedValue)); f('certifiedU', num(body.certifiedU)); f('unit', text(body.unit, 30)); f('notes', text(body.notes, 500));
  if (!partial && (!o.code || !o.name || !o.kind || !o.lotNo)) return { error: 'Codul, denumirea, tipul și numărul lotului sunt obligatorii.' };
  if (o.kind !== undefined && !LOT_KINDS.includes(o.kind)) return { error: 'Tipul trebuie să fie reactiv, material de referință, etalon sau kit.' };
  if (o.analyteGroup && !GROUPS.includes(o.analyteGroup)) return { error: 'Grupul de analiți nu este recunoscut.' };
  if (o.expiryDate !== undefined && !validDate(o.expiryDate)) return { error: 'Data expirării se introduce în formatul AAAA-LL-ZZ.' };
  for (const k of ['certifiedValue', 'certifiedU']) if (o[k] !== undefined && o[k] !== null && (!Number.isFinite(o[k]) || o[k] < 0)) return { error: 'Valoarea certificată și incertitudinea ei trebuie să fie numere nenegative.' };
  return { o };
}

router.post('/reagent-lots', requireRole('operator', 'admin'), (req, res) => {
  const { o, error } = parseLot(req.body, false);
  if (error) return res.status(400).json({ error });
  if (db.prepare('SELECT 1 FROM reagent_lots WHERE code = ?').get(o.code)) return res.status(409).json({ error: 'Există deja un lot cu acest cod.' });
  const info = db.prepare(`INSERT INTO reagent_lots (code, name, kind, lot_no, supplier, expiry_date, analyte_group, certified_value, certified_u, unit, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(o.code, o.name, o.kind, o.lotNo, o.supplier ?? null, o.expiryDate ?? null, o.analyteGroup ?? null, o.certifiedValue ?? null, o.certifiedU ?? null, o.unit ?? null, o.notes ?? null, req.session.user.id);
  logEvent(req.session.user.id, 'reagent_lot_created', { id: info.lastInsertRowid, code: o.code, kind: o.kind });
  res.json({ id: info.lastInsertRowid });
});

router.put('/reagent-lots/:id', requireRole('operator', 'admin'), (req, res) => {
  const cur = db.prepare('SELECT * FROM reagent_lots WHERE id = ?').get(req.params.id);
  if (!cur) return res.status(404).json({ error: 'Lotul nu există.' });
  const { o, error } = parseLot(req.body, true);
  if (error) return res.status(400).json({ error });
  const status = req.body.status === undefined ? cur.status : req.body.status;
  if (!['active', 'retired'].includes(status)) return res.status(400).json({ error: 'Starea trebuie să fie „active” sau „retired”.' });
  if (o.code !== undefined && o.code !== cur.code && db.prepare('SELECT 1 FROM reagent_lots WHERE code = ?').get(o.code)) return res.status(409).json({ error: 'Există deja un lot cu acest cod.' });
  const map = { code: 'code', name: 'name', kind: 'kind', lotNo: 'lot_no', supplier: 'supplier', expiryDate: 'expiry_date', analyteGroup: 'analyte_group', certifiedValue: 'certified_value', certifiedU: 'certified_u', unit: 'unit', notes: 'notes' };
  const next = { ...cur, status }; const changed = {};
  for (const [k, col] of Object.entries(map)) if (o[k] !== undefined) { if ((cur[col] ?? null) !== o[k]) changed[k] = { from: cur[col] ?? null, to: o[k] }; next[col] = o[k]; }
  if (status !== cur.status) changed.status = { from: cur.status, to: status };
  if (!next.code || !next.name || !next.lot_no) return res.status(400).json({ error: 'Codul, denumirea și numărul lotului sunt obligatorii.' });
  db.prepare(`UPDATE reagent_lots SET code=?, name=?, kind=?, lot_no=?, supplier=?, expiry_date=?, analyte_group=?, certified_value=?, certified_u=?, unit=?, notes=?, status=? WHERE id=?`)
    .run(next.code, next.name, next.kind, next.lot_no, next.supplier, next.expiry_date, next.analyte_group, next.certified_value, next.certified_u, next.unit, next.notes, next.status, cur.id);
  if (Object.keys(changed).length) logEvent(req.session.user.id, 'reagent_lot_updated', { id: cur.id, code: cur.code, changed });
  res.json({ ok: true });
});

// --- Controale QC cu interval de acceptare bilateral ----------------------------
// Intervalul de acceptare (în % din valoarea așteptată) îl stabilește laboratorul din
// validarea metodei; aplicația nu propune valori implicite [de completat de laborator].
router.post('/qc-controls', requireRole('operator', 'admin'), (req, res) => {
  const b = req.body || {};
  if (!GROUPS.includes(b.analyteGroup)) return res.status(400).json({ error: 'Grupul de analiți nu este recunoscut.' });
  const measured = num(b.measuredValue); const lotId = num(b.reagentLotId);
  let expected = num(b.expectedValue);
  const low = num(b.acceptLowPct); const high = num(b.acceptHighPct);
  let lot = null;
  if (lotId !== null) {
    lot = db.prepare('SELECT * FROM reagent_lots WHERE id = ?').get(lotId);
    if (!lot) return res.status(400).json({ error: 'Lotul de material de referință nu există în registru.' });
    if (expected === null && lot.certified_value !== null) expected = lot.certified_value;
  }
  if (measured === null || !Number.isFinite(measured) || measured < 0) return res.status(400).json({ error: 'Valoarea măsurată trebuie să fie un număr nenegativ.' });
  if (expected === null || !Number.isFinite(expected) || expected <= 0) return res.status(400).json({ error: 'Valoarea așteptată trebuie să fie un număr pozitiv (sau se preia din valoarea certificată a lotului).' });
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high) || low <= 0 || high < low) {
    return res.status(400).json({ error: 'Intervalul de acceptare (procente din valoarea așteptată, limita inferioară și cea superioară) este obligatoriu și îl stabilește laboratorul.' });
  }
  const recovery = measured / expected * 100;
  const outcome = recovery >= low && recovery <= high ? 'pass' : 'fail';
  const info = db.prepare(`INSERT INTO qc_controls (analyte_group, reagent_lot_id, sample_id, measured_value, expected_value, accept_low_pct, accept_high_pct, recovery_pct, outcome, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(b.analyteGroup, lotId, num(b.sampleId), measured, expected, low, high, recovery, outcome, text(b.notes, 300), req.session.user.id);
  logEvent(req.session.user.id, 'qc_control_recorded', { id: info.lastInsertRowid, analyteGroup: b.analyteGroup, recoveryPct: Math.round(recovery * 10) / 10, outcome });
  res.json({ id: info.lastInsertRowid, recoveryPct: recovery, outcome });
});

router.get('/qc-controls', requireRole(...STAFF), (req, res) => {
  const g = req.query.analyteGroup;
  if (g && !GROUPS.includes(g)) return res.status(400).json({ error: 'Grupul de analiți nu este recunoscut.' });
  const rows = db.prepare(`SELECT q.id, q.analyte_group AS analyteGroup, q.reagent_lot_id AS reagentLotId, l.code AS lotCode, q.measured_value AS measuredValue,
      q.expected_value AS expectedValue, q.accept_low_pct AS acceptLowPct, q.accept_high_pct AS acceptHighPct, q.recovery_pct AS recoveryPct,
      q.outcome, q.notes, q.created_at AS createdAt, u.full_name AS byName
    FROM qc_controls q LEFT JOIN reagent_lots l ON l.id = q.reagent_lot_id LEFT JOIN users u ON u.id = q.created_by
    ${g ? 'WHERE q.analyte_group = ?' : ''} ORDER BY q.id DESC LIMIT 200`).all(...(g ? [g] : []));
  res.json({ controls: rows });
});

// Starea controalelor pe grup: ultimul control, vechimea și dacă depășește intervalul setat.
router.get('/qc-status', requireRole(...STAFF), (req, res) => {
  const maxAge = (db.prepare('SELECT qc_max_age_days FROM lab_settings WHERE id = 1').get() || {}).qc_max_age_days ?? 7;
  const last = db.prepare(`SELECT outcome, recovery_pct AS recoveryPct, created_at AS createdAt,
      CAST(julianday('now','localtime') - julianday(created_at) AS INTEGER) AS ageDays
    FROM qc_controls WHERE analyte_group = ? ORDER BY id DESC LIMIT 1`);
  const groups = GROUPS.map(g => {
    const l = last.get(g);
    let state = 'none';
    if (l) state = l.outcome === 'fail' ? 'failed' : (maxAge > 0 && l.ageDays > maxAge ? 'stale' : 'ok');
    return { analyteGroup: g, state, last: l || null };
  });
  res.json({ maxAgeDays: maxAge, groups });
});

// --- Starea buletinelor emise (L10) -----------------------------------------------
// Buletinul inițial și instantaneul lui nu se modifică; starea „retras” / „înlocuit” se
// adaugă ca eveniment append-only și apare pe buletin și pe pagina publică de verificare.
function lifecycleChange(status) {
  return (req, res) => {
    const sampleId = Number(req.params.sampleId);
    const row = db.prepare('SELECT bulletin_no, validation_status FROM results WHERE sample_id = ?').get(sampleId);
    if (!row || !row.bulletin_no) return res.status(400).json({ error: 'Proba nu are un buletin emis.' });
    if (bulletinLifecycle(sampleId).state !== 'valid') return res.status(409).json({ error: 'Starea buletinului a fost deja schimbată; schimbarea nu se mai poate modifica.' });
    const reason = text(req.body.reason, 500);
    if (!reason) return res.status(400).json({ error: 'Motivul este obligatoriu și rămâne în jurnalul de audit.' });
    let replacedBy = null;
    if (status === 'superseded') {
      replacedBy = num(req.body.replacedBySampleId);
      if (replacedBy === null || replacedBy === sampleId) return res.status(400).json({ error: 'Buletinul înlocuitor trebuie indicat printr-o altă probă.' });
      const rep = db.prepare('SELECT bulletin_no FROM results WHERE sample_id = ?').get(replacedBy);
      if (!rep || !rep.bulletin_no) return res.status(400).json({ error: 'Proba înlocuitoare nu are buletin emis.' });
    }
    db.prepare('INSERT INTO bulletin_status_events (sample_id, bulletin_no, status, reason, replaced_by_sample_id, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(sampleId, row.bulletin_no, status, reason, replacedBy, req.session.user.id);
    logEvent(req.session.user.id, status === 'withdrawn' ? 'bulletin_withdrawn' : 'bulletin_superseded', { bulletinNo: row.bulletin_no, reason, replacedBySampleId: replacedBy }, sampleId);
    res.json({ ok: true, lifecycle: bulletinLifecycle(sampleId) });
  };
}
router.post('/bulletins/:sampleId/withdraw', requireRole('validator', 'admin'), requireSampleAccess('sampleId'), lifecycleChange('withdrawn'));
router.post('/bulletins/:sampleId/supersede', requireRole('validator', 'admin'), requireSampleAccess('sampleId'), lifecycleChange('superseded'));

// --- Export dosar probă (L12) --------------------------------------------------------
// Un singur fișier JSON cu tot ce se păstrează despre proba și buletinul ei, cu sumă de
// control SHA-256 pe conținut. Nu include date ale altor probe.
router.get('/dossier/:sampleId', requireRole(...STAFF), requireSampleAccess('sampleId'), (req, res) => {
  const id = Number(req.params.sampleId);
  const sample = db.prepare('SELECT s.*, u.company_name AS ownerCompany FROM samples s LEFT JOIN users u ON u.id = s.owner_id WHERE s.id = ?').get(id);
  if (!sample) return res.status(404).json({ error: 'Proba nu există.' });
  const result = db.prepare('SELECT * FROM results WHERE sample_id = ?').get(id) || null;
  const versions = db.prepare('SELECT version_no AS versionNo, change_reason AS reason, changed_by AS changedBy, snapshot_json AS snapshotJson, snapshot_hash AS snapshotHash, created_at AS createdAt FROM result_versions WHERE sample_id = ? ORDER BY version_no').all(id);
  const audit = db.prepare('SELECT id, user_id AS userId, action, details, created_at AS createdAt FROM audit_log WHERE sample_id = ? ORDER BY id').all(id);
  const snap = db.prepare('SELECT bulletin_no AS bulletinNo, snapshot_json AS snapshotJson, snapshot_hash AS snapshotHash, issued_by AS issuedBy, issued_at AS issuedAt FROM bulletin_snapshots WHERE sample_id = ?').get(id) || null;
  const nonconf = db.prepare('SELECT * FROM nonconforming_work WHERE sample_id = ?').all(id);
  const retYears = (db.prepare('SELECT retention_years FROM lab_settings WHERE id = 1').get() || {}).retention_years ?? null;
  const issued = result && result.bulletin_issued_at ? String(result.bulletin_issued_at).slice(0, 10) : null;
  let retainUntil = null;
  if (retYears && issued) { const y = Number(issued.slice(0, 4)) + retYears; retainUntil = `${y}${issued.slice(4)}`; }
  const strip = (r) => { if (!r) return r; const { logo_data_url, signature_data_url, stamp_data_url, ...rest } = r; return rest; };
  const content = {
    schema: 1, exportedAt: nowLocal(), sample: strip(sample), result, versions, audit,
    bulletin: snap ? { ...snap, lifecycle: bulletinLifecycle(id) } : null, nonconformingWork: nonconf,
    retention: { years: retYears, retainUntil, note: 'Perioada de retenție o stabilește laboratorul [de completat în setări].' }
  };
  const body = JSON.stringify(content);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  logEvent(req.session.user.id, 'dossier_exported', { sha256 }, id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dosar-${sample.code}.json"`);
  res.send(JSON.stringify({ contentSha256: sha256, content }));
});

module.exports = router;
