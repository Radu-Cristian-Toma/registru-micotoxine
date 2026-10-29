// Export structurat al rezultatului unui buletin emis (JSON), pornind de la
// instantaneul stocat la emitere. Câmpurile urmează logica modelului „Digital SI”
// (SmartCom) pentru incertitudine (valoare, unitate, incertitudine extinsă,
// factor de acoperire, probabilitate de acoperire) și păstrează comparatorul „<”
// pentru valorile sub LOQ, ca să nu se piardă într-un comentariu. Fără
// identificatori chimici (InChIKey) până la validarea lor de către laborator.
// Starea deciziei folosește vocabularul fix: conform | neconform | in_incertitudine | fara_limita.
const SCHEMA = 'registru-micotoxine/result-export/1';
const UNIT = 'µg/kg';
const UNIT_DSI = '\\micro\\gram\\kilo\\gram\\tothe{-1}';

const ANALYTES = [
  { key: 'afb1', name: 'Aflatoxin B1', decisionKey: 'afb1', group: 'aflatoxins' },
  { key: 'afb2', name: 'Aflatoxin B2', decisionKey: null, group: 'aflatoxins' },
  { key: 'afg1', name: 'Aflatoxin G1', decisionKey: null, group: 'aflatoxins' },
  { key: 'afg2', name: 'Aflatoxin G2', decisionKey: null, group: 'aflatoxins' },
  { key: 'aflaSum', name: 'Sum of aflatoxins B1+B2+G1+G2 (lower bound)', decisionKey: 'aflaSum', group: 'aflatoxins' },
  { key: 'ota', name: 'Ochratoxin A', decisionKey: 'ota', group: 'ota' },
  { key: 'm1', name: 'Aflatoxin M1', decisionKey: 'm1', group: 'm1' },
  { key: 'don', name: 'Deoxynivalenol', decisionKey: 'don', group: 'don' },
  { key: 'zea', name: 'Zearalenone', decisionKey: 'zea', group: 'zea' },
  { key: 'fum', name: 'Fumonisins (B1+B2)', decisionKey: 'fum', group: 'fum' }
];

const VERDICT = { conform: 'conform', non_conform: 'neconform', within_uncertainty: 'in_incertitudine' };
const isNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const round = (v, n = 6) => (isNum(v) ? Number(Number(v).toFixed(n)) : null);

function isoLocal(ts) {
  // „AAAA-LL-ZZ HH:MM:SS” (ora locală a serverului, fără fus înregistrat) → „AAAA-LL-ZZTHH:MM:SS”
  return typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? ts.replace(' ', 'T') : (ts || null);
}

function measurement(def, snap) {
  const decision = snap.decision || {};
  const row = def.decisionKey && decision.rows ? decision.rows[def.decisionKey] : null;
  const raw = def.key === 'aflaSum' ? (row ? row.value : null) : (snap.results ? snap.results[def.key] : null);
  if (!isNum(raw) && !(row && isNum(row.value))) return null;
  const measured = isNum(row && row.value) ? Number(row.value) : Number(raw);
  // Aflatoxinele B2, G1, G2 nu au limită proprie; LOQ-ul lor este al grupului „aflatoxine”.
  const groupRow = decision.rows && decision.rows.aflaSum;
  const loqSource = row || (def.group === 'aflatoxins' ? groupRow : null);
  const loq = loqSource && isNum(loqSource.loq) ? Number(loqSource.loq) : null;
  const belowLoq = loq !== null && measured < loq;
  const effective = row && isNum(row.effective) ? Number(row.effective) : measured;
  const uRelPct = row && isNum(row.uRelPct) ? Number(row.uRelPct) : null;
  const out = {
    analyte: def.name, key: def.key,
    value: { comparator: belowLoq ? '<' : '=', value: round(belowLoq ? loq : measured), unit: UNIT, unitDSI: UNIT_DSI }
  };
  if (!row) out.loq = loq;
  if (row) {
    out.recovery = { pct: isNum(row.recoveryPct) ? Number(row.recoveryPct) : null, corrected: !!row.corrected };
    out.decisionValue = round(effective);
    out.expandedUncertainty = uRelPct === null ? null : {
      relativePct: uRelPct,
      uncertainty: round((effective * uRelPct) / 100),
      unit: UNIT,
      coverageFactor: 2,
      coverageProbability: 0.95
    };
    out.loq = loq;
    out.limit = isNum(row.limit) ? Number(row.limit) : null;
    out.decision = row.limit === null || row.limit === undefined ? 'fara_limita' : (VERDICT[row.verdict] || 'fara_limita');
    if (def.key === 'aflaSum') { out.lowerBound = !!row.lowerBound; out.belowLoqCount = row.belowLoqCount || 0; }
  }
  return out;
}

function buildResultExport(snapshot, meta) {
  const snap = snapshot || {};
  const m = meta || {};
  return {
    schema: SCHEMA,
    note: 'Export informativ al unui buletin emis; documentul de referință este buletinul și instantaneul lui. Fără identificatori chimici (de completat de laborator).',
    bulletin: {
      number: snap.bulletinNo || null,
      issuedAt: isoLocal(snap.issuedAt), timezone: 'ora locală a serverului (fus neînregistrat)',
      snapshotSha256: m.snapshotSha256 || null,
      integrity: m.integrity || null,
      lifecycle: m.lifecycle || null
    },
    sample: snap.sample ? { code: snap.sample.code, product: snap.sample.productName, category: snap.sample.category || null, sampleDate: snap.sample.sampleDate || null } : null,
    analysis: snap.analysis ? { date: snap.analysis.date || null, method: snap.analysis.method || null, equipment: snap.analysis.equipment || null, qcStatus: snap.analysis.qcStatus || null } : null,
    reportingBasis: snap.reportingBasis || 'as_is', dryMatterPct: snap.dryMatterPct ?? null,
    decisionRule: snap.decision ? snap.decision.rule : null,
    limitProvenance: snap.limitProvenance || null,
    measurements: ANALYTES.map(d => measurement(d, snap)).filter(Boolean)
  };
}

module.exports = { buildResultExport, SCHEMA, UNIT, UNIT_DSI, ANALYTES };
