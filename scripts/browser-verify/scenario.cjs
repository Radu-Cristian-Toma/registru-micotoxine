// Construieste, prin API, starile de verificat (date inventate, baza temporara).
const { apiClient } = require('./harness.cjs');

const GRAU = { productName: 'Grâu panificabil (verificare)', category: 'Cereale / produse derivate pentru consumatorul final', sampleDate: '2026-10-01', samplingAttested: true };
const BOIA = { productName: 'Boia dulce (verificare)', category: 'Capsicum spp. uscat (boia, paprika, ardei iute, chilli, cayenne)', sampleDate: '2026-10-02', samplingAttested: true };

async function login(base, acc) { const c = apiClient(base); await c.login(acc); return c; }
const must = (r, what) => { if (r.status !== 200) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data)}`); return r.data; };

async function buildScenario(s) {
  const A = s.accounts;
  const admin = await login(s.base, A.admin);
  for (const [k, role] of [['operator', 'operators'], ['operator2', 'operators'], ['validator', 'validators'], ['validator2', 'validators']]) {
    must(await admin.call('POST', '/admin/' + role, { email: A[k].email, password: A[k].password, fullName: A[k].name }), 'cont ' + k);
  }
  const owner = apiClient(s.base); await owner.init();
  must(await owner.call('POST', '/auth/register', { email: A.owner.email, password: A.owner.password, fullName: A.owner.name }), 'owner');
  const op = await login(s.base, A.operator);
  const v1 = await login(s.base, A.validator);
  const v2 = await login(s.base, A.validator2);

  const mk = async (body) => must(await owner.call('POST', '/samples', body), 'proba');
  const intake = { intakeConfirmed: true, intakeCondition: { packaging: 'intact', quantityAdequate: true, temperatureC: 5, transport: 'Curier (verificare)' } };
  const grauVals = { afb1: 0.8, afb2: 0.2, afg1: 0.2, afg2: 0.1, ota: 1.1, don: 300, zea: 20, analysisDate: '2026-10-05', method: 'LC-MS/MS (metodă fictivă de verificare)', equipment: 'Aparat fictiv EQ-V1', qcStatus: 'accepted' };
  const submit = async (id, extra = {}) => must(await op.call('PUT', `/results/${id}`, { ...intake, ...grauVals, ...extra }), 'submit ' + id);
  const approve = async (id) => must(await v1.call('POST', `/results/${id}/review`, { decision: 'approved', note: 'Aprobat (verificare)' }), 'review ' + id);
  const validate = async (id) => must(await v2.call('POST', `/results/${id}/validate`, {}), 'validate ' + id);

  const ids = {};
  for (const k of ['A', 'B', 'C']) { ids[k] = (await mk({ ...GRAU, productName: `${GRAU.productName} ${k}` })).id; await submit(ids[k]); await approve(ids[k]); await validate(ids[k]); }

  // Proba cu sectiuni noi pe buletin: Capsicum, regula de decizie cu incertitudine, recuperare corectata, baza uscata.
  ids.H = (await mk(BOIA)).id;
  await submit(ids.H, {
    afb1: 1.5, afb2: 0.3, afg1: 0.3, afg2: 0.2, ota: 18, don: undefined, zea: undefined,
    decisionRule: 'reg_2782_u',
    methodPerformance: { aflatoxins: { loq: 0.1, recoveryPct: 92, uRelPct: 30, corrected: true }, ota: { loq: 0.5, recoveryPct: 95, uRelPct: 25 } },
    reportingBasis: 'dry_matter', dryMatterPct: 91, labSampleMassG: 500, homogenization: 'Măcinare fină (verificare)', replicates: 2,
    limitChangeReason: 'Alegere regulă de decizie (verificare)',
  });
  await approve(ids.H); await validate(ids.H);

  ids.D = (await mk({ ...GRAU, productName: GRAU.productName + ' D (respinsă la recepție)' })).id;
  must(await op.call('PUT', `/results/${ids.D}`, { ...intake, qcStatus: 'rejected', qcRejectionReason: 'Ambalaj deteriorat (verificare)' }), 'respingere recepție');

  ids.E = (await mk({ ...GRAU, productName: GRAU.productName + ' E (respinsă la validare)' })).id;
  await submit(ids.E);
  must(await v1.call('POST', `/results/${ids.E}/review`, { decision: 'rejected', note: 'Valori de reverificat (verificare)' }), 'respingere validare');

  ids.F = (await mk({ ...GRAU, productName: GRAU.productName + ' F (în lucru)' })).id;
  ids.G = (await mk({ ...GRAU, productName: GRAU.productName + ' G (aprobată, de validat)' })).id;
  await submit(ids.G); await approve(ids.G);

  // Stari buletin: C retras, A inlocuit de B.
  must(await v1.call('POST', `/lab/bulletins/${ids.C}/withdraw`, { reason: 'Eroare de transcriere (verificare)' }), 'retragere');
  must(await v1.call('POST', `/lab/bulletins/${ids.A}/supersede`, { reason: 'Înlocuit prin reemitere (verificare)', replacedBySampleId: ids.B }), 'inlocuire');

  // Controale QC: ota esuat, aflatoxine ok (urmeaza sa fie depasit prin antedatare), fara pentru don.
  const qc = (g, measured) => op.call('POST', '/lab/qc-controls', { analyteGroup: g, measuredValue: measured, expectedValue: 10, acceptLowPct: 80, acceptHighPct: 120, notes: 'Control fictiv (verificare)' });
  must(await qc('ota', 5), 'qc ota esuat');
  must(await qc('aflatoxins', 10), 'qc afla ok');
  must(await qc('zea', 10), 'qc zea ok');

  return { ids, admin, op, v1, v2, owner };
}
module.exports = { buildScenario, must };
