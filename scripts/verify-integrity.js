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

const argv = process.argv.slice(2);
const digestIdx = argv.indexOf('--digest');
const DIGEST_PATH = digestIdx >= 0 ? argv[digestIdx + 1] : null;
const positional = argv.filter((a, i) => !(i === digestIdx || i === digestIdx + 1));
const DB_PATH = positional[0] || process.env.LIMS_DB_PATH || path.join(__dirname, '..', 'lims.db');

const sha256 = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');

// Verificarea lantului de amprente (Etapa D). Recalculeaza in JS aceeasi formula ca declansatoarele:
// sha256(prev_hash + '|' + json_array(campuri ale randului)). `label` prefixeaza tipul discrepantei.
function verifyChain(db, { logTable, chainTable, columns, label }) {
  const problems = []; const warnings = [];
  const logRows = db.prepare(`SELECT * FROM ${logTable} ORDER BY id`).all();
  const chainRows = db.prepare(`SELECT id, prev_hash, row_hash FROM ${chainTable} ORDER BY id`).all();
  const byId = new Map(logRows.map(r => [r.id, r]));
  let prev = 'GENESIS';
  for (const c of chainRows) {
    const row = byId.get(c.id);
    if (!row) { problems.push({ type: `${label}_chain_orphan`, id: c.id }); prev = c.row_hash; continue; }
    if (c.prev_hash !== prev) problems.push({ type: `${label}_chain_prev_mismatch`, id: c.id });
    const expected = sha256(c.prev_hash + '|' + JSON.stringify(columns.map(col => (row[col] === undefined ? null : row[col]))));
    if (expected !== c.row_hash) problems.push({ type: `${label}_chain_hash_mismatch`, id: c.id });
    prev = c.row_hash;
  }
  const firstChainId = chainRows.length ? chainRows[0].id : null;
  const chained = new Set(chainRows.map(c => c.id));
  let legacy = 0;
  for (const r of logRows) {
    if (firstChainId === null || r.id < firstChainId) legacy += 1;
    else if (!chained.has(r.id)) problems.push({ type: `${label}_chain_missing`, id: r.id });
  }
  if (legacy) warnings.push({ type: firstChainId === null ? `${label}_chain_not_started` : `${label}_chain_legacy_rows`, count: legacy });
  const last = chainRows.length ? chainRows[chainRows.length - 1] : null;
  return { checked: chainRows.length, problems, warnings, head: last ? { lastId: last.id, headHash: last.row_hash, count: chainRows.length } : { lastId: null, headHash: 'GENESIS', count: 0 } };
}

const AUDIT_CHAIN = { logTable: 'audit_log', chainTable: 'audit_chain', columns: ['id', 'sample_id', 'user_id', 'action', 'details', 'created_at'], label: 'audit' };
const VERSIONS_CHAIN = { logTable: 'result_versions', chainTable: 'result_versions_chain', columns: ['id', 'sample_id', 'version_no', 'snapshot_hash', 'change_reason', 'changed_by', 'created_at'], label: 'versions' };

// Amprenta ansamblului de instantanee de buletin (ordonate dupa id), pentru rezumatul periodic.
function snapshotsSetHash(db, count) {
  const rows = db.prepare('SELECT snapshot_hash FROM bulletin_snapshots ORDER BY id LIMIT ?').all(count);
  return { count: rows.length, setHash: sha256(rows.map(r => r.snapshot_hash).join('\n')) };
}

// Confrunta baza curenta cu un rezumat exportat anterior (scripts/export-digest.js).
function verifyDigest(db, digest, heads) {
  const problems = [];
  if (!digest || digest.schema !== 1 || !digest.audit || !digest.versions || !digest.snapshots) return [{ type: 'digest_file_invalid' }];
  const { digestSha256, ...content } = digest;
  if (sha256(JSON.stringify(content)) !== digestSha256) problems.push({ type: 'digest_file_corrupt' });
  for (const [key, chainTable, label] of [['audit', 'audit_chain', 'audit'], ['versions', 'result_versions_chain', 'versions']]) {
    const d = digest[key];
    if (d.lastId === null) continue;
    const row = db.prepare(`SELECT row_hash FROM ${chainTable} WHERE id = ?`).get(d.lastId);
    if (!row) problems.push({ type: `digest_${label}_missing`, lastId: d.lastId });
    else if (row.row_hash !== d.headHash) problems.push({ type: `digest_${label}_mismatch`, lastId: d.lastId });
    if (heads[key].count < d.count) problems.push({ type: `digest_${label}_count_decreased`, exported: d.count, current: heads[key].count });
  }
  const cur = snapshotsSetHash(db, digest.snapshots.count);
  if (cur.count < digest.snapshots.count) problems.push({ type: 'digest_snapshots_missing', exported: digest.snapshots.count, current: cur.count });
  else if (cur.setHash !== digest.snapshots.setHash) problems.push({ type: 'digest_snapshots_mismatch' });
  return problems;
}

function verify(db, options = {}) {
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
  // Etapa D: lanturile de amprente (audit_log, result_versions) si, optional, rezumatul exportat.
  const auditChain = verifyChain(db, AUDIT_CHAIN);
  const versionsChain = verifyChain(db, VERSIONS_CHAIN);
  problems.push(...auditChain.problems, ...versionsChain.problems);
  warnings.push(...auditChain.warnings, ...versionsChain.warnings);
  for (const t of ['audit_chain_no_update', 'audit_chain_no_delete', 'result_versions_chain_no_update', 'result_versions_chain_no_delete', 'audit_log_chain', 'result_versions_chain_ins']) {
    if (!triggers.includes(t)) problems.push({ type: 'trigger_missing', name: t });
  }
  const heads = { audit: auditChain.head, versions: versionsChain.head };
  if (options.digest) problems.push(...verifyDigest(db, options.digest, heads));
  return { versionsChecked: rows.length, snapshotsChecked, auditChainChecked: auditChain.checked, versionsChainChecked: versionsChain.checked, heads, problems, warnings };
}

if (require.main === module) {
  try {
    const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    let digest = null;
    if (DIGEST_PATH) digest = JSON.parse(require('fs').readFileSync(DIGEST_PATH, 'utf8'));
    const { versionsChecked, snapshotsChecked, auditChainChecked, versionsChainChecked, problems, warnings } = verify(db, { digest });
    console.log(`Versiuni verificate: ${versionsChecked}. Instantanee verificate: ${snapshotsChecked}. Lanț audit: ${auditChainChecked}. Lanț versiuni: ${versionsChainChecked}.${digest ? ' Rezumat confruntat: ' + DIGEST_PATH + '.' : ''} Discrepanțe: ${problems.length}. Avertismente: ${warnings.length}.`);
    for (const p of problems) console.log(JSON.stringify(p));
    for (const w of warnings) console.log('AVERTISMENT ' + JSON.stringify(w));
    db.close();
    process.exit(problems.length ? 1 : 0);
  } catch (e) {
    console.error('Eroare la verificare:', e.message);
    process.exit(2);
  }
}

module.exports = { verify, verifyChain, verifyDigest, snapshotsSetHash, AUDIT_CHAIN, VERSIONS_CHAIN, sha256 };
