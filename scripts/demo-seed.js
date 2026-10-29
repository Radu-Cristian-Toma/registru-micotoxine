// Date de demonstrație (Etapa E): populează o bază NOUĂ cu conturi și probe INVENTATE, ca să poată fi parcursă
// aplicația fără date reale. Toate datele sunt fictive și nu au valoare analitică sau legală.
//
//   LIMS_DEMO=1 LIMS_DB_PATH=<baza> node scripts/demo-seed.js
//
// Refuză să ruleze: fără LIMS_DEMO=1, cu NODE_ENV=production, sau pe o bază care conține deja alte date.
// Datele se creează prin API-ul aplicației (un server temporar, pe un port liber), deci jurnalul, versiunile
// și lanțul de amprente sunt cele reale. Parola conturilor demo este afișată la sfârșit și este valabilă DOAR în demo.
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DEMO_PASSWORD = 'Demo-LIMS-2026!';
const ACCOUNTS = {
  admin: { email: 'admin@demo.invalid', name: 'Administrator Demo' },
  operator: { email: 'operator@demo.invalid', name: 'Operator Demo' },
  validator: { email: 'validator@demo.invalid', name: 'Validator Demo' },
  validator2: { email: 'validator2@demo.invalid', name: 'Validator Demo 2' },
  owner: { email: 'beneficiar@demo.invalid', name: 'Beneficiar Demo' }
};

function freePort() {
  return new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
}

function apiClient(base) {
  let cookie = '', csrf = '';
  async function call(method, url, body) {
    const res = await fetch(base + '/api' + url, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    const c = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (c.length) cookie = c.map(x => x.split(';')[0]).join('; ');
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.text();
    if (data && typeof data === 'object' && data.csrfToken) csrf = data.csrfToken;
    if (res.status !== 200) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(data)}`);
    return data;
  }
  return {
    call,
    async init() { await call('GET', '/auth/me'); },
    async login(acc) { await this.init(); await call('POST', '/auth/login', { email: acc.email, password: DEMO_PASSWORD }); return this; }
  };
}

const CAT_CEREALE = 'Cereale / produse derivate pentru consumatorul final';
const CAT_BOIA = 'Capsicum spp. uscat (boia, paprika, ardei iute, chilli, cayenne)';

async function populate(base) {
  const admin = await apiClient(base).login(ACCOUNTS.admin);
  const op = await apiClient(base).login(ACCOUNTS.operator);
  const v1 = await apiClient(base).login(ACCOUNTS.validator);
  const v2 = await apiClient(base).login(ACCOUNTS.validator2);
  const owner = await apiClient(base).login(ACCOUNTS.owner);

  const mk = async (productName, category, sampleDate) => (await owner.call('POST', '/samples', { productName: `${productName} [DEMO]`, category, sampleDate, samplingAttested: true })).id;
  const intake = { intakeConfirmed: true, intakeCondition: { packaging: 'intact', quantityAdequate: true, temperatureC: 5, transport: 'Curier (demo)' } };
  const base1 = { afb1: 0.8, afb2: 0.2, afg1: 0.2, afg2: 0.1, ota: 1.1, don: 300, zea: 20, analysisDate: '2026-10-05', method: 'LC-MS/MS (metodă fictivă de demonstrație)', equipment: 'Aparat fictiv EQ-DEMO', qcStatus: 'accepted' };
  const submit = (id, extra = {}) => op.call('PUT', `/results/${id}`, { ...intake, ...base1, ...extra });
  const approve = (id, note = 'Aprobat (demo)') => v1.call('POST', `/results/${id}/review`, { decision: 'approved', note });
  const validate = (id) => v2.call('POST', `/results/${id}/validate`, {});
  const issue = async (id, extra) => { await submit(id, extra); await approve(id); await validate(id); };

  // Buletine emise: conform, cu regulă de decizie și incertitudine, depășire.
  const g1 = await mk('Grâu panificabil 1', CAT_CEREALE, '2026-10-01'); await issue(g1);
  const g2 = await mk('Grâu panificabil 2', CAT_CEREALE, '2026-10-01'); await issue(g2);
  const g3 = await mk('Porumb boabe', CAT_CEREALE, '2026-10-02'); await issue(g3, { afb1: 6.5, afb2: 0.4, afg1: 0.3, afg2: 0.1, don: 450 });
  const boia = await mk('Boia dulce', CAT_BOIA, '2026-10-02');
  await issue(boia, {
    afb1: 1.5, afb2: 0.3, afg1: 0.3, afg2: 0.2, ota: 18, don: undefined, zea: undefined, decisionRule: 'reg_2782_u',
    methodPerformance: { aflatoxins: { loq: 0.1, recoveryPct: 92, uRelPct: 30, corrected: true }, ota: { loq: 0.5, recoveryPct: 95, uRelPct: 25 } },
    reportingBasis: 'dry_matter', dryMatterPct: 91, labSampleMassG: 500, homogenization: 'Măcinare fină (demo)', replicates: 2,
    limitChangeReason: 'Alegere regulă de decizie (demo)'
  });

  // Alte stări: respinsă la recepție, returnată de validator, în lucru, aprobată (de validat).
  const rej = await mk('Orez (ambalaj deteriorat)', CAT_CEREALE, '2026-10-03');
  await op.call('PUT', `/results/${rej}`, { ...intake, qcStatus: 'rejected', qcRejectionReason: 'Ambalaj deteriorat (demo)' });
  const ret = await mk('Secară (valori de reverificat)', CAT_CEREALE, '2026-10-03');
  await submit(ret); await v1.call('POST', `/results/${ret}/review`, { decision: 'rejected', note: 'Valori de reverificat (demo)' });
  await mk('Ovăz (în așteptare)', CAT_CEREALE, '2026-10-04');
  const appr = await mk('Orz (aprobat, de validat)', CAT_CEREALE, '2026-10-04'); await submit(appr); await approve(appr);

  // Buletin retras și buletin înlocuit.
  const w = await mk('Grâu retras', CAT_CEREALE, '2026-10-01'); await issue(w);
  await v1.call('POST', `/lab/bulletins/${w}/withdraw`, { reason: 'Eroare de transcriere (demo)' });
  const old = await mk('Grâu înlocuit', CAT_CEREALE, '2026-10-01'); await issue(old);
  const neu = await mk('Grâu reemis', CAT_CEREALE, '2026-10-01'); await issue(neu);
  await v1.call('POST', `/lab/bulletins/${old}/supersede`, { reason: 'Înlocuit prin reemitere (demo)', replacedBySampleId: neu });

  // Lot de două probe de laborator (încă nevalidate), pentru fila Laborator.
  const l1 = await mk('Smochine uscate, proba 1', 'Smochine uscate', '2026-10-06');
  const l2 = await mk('Smochine uscate, proba 2', 'Smochine uscate', '2026-10-06');
  await submit(l1, { ota: 2 }); await submit(l2, { ota: 4 });
  await op.call('POST', '/lots', { lotMode: 'none_exceeds', sampleIds: [l1, l2], note: 'Lot demonstrativ' });

  // Controale QC fictive.
  const qc = (g, measured) => op.call('POST', '/lab/qc-controls', { analyteGroup: g, measuredValue: measured, expectedValue: 10, acceptLowPct: 80, acceptHighPct: 120, notes: 'Control fictiv (demo)' });
  await qc('aflatoxins', 10); await qc('ota', 9.5); await qc('zea', 10);
}

async function main() {
  if (!/^(1|true)$/i.test((process.env.LIMS_DEMO || '').trim())) throw new Error('Setați LIMS_DEMO=1: scriptul creează date inventate și nu trebuie rulat din greșeală pe o bază reală.');
  if (process.env.NODE_ENV === 'production') throw new Error('Refuz: instanța demo nu rulează în producție (NODE_ENV=production).');
  const dbPath = process.env.LIMS_DB_PATH || path.join(ROOT, 'db', 'lims.db');
  const db = require('../db/database');
  const others = db.prepare("SELECT COUNT(*) n FROM users WHERE email NOT LIKE '%@demo.invalid'").get().n;
  const samples = db.prepare('SELECT COUNT(*) n FROM samples').get().n;
  const demoUsers = db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE '%@demo.invalid'").get().n;
  if (others > 0) throw new Error('Baza conține conturi care nu sunt de demonstrație; refuz să adaug date inventate.');
  if (demoUsers > 0 && samples > 0) { console.log('Datele demo există deja; nu se adaugă nimic.'); db.close(); return; }
  if (samples > 0) throw new Error('Baza conține deja probe; refuz.');
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const ins = db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)');
  for (const [k, role] of [['admin', 'admin'], ['operator', 'operator'], ['validator', 'validator'], ['validator2', 'validator'], ['owner', 'owner']]) {
    if (!db.prepare('SELECT 1 FROM users WHERE email = ?').get(ACCOUNTS[k].email)) ins.run(ACCOUNTS[k].email, hash, ACCOUNTS[k].name, role);
  }
  db.close();

  const port = await freePort();
  const env = { PATH: process.env.PATH, LIMS_DB_PATH: dbPath, PORT: String(port), SESSION_SECRET: crypto.randomBytes(24).toString('hex'), LIMS_DEMO: '1', NODE_ENV: 'development' };
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Serverul temporar nu a pornit: ' + out)), 20000);
      const iv = setInterval(() => { if (out.includes('Server pornit')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 100);
    });
    await populate(`http://127.0.0.1:${port}`);
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => child.once('exit', r));
  }
  console.log('Date demo create (toate inventate). Conturi (parola comună, valabilă doar în demo):');
  for (const a of Object.values(ACCOUNTS)) console.log(`  ${a.email}`);
  console.log(`  parola: ${DEMO_PASSWORD}`);
}

if (require.main === module) main().catch(err => { console.error(`demo-seed: ${err.message}`); process.exit(1); });
module.exports = { DEMO_PASSWORD, ACCOUNTS };
