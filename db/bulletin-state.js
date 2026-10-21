// Starea de ciclu de viata a unui buletin emis (etapa C3, L10): valid / retras / inlocuit.
// Buletinul initial si instantaneul lui raman neschimbate; starea se adauga printr-un
// eveniment append-only (bulletin_status_events).
const db = require('./database');

const stateStmt = db.prepare(`
  SELECT e.status, e.reason, e.created_at AS at, e.replaced_by_sample_id AS replacedBySampleId,
         rs.code AS replacedByCode, rr.bulletin_no AS replacedByBulletinNo, u.full_name AS byName
  FROM bulletin_status_events e
  LEFT JOIN samples rs ON rs.id = e.replaced_by_sample_id
  LEFT JOIN results rr ON rr.sample_id = e.replaced_by_sample_id
  LEFT JOIN users u ON u.id = e.created_by
  WHERE e.sample_id = ?
`);

// { state: 'valid' | 'withdrawn' | 'superseded', reason, at, replacedByBulletinNo, replacedByCode, byName }
function bulletinLifecycle(sampleId) {
  const e = stateStmt.get(sampleId);
  if (!e) return { state: 'valid' };
  return { state: e.status, reason: e.reason, at: e.at, replacedByBulletinNo: e.replacedByBulletinNo || null, replacedByCode: e.replacedByCode || null, byName: e.byName || null };
}

// Adauga campul `bulletinLifecycle` pe fiecare rand care are `id` de proba si numar de buletin.
function attachBulletinLifecycle(rows) {
  for (const r of rows) {
    if (r && r.bulletinNo) r.bulletinLifecycle = bulletinLifecycle(r.id);
  }
  return rows;
}

module.exports = { bulletinLifecycle, attachBulletinLifecycle };
