// Nucleul de decizie (etapa C2): aceeași implementare pentru server (Node) și
// browser, ca verdictul afișat operatorului să nu difere de cel stocat.
//
//  - suma aflatoxinelor: „lower bound” — valorile sub LOQ se iau ca zero
//    (Reg. (UE) 2023/915, anexa I, secțiunea 1.1; verificat pe textul EUR-Lex,
//    vezi docs/VERIFICARE_REGLEMENTARA.md);
//  - corecția pentru recuperare: aplicată numai dacă laboratorul a bifat-o
//    pentru grupul respectiv (performanță.corrected = true) și există o
//    recuperare validă; altfel rezultatul rămâne necorectat;
//  - regula de decizie: „simple” (valoare > limită) sau „reg_2782_u”
//    (valoarea efectivă minus incertitudinea extinsă > limită);
//  - regula de lot pe mai multe probe de laborator: judgeLot() (nu este încă legată
//    de baza de date: o probă din aplicație este o singură probă de laborator).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DecisionCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DECISION_RULES = ['simple', 'reg_2782_u'];
  const PERFORMANCE_GROUPS = ['aflatoxins', 'ota', 'm1', 'don', 'zea', 'fum'];
  const ANALYTE_GROUP = { afb1: 'aflatoxins', afb2: 'aflatoxins', afg1: 'aflatoxins', afg2: 'aflatoxins', aflaSum: 'aflatoxins', ota: 'ota', m1: 'm1', don: 'don', zea: 'zea', fum: 'fum' };

  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const truthy = (v) => v === true || v === 'true' || v === 1 || v === '1' || v === 'on';

  // Performanța metodei pentru un grup: { loq, recoveryPct, uRelPct, corrected } (numere sau null).
  function groupPerformance(perf, group) {
    const g = (perf && perf[group]) || {};
    const recoveryPct = num(g.recoveryPct);
    return {
      loq: num(g.loq),
      recoveryPct,
      uRelPct: num(g.uRelPct),
      corrected: truthy(g.corrected) && recoveryPct !== null && recoveryPct > 0
    };
  }

  // Valoarea efectivă pentru decizie: corectată pentru recuperare doar la cerere.
  function effectiveValue(value, g) {
    if (value === null || value === undefined) return null;
    return g.corrected ? value * 100 / g.recoveryPct : value;
  }

  // Suma aflatoxinelor (lower bound): null dacă lipsește vreo valoare.
  function aflatoxinSum(values, perf) {
    const g = groupPerformance(perf, 'aflatoxins');
    const list = [values.afb1, values.afb2, values.afg1, values.afg2];
    if (list.some(v => v === null || v === undefined || !Number.isFinite(Number(v)))) return null;
    let belowLoq = 0;
    const sum = list.reduce((acc, raw) => {
      const v = Number(raw);
      if (g.loq !== null && v < g.loq) { belowLoq += 1; return acc; }
      return acc + v;
    }, 0);
    return { sum, belowLoq, lowerBound: g.loq !== null };
  }

  // Verdict: 'conform' | 'non_conform' | 'within_uncertainty' | null.
  function judge(effective, limit, rule, uRelPct) {
    if (effective === null || effective === undefined || limit === null || limit === undefined) return null;
    if (!(effective > limit)) return 'conform';
    if (rule === 'reg_2782_u' && Number.isFinite(uRelPct) && uRelPct > 0) {
      const uAbs = effective * uRelPct / 100;
      return (effective - uAbs > limit) ? 'non_conform' : 'within_uncertainty';
    }
    return 'non_conform';
  }

  // Evaluare unitară pentru un analit: valoarea măsurată (sau suma lower bound),
  // valoarea efectivă, verdictul și indicatorii pentru buletin.
  function assess(key, measured, limit, rule, perf) {
    const g = groupPerformance(perf, ANALYTE_GROUP[key]);
    const eff = effectiveValue(measured, g);
    return {
      value: measured === undefined ? null : measured,
      effective: eff,
      corrected: g.corrected && measured !== null && measured !== undefined,
      uRelPct: g.uRelPct, uK: g.uRelPct === null ? null : 2,
      recoveryPct: g.recoveryPct, loq: g.loq,
      belowLoq: g.loq !== null && measured !== null && measured !== undefined && measured < g.loq,
      limit: limit === undefined ? null : limit,
      verdict: judge(eff, limit, rule, g.uRelPct)
    };
  }

  // Reguli de lot cu mai multe probe de laborator, conform Reg. (UE) 2023/2782,
  // anexa I, partea II (verificat pe textul consolidat din 24.03.2024):
  //  - 'none_exceeds' (smochine, C.8; arahide/fructe cu coajă/mirodenii destinate
  //    consumatorului final sau ca ingredient, D.8): acceptare dacă nicio probă nu
  //    depășește nivelul maxim; respingere dacă una sau mai multe depășesc
  //    „dincolo de orice îndoială rezonabilă” (valoarea corectată minus U > limită);
  //  - 'average' (arahide/fructe cu coajă supuse sortării, D.8): decizia se ia pe
  //    media probelor de laborator (media valorilor efective, apoi regula de decizie).
  // Pentru o singură probă de laborator se folosește judge() direct.
  // Intrare: lista valorilor efective (după corecția pentru recuperare, dacă este
  // cazul); valorile lipsă se ignoră. Ieșire: același vocabular ca judge(), sau null.
  const LOT_MODES = ['none_exceeds', 'average'];
  function judgeLot(effectives, limit, rule, uRelPct, mode) {
    if (LOT_MODES.indexOf(mode) === -1) throw new Error('mod de lot necunoscut: ' + mode);
    const vals = (effectives || []).filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
    if (!vals.length || limit === null || limit === undefined) return null;
    if (mode === 'average') {
      return judge(vals.reduce((a, b) => a + b, 0) / vals.length, limit, rule, uRelPct);
    }
    const verdicts = vals.map(v => judge(v, limit, rule, uRelPct));
    if (verdicts.includes('non_conform')) return 'non_conform';
    if (verdicts.includes('within_uncertainty')) return 'within_uncertainty';
    return 'conform';
  }

  return { DECISION_RULES, PERFORMANCE_GROUPS, ANALYTE_GROUP, LOT_MODES, groupPerformance, effectiveValue, aflatoxinSum, judge, judgeLot, assess };
});
