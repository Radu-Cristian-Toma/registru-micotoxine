// Lot cu mai multe probe de laborator (Etapa D1). Decizia de lot folosește judgeLot() din
// nucleul de decizie, pe valorile efective ale probelor (corectate pentru recuperare dacă s-a cerut),
// cu limita, regula și incertitudinea probelor; dacă probele diferă în aceste privințe, sau lipsește
// o valoare, nu se emite verdict pentru analitul respectiv și se raportează motivul.
const db = require('./database');
const Core = require('../public/decision-core');
const { measuredFor, parsePerformance, decisionRuleOf } = require('./evaluation');

const KEYS = [
  ['afb1', 'limit_afb1'], ['aflaSum', 'limit_afla_sum'], ['ota', 'limit_ota'], ['m1', 'limit_m1'],
  ['don', 'limit_don'], ['zea', 'limit_zea'], ['fum', 'limit_fum']
];
const SEVERITY = { non_conform: 3, within_uncertainty: 2, conform: 1 };

function lotMembers(lotId) {
  return db.prepare(`
    SELECT r.*, s.id AS sampleId, s.code, s.owner_id AS ownerId, s.product_name AS productName, s.status AS sampleStatus
    FROM samples s LEFT JOIN results r ON r.sample_id = s.id
    WHERE s.lot_id = ? ORDER BY s.id`).all(lotId);
}

function evaluateLot(lotId) {
  const lot = db.prepare('SELECT id, code, product_name AS productName, lot_mode AS lotMode, note, created_by AS createdBy, created_at AS createdAt FROM sample_lots WHERE id = ?').get(lotId);
  if (!lot) return null;
  const members = lotMembers(lotId);
  const analytes = {};
  for (const [key, limitCol] of KEYS) {
    const withLimit = members.filter(m => m[limitCol] !== null && m[limitCol] !== undefined);
    if (!withLimit.length) continue;
    const issues = [];
    const limits = [...new Set(withLimit.map(m => m[limitCol]))];
    if (limits.length > 1) issues.push('limits_differ');
    if (withLimit.length < members.length) issues.push('limit_missing_for_some_samples');
    const group = Core.ANALYTE_GROUP[key];
    const per = withLimit.map(m => {
      const perf = parsePerformance(m);
      const rule = decisionRuleOf(m);
      const measured = measuredFor(m, key);
      const a = Core.assess(key, measured, m[limitCol], rule, perf);
      return { sampleId: m.sampleId, code: m.code, measured, effective: a.effective, corrected: a.corrected, rule, uRelPct: a.uRelPct, limit: m[limitCol] };
    });
    if (new Set(per.map(x => x.rule)).size > 1) issues.push('rules_differ');
    if (new Set(per.map(x => x.uRelPct)).size > 1) issues.push('uncertainty_differs');
    if (per.some(x => x.effective === null || x.effective === undefined)) issues.push('incomplete');
    let verdict = null;
    if (!issues.length) verdict = Core.judgeLot(per.map(x => x.effective), limits[0], per[0].rule, per[0].uRelPct, lot.lotMode);
    analytes[key] = { group, limit: limits[0], limits, rule: per[0].rule, uRelPct: per[0].uRelPct, values: per, issues, verdict };
  }
  const verdicts = Object.values(analytes).map(a => a.verdict);
  const anyIssue = Object.values(analytes).some(a => a.issues.length);
  let overall = null;
  if (verdicts.includes('non_conform')) overall = 'non_conform';
  else if (!anyIssue && verdicts.length) overall = verdicts.includes('within_uncertainty') ? 'within_uncertainty' : 'conform';
  else if (verdicts.includes('within_uncertainty') && !anyIssue) overall = 'within_uncertainty';
  const final = members.length > 0 && members.every(m => m.validation_status === 'validated');
  const frozen = members.some(m => m.validation_status === 'validated');
  return {
    lot, final, frozen,
    members: members.map(m => ({ sampleId: m.sampleId, code: m.code, ownerId: m.ownerId, validationStatus: m.validation_status || null, bulletinNo: m.bulletin_no || null })),
    analytes, overall
  };
}

module.exports = { evaluateLot, lotMembers, KEYS, SEVERITY };
