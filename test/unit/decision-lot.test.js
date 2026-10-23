// Regula de lot cu mai multe probe de laborator (Reg. (UE) 2023/2782, anexa I, partea II)
// și echivalența corecției sumei aflatoxinelor. Date inventate.
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../../public/decision-core');

const U = 30; // % relativ, k = 2
const LIMIT = 10;

test('none_exceeds: acceptare dacă nicio probă nu depășește limita', () => {
  assert.equal(Core.judgeLot([8, 9.9, 10], LIMIT, 'reg_2782_u', U, 'none_exceeds'), 'conform');
});

test('none_exceeds: respingere dacă una singură depășește dincolo de îndoială (valoare − U > limită)', () => {
  // 16 − 30 % = 11,2 > 10; celelalte conforme
  assert.equal(Core.judgeLot([5, 16, 9], LIMIT, 'reg_2782_u', U, 'none_exceeds'), 'non_conform');
});

test('none_exceeds: depășire în limita incertitudinii nu este nici acceptare, nici respingere', () => {
  // 12 − 30 % = 8,4 ≤ 10
  assert.equal(Core.judgeLot([5, 12, 9], LIMIT, 'reg_2782_u', U, 'none_exceeds'), 'within_uncertainty');
});

test('none_exceeds: o respingere prevalează peste „în incertitudine”', () => {
  assert.equal(Core.judgeLot([12, 16], LIMIT, 'reg_2782_u', U, 'none_exceeds'), 'non_conform');
});

test('average: decizia se ia pe media probelor, nu pe fiecare probă', () => {
  // media (4 + 16) / 2 = 10 → conform, deși o probă depășește limita
  assert.equal(Core.judgeLot([4, 16], LIMIT, 'reg_2782_u', U, 'average'), 'conform');
  // media 14: 14 − 30 % = 9,8 ≤ 10 → în incertitudine
  assert.equal(Core.judgeLot([12, 16], LIMIT, 'reg_2782_u', U, 'average'), 'within_uncertainty');
  // media 20: 20 − 30 % = 14 > 10 → neconform
  assert.equal(Core.judgeLot([18, 22], LIMIT, 'reg_2782_u', U, 'average'), 'non_conform');
});

test('regula „simple” în lot: orice depășire este neconformă (none_exceeds)', () => {
  assert.equal(Core.judgeLot([5, 10.1], LIMIT, 'simple', null, 'none_exceeds'), 'non_conform');
});

test('valorile lipsă se ignoră; fără valori sau fără limită rezultatul este null', () => {
  assert.equal(Core.judgeLot([null, undefined, 8], LIMIT, 'reg_2782_u', U, 'none_exceeds'), 'conform');
  assert.equal(Core.judgeLot([], LIMIT, 'reg_2782_u', U, 'average'), null);
  assert.equal(Core.judgeLot([null], LIMIT, 'reg_2782_u', U, 'average'), null);
  assert.equal(Core.judgeLot([8], null, 'reg_2782_u', U, 'average'), null);
});

test('mod de lot necunoscut este refuzat', () => {
  assert.throws(() => Core.judgeLot([8], LIMIT, 'reg_2782_u', U, 'max'), /mod de lot necunoscut/);
  assert.deepEqual(Core.LOT_MODES, ['none_exceeds', 'average']);
});

test('un lot cu o singură probă coincide cu judge() pe aceeași valoare', () => {
  for (const v of [5, 10, 10.1, 12, 16]) {
    const single = Core.judge(v, LIMIT, 'reg_2782_u', U);
    assert.equal(Core.judgeLot([v], LIMIT, 'reg_2782_u', U, 'none_exceeds'), single);
    assert.equal(Core.judgeLot([v], LIMIT, 'reg_2782_u', U, 'average'), single);
  }
});

test('suma aflatoxinelor: corecția pe fiecare toxină înainte de însumare = corecția sumei (recuperare comună grupului)', () => {
  const v = { afb1: 1.2, afb2: 0.3, afg1: 0.8, afg2: 0.1 };
  const perf = { aflatoxins: { loq: 0.05, recoveryPct: 80, corrected: true } };
  const g = Core.groupPerformance(perf, 'aflatoxins');
  // conform anexei II pct. 4.3.1: se corectează fiecare toxină, apoi se însumează
  const perToxin = ['afb1', 'afb2', 'afg1', 'afg2']
    .filter(k => v[k] >= g.loq)
    .reduce((acc, k) => acc + Core.effectiveValue(v[k], g), 0);
  const sum = Core.aflatoxinSum(v, perf).sum;
  const sumThenCorrect = Core.effectiveValue(sum, g);
  assert.ok(Math.abs(perToxin - sumThenCorrect) < 1e-9);
});

test('suma aflatoxinelor: valorile sub LOQ se înlocuiesc cu zero înainte de corecție', () => {
  const v = { afb1: 1.0, afb2: 0.04, afg1: 0.04, afg2: 0.04 };
  const perf = { aflatoxins: { loq: 0.05, recoveryPct: 50, corrected: true } };
  const g = Core.groupPerformance(perf, 'aflatoxins');
  const r = Core.aflatoxinSum(v, perf);
  assert.equal(r.belowLoq, 3);
  assert.ok(Math.abs(Core.effectiveValue(r.sum, g) - 2.0) < 1e-9);
});
