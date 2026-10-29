// Export structurat al rezultatului (JSON): comparator „<” sub LOQ, incertitudine extinsă
// cu factor de acoperire 2, vocabular fix al deciziei. Date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildResultExport, SCHEMA } = require('../../db/result-export');
const { decisionDetail } = require('../../db/evaluation');

function snapshotFor(result) {
  return {
    schema: 1, bulletinNo: 'BUL-2026-00001', issuedAt: '2026-10-29 10:15:00',
    sample: { code: 'MYC-2026-0001', productName: 'făină de grâu', category: 'cereale' },
    results: { afb1: result.afb1, afb2: result.afb2, afg1: result.afg1, afg2: result.afg2, ota: result.ota, m1: null, don: result.don, zea: null, fum: null },
    analysis: { date: '2026-10-28', method: 'metodă de test', equipment: 'echipament de test', qcStatus: 'accepted' },
    decision: decisionDetail(result), reportingBasis: 'as_is', dryMatterPct: null,
    limitProvenance: { profileId: 'test' }
  };
}
const base = {
  afb1: 0.3, afb2: 0.04, afg1: 0.04, afg2: 0.04, ota: 6, don: 700,
  limit_afb1: 2, limit_afla_sum: 4, limit_ota: 5, limit_don: 750, decision_rule: 'reg_2782_u',
  method_performance: {
    aflatoxins: { loq: 0.05, recoveryPct: 80, corrected: true, uRelPct: 30 },
    ota: { loq: 0.5, recoveryPct: 100, uRelPct: 40 }, don: { loq: 20, uRelPct: 30 }
  }
};

test('structura de bază: schemă, buletin, probă și măsurători', () => {
  const out = buildResultExport(snapshotFor(base), { snapshotSha256: 'a'.repeat(64), integrity: 'ok', lifecycle: { state: 'valid' } });
  assert.equal(out.schema, SCHEMA);
  assert.equal(out.bulletin.number, 'BUL-2026-00001');
  assert.equal(out.bulletin.issuedAt, '2026-10-29T10:15:00');
  assert.equal(out.bulletin.integrity, 'ok');
  assert.equal(out.sample.code, 'MYC-2026-0001');
  assert.equal(out.decisionRule, 'reg_2782_u');
  const keys = out.measurements.map(m => m.key);
  assert.deepEqual(keys, ['afb1', 'afb2', 'afg1', 'afg2', 'aflaSum', 'ota', 'don']);
});

test('valorile sub LOQ au comparatorul „<” cu valoarea LOQ', () => {
  const out = buildResultExport(snapshotFor(base), {});
  const b2 = out.measurements.find(m => m.key === 'afb2');
  assert.deepEqual({ c: b2.value.comparator, v: b2.value.value, loq: b2.loq }, { c: '<', v: 0.05, loq: 0.05 }); // LOQ-ul grupului „aflatoxine”
  const sum = out.measurements.find(m => m.key === 'aflaSum');
  assert.equal(sum.belowLoqCount, 3);
  assert.equal(sum.lowerBound, true);
  const lowAfb1 = buildResultExport(snapshotFor({ ...base, afb1: 0.03 }), {}).measurements.find(m => m.key === 'afb1');
  assert.deepEqual({ c: lowAfb1.value.comparator, v: lowAfb1.value.value }, { c: '<', v: 0.05 });
});

test('incertitudinea extinsă: relativă și absolută la valoarea de decizie, k = 2, 95 %', () => {
  const ota = buildResultExport(snapshotFor(base), {}).measurements.find(m => m.key === 'ota');
  assert.equal(ota.expandedUncertainty.relativePct, 40);
  assert.equal(ota.expandedUncertainty.coverageFactor, 2);
  assert.equal(ota.expandedUncertainty.coverageProbability, 0.95);
  assert.equal(ota.expandedUncertainty.uncertainty, 2.4); // 6 · 40 %
  assert.equal(ota.expandedUncertainty.unit, 'µg/kg');
});

test('decizia folosește vocabularul fix; recuperarea corectată apare în export', () => {
  const out = buildResultExport(snapshotFor(base), {});
  const ota = out.measurements.find(m => m.key === 'ota');
  // 6 > 5, dar 6 − 40 % = 3,6 ≤ 5 → în incertitudine
  assert.equal(ota.decision, 'in_incertitudine');
  const don = out.measurements.find(m => m.key === 'don');
  assert.equal(don.decision, 'conform');
  const afb1 = out.measurements.find(m => m.key === 'afb1');
  assert.deepEqual(afb1.recovery, { pct: 80, corrected: true });
  assert.equal(afb1.decisionValue, 0.375); // 0,3 / 0,8
  const hard = buildResultExport(snapshotFor({ ...base, ota: 20 }), {}).measurements.find(m => m.key === 'ota');
  assert.equal(hard.decision, 'neconform');
});

test('fără incertitudine introdusă, câmpul este null (nu se inventează o valoare)', () => {
  const r = { ...base, method_performance: { ota: { loq: 0.5 } } };
  const ota = buildResultExport(snapshotFor(r), {}).measurements.find(m => m.key === 'ota');
  assert.equal(ota.expandedUncertainty, null);
});
