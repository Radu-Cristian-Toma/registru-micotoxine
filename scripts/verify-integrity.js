#!/usr/bin/env node
// Verificarea integrității istoricului de rezultate (Etapa B3, L7).
// Citește baza de date (LIMS_DB_PATH sau lims.db) fără a o modifica și verifică:
//  1. suma de control SHA-256 a fiecărui instantaneu din result_versions;
//  2. continuitatea numerotării versiunilor pe fiecare probă (1..n, fără goluri);
//  3. existența declanșatoarelor append-only pe audit_log și result_versions;
//  4. suma de control și coerența instantaneelor de buletin (bulletin_snapshots); buletinele
//     emise înainte de introducerea instantaneelor apar ca avertisment, nu ca eroare.
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
  // Instantaneele buletinelor emise: suma de control si coerenta cu rezultatul.
  let snapshotsChecked = 0;
  const warnings = [];
  const snaps = db.prepare('SELECT sample_id, bulletin_no, snapshot_json, snapshot_hash FROM bulletin_snapshots').all();
  for (const b of snaps) {
    snapshotsChecked += 1;
    if (crypto.createHash('sha256').update(b.snapshot_json).digest('hex') !== b.snapshot_hash) {
      problems.push({ type: 'snapshot_hash_mismatch', sampleId: b.sample_id, bulletinNo: b.bulletin_no });
    }
    const r = db.prepare('SELECT bulletin_no FROM results WHERE sample_id = ?').get(b.sample_id);
    if (!r || r.bulletin_no !== b.bulletin_no) problems.push({ type: 'snapshot_bulletin_mismatch', sampleId: b.sample_id, bulletinNo: b.bulletin_no });
  }
  // Buletine emise inainte de introducerea instantaneelor: avertisment, nu eroare.
  for (const r of db.prepare(`SELECT sample_id, bulletin_no FROM results WHERE bulletin_no IS NOT NULL AND validation_status = 'validated'
                              AND sample_id NOT IN (SELECT sample_id FROM bulletin_snapshots)`).all()) {
    warnings.push({ type: 'snapshot_missing', sampleId: r.sample_id, bulletinNo: r.bulletin_no });
  }
  const triggers = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger'`).all().map(t => t.name);
  for (const t of ['audit_log_no_update', 'audit_log_no_delete', 'result_versions_no_update', 'result_versions_no_delete', 'bulletin_snapshots_no_update', 'bulletin_snapshots_no_delete',
    'bulletin_status_events_no_update', 'bulletin_status_events_no_delete', 'qc_controls_no_update', 'qc_controls_no_delete', 'branding_assets_no_update', 'branding_assets_no_delete']) {
    if (!triggers.includes(t)) problems.push({ type: 'trigger_missing', name: t });
  }
  // Etapa C2/C3: imaginile de antet (adresate prin SHA-256), starea buletinelor si fusul orar.
  for (const a of db.prepare('SELECT sha256, data_url FROM branding_assets').all()) {
    if (crypto.createHash('sha256').update(a.data_url).digest('hex') !== a.sha256) problems.push({ type: 'branding_asset_hash_mismatch', sha256: a.sha256 });
  }
  for (const e of db.prepare('SELECT e.sample_id, e.bulletin_no, r.bulletin_no AS actual FROM bulletin_status_events e LEFT JOIN results r ON r.sample_id = e.sample_id').all()) {
    if (e.actual !== e.bulletin_no) problems.push({ type: 'status_event_bulletin_mismatch', sampleId: e.sample_id, bulletinNo: e.bulletin_no });
  }
  const tz = db.prepare(`SELECT value FROM app_meta WHERE key = 'server_timezone'`).get();
  const nowTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && tz.value !== nowTz) warnings.push({ type: 'timezone_changed', recorded: tz.value, current: nowTz });
  return { versionsChecked: rows.length, snapshotsChecked, problems, warnings };
}

if (require.main === module) {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    const { versionsChecked, snapshotsChecked, problems, warnings } = verify(db);
    console.log(`Versiuni verificate: ${versionsChecked}. Instantanee verificate: ${snapshotsChecked}. Discrepanțe: ${problems.length}. Avertismente: ${warnings.length}.`);
    for (const p of problems) console.log(JSON.stringify(p));
    for (const w of warnings) console.log('AVERTISMENT ' + JSON.stringify(w));
    db.close();
    process.exit(problems.length ? 1 : 0);
  } catch (e) {
    console.error('Eroare la verificare:', e.message);
    process.exit(2);
  }
}

module.exports = { verify };
