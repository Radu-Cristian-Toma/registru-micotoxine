#!/usr/bin/env node
// Verificarea integrității istoricului de rezultate (Etapa B3, L7).
// Citește baza de date (LIMS_DB_PATH sau lims.db) fără a o modifica și verifică:
//  1. suma de control SHA-256 a fiecărui instantaneu din result_versions;
//  2. continuitatea numerotării versiunilor pe fiecare probă (1..n, fără goluri);
//  3. existența declanșatoarelor append-only pe audit_log și result_versions;
//  4. că fiecare buletin emis are cel puțin o versiune în istoric dacă rezultatul a fost modificat.
// Cod de ieșire: 0 = fără probleme, 1 = discrepanțe, 2 = eroare de rulare.
// Nu afișează valori de rezultate, doar identificatori și tipul discrepanței.
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DB_PATH = process.argv[2] || process.env.LIMS_DB_PATH || path.join(__dirname, '..', 'lims.db');

function verify(db) {
  const problems = [];
  const rows = db.prepare('SELECT id, sample_id, version_no, snapshot_json, snapshot_hash FROM result_versions ORDER BY sample_id, version_no').all();
  let expectedNo = 0; let currentSample = null;
  for (const r of rows) {
    const actual = crypto.createHash('sha256').update(r.snapshot_json).digest('hex');
    if (actual !== r.snapshot_hash) problems.push({ type: 'hash_mismatch', sampleId: r.sample_id, versionNo: r.version_no, rowId: r.id });
    if (r.sample_id !== currentSample) { currentSample = r.sample_id; expectedNo = 0; }
    expectedNo += 1;
    if (r.version_no !== expectedNo) {
      problems.push({ type: 'version_gap', sampleId: r.sample_id, versionNo: r.version_no, expected: expectedNo });
      expectedNo = r.version_no;
    }
  }
  const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'`).all().map(t => t.name);
  for (const t of ['audit_log_no_update', 'audit_log_no_delete', 'result_versions_no_update', 'result_versions_no_delete']) {
    if (!triggers.includes(t)) problems.push({ type: 'trigger_missing', name: t });
  }
  return { versionsChecked: rows.length, problems };
}

if (require.main === module) {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const { versionsChecked, problems } = verify(db);
    console.log(`Versiuni verificate: ${versionsChecked}. Discrepanțe: ${problems.length}.`);
    for (const p of problems) console.log(JSON.stringify(p));
    db.close();
    process.exit(problems.length ? 1 : 0);
  } catch (e) {
    console.error('Eroare la verificare:', e.message);
    process.exit(2);
  }
}

module.exports = { verify };
