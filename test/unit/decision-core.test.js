// Etapa C2: nucleul de decizie comun (suma „lower bound”, corecția opțională
// pentru recuperare, regula de decizie). Date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../public/decision-core');
const { evaluateResult, decisionDetail } = require('../../db/evaluation');

test('suma aflatoxinelor: valorile sub LOQ se iau ca zero (lower bound)', () => {
  const v = { afb1: 0.3, afb2: 0.04, afg1: 0.04, afg2: 0.04 };
  const fara = Core.aflatoxinSum(v, {});
  assert.equal(fara.lowerBound, false);
  assert.ok(Math.abs(fara.sum - 0.42) < 1e-9);
  const cu = Core.aflatoxinSum(v, { aflatoxins: { loq: 0.05 } });
  assert.equal(cu.lowerBound, true);
  assert.equal(cu.belowLoq, 3);
  assert.ok(Math.abs(cu.sum - 0.3) < 1e-9);
});

test('suma lipsește dacă vreo aflatoxină nu este introdusă', () => {
  assert.equal(Core.aflatoxinSum({ afb1: 1, afb2: null, afg1: 0, afg2: 0 }, {}), null);
});


test('recuperarea corectează valoarea doar când este bifată', () => {
  const base = { don: 700, limit_don: 750, qc_status: 'accepted' };
  const necor = { ...base, method_performance: { don: { recoveryPct: 80 } } };
  const cor = { ...base, method_performance: { don: { recoveryPct: 80, corrected: true } } };

  assert.notEqual(evaluateResult(necor), 'fail');
  assert.equal(evaluateResult(cor), 'fail'); // 700 / 0,8 = 875 > 750
  const d = decisionDetail(cor).rows.don;
  assert.equal(d.corrected, true);
  assert.ok(Math.abs(d.effective - 875) < 1e-9);
  assert.equal(d.verdict, 'non_conform');
  assert.equal(decisionDetail(necor).rows.don.corrected, false);
});

test('corecția fără recuperare validă nu se aplică', () => {
  const g = Core.groupPerformance({ don: { corrected: true } }, 'don');
  assert.equal(g.corrected, false);
});

test('regula reg_2782_u folosește valoarea efectivă (corectată) minus U', () => {
  const g = { don: { recoveryPct: 80, corrected: true, uRelPct: 30 } };
  // efectivă 875; 875 − 30 % = 612,5 < 750 → în limita incertitudinii
  assert.equal(Core.assess('don', 700, 750, 'reg_2782_u', g).verdict, 'within_uncertainty');
  assert.equal(Core.assess('don', 700, 750, 'simple', g).verdict, 'non_conform');
});

test('suma lower bound intră în verdictul de ansamblu', () => {
  const perf = { aflatoxins: { loq: 0.5 } };
  const r = { afb1: 1.5, afb2: 0.4, afg1: 0.4, afg2: 0.4, limit_afb1: 2, limit_afla_sum: 1.6, qc_status: 'accepted', method_performance: perf };
  // fără LOQ suma = 2,7 > 1,6 ; cu LOQ = 1,5 ≤ 1,6
  assert.equal(evaluateResult({ ...r, method_performance: undefined }), 'fail');
  assert.equal(evaluateResult(r), 'ok');
  const d = decisionDetail(r).rows.aflaSum;
  assert.equal(d.lowerBound, true);
  assert.equal(d.belowLoqCount, 3);
});
