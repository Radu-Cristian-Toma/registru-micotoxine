// Generează ghidul de utilizare bilingv (RO/EN) ca PDF, cu capturi din instanța de demonstrație (date inventate).
// Utilizare: NODE_PATH=<calea catre playwright> node scripts/make-guide.cjs [fisier-iesire.pdf]
// Pornește un server temporar pe o bază nouă populată cu scripts/demo-seed.js; nu atinge baza locală și nu folosește date reale.
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const OUT = path.resolve(process.argv[2] || path.join(root, 'docs', `Ghid_utilizare_v${pkg.version}.pdf`));
const PASSWORD = 'Demo-LIMS-2026!';
const code = (n) => `MYC-2026-${String(n).padStart(4, '0')}`;

const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

async function startDemo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-guide-'));
  const port = await freePort();
  const env = { PATH: process.env.PATH, LIMS_DB_PATH: path.join(tmp, 'guide.db'), PORT: String(port), SESSION_SECRET: crypto.randomBytes(24).toString('hex'), LIMS_DEMO: '1', NODE_ENV: 'development' };
  const seed = spawnSync(process.execPath, ['scripts/demo-seed.js'], { cwd: root, env, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error('demo-seed: ' + seed.stderr);
  const child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server: ' + out)), 20000);
    const iv = setInterval(() => { if (out.includes('Server pornit')) { clearTimeout(t); clearInterval(iv); resolve(); } }, 100);
  });
  return { base: `http://127.0.0.1:${port}`, stop() { child.kill(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

async function captureAll(browser, base) {
  const shots = {};
  const grab = async (p, name, opts = {}) => { shots[name] = (await p.screenshot({ type: 'jpeg', quality: 82, ...opts })).toString('base64'); };
  const login = async (email, viewport = { width: 1280, height: 820 }) => {
    const p = await (await browser.newContext({ viewport })).newPage();
    await p.goto(base);
    await p.fill('#email', email + '@demo.invalid'); await p.fill('#password', PASSWORD);
    await p.click('#auth-form button[type=submit]'); await p.waitForSelector('#btn-logout'); await p.waitForTimeout(600);
    return p;
  };
  const open = async (p, n) => { await p.getByText(code(n)).first().click(); await p.waitForTimeout(1000); };

  const anon = await (await browser.newContext({ viewport: { width: 1280, height: 700 } })).newPage();
  await anon.goto(base); await anon.waitForTimeout(700); await grab(anon, 'login');

  let p = await login('beneficiar');
  await grab(p, 'owner-list');
  await p.click('#btn-new-sample'); await p.waitForTimeout(600); await grab(p, 'owner-new');
  await p.goto(base); await p.waitForTimeout(800); await open(p, 4); await grab(p, 'owner-bulletin');
  await p.getByText('Arhivă', { exact: true }).first().click(); await p.waitForTimeout(800); await grab(p, 'owner-archive');

  p = await login('operator');
  await p.getByText('Coadă probe').first().click(); await p.waitForTimeout(700);
  await open(p, 7); await grab(p, 'op-reception');
  await p.getByRole('button', { name: /Da, proba e bună/ }).click(); await p.waitForTimeout(900); await grab(p, 'op-results');
  await p.getByText('Laborator', { exact: true }).first().click(); await p.waitForTimeout(900); await grab(p, 'op-lab');
  const lots = p.getByText(/Loturi/).first();
  if (await lots.count()) { await lots.scrollIntoViewIfNeeded(); await p.waitForTimeout(400); await grab(p, 'op-lots'); }

  p = await login('validator');
  await p.getByText('Coadă probe').first().click(); await p.waitForTimeout(700);
  await open(p, 8); await grab(p, 'validator');

  p = await login('admin'); await grab(p, 'admin-dashboard');
  for (const [t, n] of [['Operatori', 'admin-users'], ['Calitate', 'admin-quality'], ['Buletin', 'admin-bulletin']]) {
    await p.getByText(t, { exact: true }).first().click(); await p.waitForTimeout(800); await grab(p, n);
  }

  const v = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await v.goto(base + '/verify/BUL-2026-00004'); await v.waitForTimeout(1200); await grab(v, 'verify');
  return shots;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const bi = (ro, en) => `<p class="ro">${ro}</p><p class="en">${en}</p>`;
const li = (items) => `<ul>${items.map(([ro, en]) => `<li>${ro}<span class="en">${en}</span></li>`).join('')}</ul>`;
const pre = (s) => `<pre>${esc(s)}</pre>`;
const fig = (shots, key, ro, en, cls = '') => `<figure class="${cls}"><img src="data:image/jpeg;base64,${shots[key]}"><figcaption>${ro}<span class="en">${en}</span></figcaption></figure>`;
const h = (n, ro, en) => `<h2><span class="num">${n}</span> ${ro}<span class="en-h">${en}</span></h2>`;

function html(s) {
  const f = (k, ro, en, c) => (s[k] ? fig(s, k, ro, en, c) : '');
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Registru Micotoxine — Ghid de utilizare v${pkg.version}</title>
<style>
body { font: 10pt/1.45 "IBM Plex Sans", "Noto Sans", Arial, sans-serif; color: #1b2a22; }
h1 { font-size: 26pt; margin: 0 0 4pt; } h2 { font-size: 14pt; margin: 20pt 0 6pt; border-bottom: 1.5pt solid #235c47; padding-bottom: 3pt; break-after: avoid; }
.num { color: #235c47; margin-right: 4pt; }
.en, .en-h { display: block; font-style: italic; color: #5b6b63; } .en-h { font-size: 10pt; font-weight: 400; margin-top: 1pt; }
p { margin: 3pt 0; } p.en { margin-bottom: 7pt; } li { margin: 2pt 0 5pt; }
pre { background: #f3f5f2; border: 0.5pt solid #cfd8d2; padding: 6pt 8pt; font: 8.5pt/1.35 "IBM Plex Mono", "DejaVu Sans Mono", monospace; white-space: pre-wrap; break-inside: avoid; }
figure { margin: 8pt 0 10pt; break-inside: avoid; } figure img { width: 100%; border: 0.5pt solid #cfd8d2; } figure.narrow img { width: 38%; display: block; margin: 0 auto; }
figcaption { font-size: 8.5pt; color: #3e4f46; margin-top: 3pt; } figcaption .en { font-size: 8.5pt; }
.box { border: 1pt solid #b45309; background: #fff7ed; padding: 7pt 10pt; margin: 10pt 0; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0; break-inside: avoid; } td, th { border: 0.5pt solid #cfd8d2; padding: 3pt 6pt; text-align: left; vertical-align: top; font-size: 9pt; } th { background: #eef3ef; }
.cover { padding-top: 60pt; } .cover .sub { font-size: 13pt; color: #235c47; margin-bottom: 20pt; } .pb { break-before: page; }
</style></head><body>
<div class="cover"><h1>Registru Micotoxine<span class="en-h" style="font-size:16pt">Mycotoxin Register</span></h1>
<div class="sub">Ghid de utilizare / User guide · versiunea / version ${pkg.version}</div>
<p>USAMV București · Facultatea de Biotehnologii · METROFOOD-RO</p>
<div class="box"><b>Aplicație pilot, nevalidată și neacreditată.</b> Nu înlocuiește validarea de către laborator, deciziile responsabilului laboratorului și cerințele ISO/IEC 17025. Valorile care țin de validarea metodei (incertitudini, recuperări, intervale de control, retenție) aparțin laboratorului și apar în acest ghid ca [de completat].
<span class="en"><b>Pilot software, not validated or accredited.</b> It does not replace the laboratory’s validation, the quality manager’s decisions or the ISO/IEC 17025 requirements. Method-validation values (uncertainties, recoveries, control ranges, retention) belong to the laboratory and appear in this guide as [to be completed].</span></div>
<div class="box" style="border-color:#235c47;background:#f1f8f4"><b>Capturile de ecran</b> provin dintr-o instanță de demonstrație (bannerul „DEMO”): toate probele, conturile și valorile sunt inventate și nu au valoare analitică sau legală.
<span class="en"><b>Screenshots</b> come from a demonstration instance (the “DEMO” banner): all samples, accounts and values are invented and have no analytical or legal value.</span></div>
<p style="margin-top:40pt;font-size:9pt;color:#5b6b63">Licență / License: AGPL-3.0-or-later (fișierul LICENSE). Cod sursă / Source code: pachetul de instalare / the installation package.</p></div>

<div class="pb"></div>
${h(1, 'Ce face aplicația și ce nu face', 'What the application does and does not do')}
${bi('Aplicația ține registrul probelor de micotoxine: înregistrarea probei de către beneficiar, recepția și introducerea rezultatelor de către operator, aprobarea și validarea independentă, emiterea buletinului cu cod QR și verificarea publică a autenticității. Fiecare acțiune intră într-un jurnal cu lanț de amprente SHA-256, iar rezultatele corectate păstrează versiunile anterioare.', 'The application keeps the mycotoxin sample register: sample registration by the customer, reception and result entry by the operator, independent approval and validation, issue of a test report with a QR code, and public verification of authenticity. Every action enters a SHA-256 fingerprint-chained log, and corrected results keep their earlier versions.')}
${li([
  ['Decizia de conformitate se calculează după limita aplicabilă și regula aleasă („simplă” sau cea din Reg. (UE) 2023/2782, cu incertitudine extinsă).', 'The conformity decision is computed against the applicable limit and the chosen rule (“simple” or the one in Reg. (EU) 2023/2782, with expanded uncertainty).'],
  ['Pentru loturi cu mai multe probe de laborator, decizia de lot se ia după anexa I, partea II (nicio probă peste limită, sau media).', 'For lots with several laboratory samples, the lot decision follows Annex I, Part II (no sample above the limit, or the mean).'],
  ['<b>Nu</b> conține: semnătură electronică calificată, integrare cu aparatura, autentificare în doi pași, acreditare sau validare. Aceste elemente rămân în sarcina laboratorului.', 'It does <b>not</b> include: qualified electronic signature, instrument integration, two-factor authentication, accreditation or validation. These remain the laboratory’s responsibility.']
])}

${h(2, 'Instalare pe scurt (Docker)', 'Installation in brief (Docker)')}
${bi('Pachetul de livrare conține un fișier <code>docker-compose.yml</code> care pornește aplicația și un proxy HTTPS (Caddy). Detaliile, inclusiv copiile de siguranță și actualizarea, sunt în <code>docs/DISTRIBUTIE.md</code>.', 'The delivery package contains a <code>docker-compose.yml</code> that starts the application and an HTTPS proxy (Caddy). Details, including backups and updates, are in <code>docs/DISTRIBUTIE.md</code>.')}
${pre(`# 1. Pregătire / Prepare
cp docker/env.example .env      # completați LIMS_DOMAIN și LIMS_ADMIN_EMAIL / fill in
# 2. Pornire / Start
docker compose up -d
# 3. Parola temporară a primului administrator (afișată o singură dată) / one-time temporary password
docker compose logs lims
# 4. Deschideți https://<LIMS_DOMAIN> și schimbați parola la prima autentificare / change the password on first login`)}
${bi('Pentru încercare fără date reale, instanța de demonstrație pornește cu date inventate, pe calculatorul local:', 'To try the system without real data, the demonstration instance starts with invented data on the local computer:')}
${pre(`docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d lims
# http://localhost:3000 · conturi / accounts: admin@demo.invalid, operator@demo.invalid,
# validator@demo.invalid, validator2@demo.invalid, beneficiar@demo.invalid · parola/password: Demo-LIMS-2026!`)}
<div class="box">Conturile și parola de mai sus există <b>numai</b> în instanța de demonstrație. Aplicația refuză să pornească în producție cu <code>LIMS_DEMO</code> activ.
<span class="en">The accounts and password above exist <b>only</b> in the demonstration instance. The application refuses to start in production with <code>LIMS_DEMO</code> enabled.</span></div>

${h(3, 'Prima autentificare și parola', 'First login and password')}
${f('login', 'Ecranul de autentificare (aici cu bannerul DEMO). Conturile de operator și validator sunt create de administrator; beneficiarul își poate crea singur cont.', 'The login screen (here with the DEMO banner). Operator and validator accounts are created by the administrator; customers can create their own account.')}
${li([
  ['Prima parolă a administratorului este temporară: după autentificare, aplicația cere schimbarea ei înainte de orice altă acțiune. Același lucru se întâmplă după o resetare făcută de administrator.', 'The administrator’s first password is temporary: after login the application requires changing it before any other action. The same happens after a reset by the administrator.'],
  ['Butonul „Parola” schimbă parola oricând. Parola nouă are minimum 8 caractere și diferă de cea curentă.', 'The “Parola” (Password) button changes the password at any time. The new password has at least 8 characters and differs from the current one.'],
  ['După 10 încercări eșuate, contul se blochează 15 minute; evenimentele apar în jurnal.', 'After 10 failed attempts the account is locked for 15 minutes; the events appear in the log.']
])}

<div class="pb"></div>
${h(4, 'Fluxul unei probe', 'The flow of a sample')}
<table><tr><th>Pas / Step</th><th>Cine / Who</th><th>Ce se întâmplă / What happens</th></tr>
<tr><td>1</td><td>Beneficiar / Customer</td><td>Înregistrează proba și atestă prelevarea. / Registers the sample and attests the sampling.</td></tr>
<tr><td>2</td><td>Operator</td><td>Recepție (ambalaj, cantitate, temperatură): acceptă sau respinge proba. / Reception (packaging, quantity, temperature): accepts or rejects.</td></tr>
<tr><td>3</td><td>Operator</td><td>Introduce rezultatele, metoda, aparatul și controlul de calitate; trimite spre validare. / Enters results, method, equipment and quality control; submits for validation.</td></tr>
<tr><td>4</td><td>Validator</td><td>Aprobă sau returnează rezultatele (revizuire independentă). / Approves or returns the results (independent review).</td></tr>
<tr><td>5</td><td>Alt validator / Another validator</td><td>Validează și emite buletinul (cu separarea sarcinilor activă, cine a aprobat nu validează, iar administratorul nu validează). / Validates and issues the test report (with segregation of duties on, the approver cannot validate and the administrator does not validate).</td></tr>
<tr><td>6</td><td>Beneficiar / Customer</td><td>Vede valorile și verdictul numai după validare; poate verifica buletinul prin codul QR. / Sees values and verdict only after validation; can verify the test report through the QR code.</td></tr></table>

${h(5, 'Beneficiarul', 'The customer')}
${f('owner-list', 'Lista probelor beneficiarului. Înainte de validare apar doar starea („în analiză”), nu valorile sau verdictul.', 'The customer’s sample list. Before validation only the status (“in analysis”) appears, not values or verdict.')}
${f('owner-new', 'Înregistrarea unei probe noi: denumire, categorie, data recoltării și atestarea prelevării.', 'Registering a new sample: name, category, sampling date and attestation of sampling.')}
${f('owner-bulletin', 'Buletinul validat: stare, cod QR de verificare, verdictul și, mai jos, rezultatele, incertitudinea și regula de decizie.', 'The validated test report: status, verification QR code, the verdict and, below, the results, the uncertainty and the decision rule.')}
${f('owner-archive', 'Arhiva: probele încheiate, cu export CSV; pentru buletinele emise există și exportul JSON al rezultatului.', 'Archive: finished samples, with CSV export; for issued test reports there is also a JSON export of the result.')}

<div class="pb"></div>
${h(6, 'Operatorul', 'The operator')}
${f('op-reception', 'Coada de probe și pasul 1, recepția: starea ambalajului, temperatura, transportul și cantitatea.', 'The sample queue and step 1, reception: packaging condition, temperature, transport and quantity.')}
${f('op-results', 'Pasul 2: introducerea rezultatelor, a metodei, a aparatului și a controlului de calitate. Rezultatele sub LOQ se raportează cu „&lt;”.', 'Step 2: entering results, method, equipment and quality control. Results below the LOQ are reported with “&lt;”.')}
${li([
  ['O probă respinsă la recepție sau returnată de validator rămâne vizibilă cu motivul; la returnare, câmpurile se pot corecta, iar corecția creează o versiune nouă (cu motiv).', 'A sample rejected at reception or returned by the validator stays visible with the reason; when returned, the fields can be corrected and the correction creates a new version (with a reason).'],
  ['Trimiterea spre validare cere calibrare valabilă și lot de reactiv neexpirat la data analizei, conform fișei „Laborator”.', 'Submitting for validation requires a valid calibration and an unexpired reagent lot on the analysis date, as recorded in the “Laborator” tab.']
])}
${f('op-lab', 'Fila „Laborator”: starea controalelor QC pe grupe de analiți, echipamente și loturi de reactivi. Intervalele de acceptare le stabilește laboratorul din validarea metodei [de completat].', 'The “Laborator” tab: QC control status per analyte group, equipment and reagent lots. Acceptance ranges are set by the laboratory from method validation [to be completed].')}
${f('op-lots', 'Constituirea unui lot din 2–10 probe de laborator ale aceluiași beneficiar (fără probe de control); lotul se îngheață când una dintre probe este validată.', 'Forming a lot of 2–10 laboratory samples of the same customer (no control samples); the lot is frozen once one of its samples is validated.')}

<div class="pb"></div>
${h(7, 'Validatorul', 'The validator')}
${f('validator', 'Revizuirea unei probe trimise spre validare: aprobare sau returnare cu notă. Validarea finală și emiterea buletinului le face un alt validator.', 'Reviewing a sample submitted for validation: approval or return with a note. Final validation and test report issue are done by another validator.')}
${bi('Un buletin emis poate fi <b>retras</b> sau <b>înlocuit</b> de un validator, cu motiv obligatoriu; pagina publică de verificare arată starea („înlocuit”, „retras”) fără a afișa rezultatele.', 'An issued test report can be <b>withdrawn</b> or <b>superseded</b> by a validator, with a mandatory reason; the public verification page shows the state (“superseded”, “withdrawn”) without showing results.')}

<div class="pb"></div>
${h(8, 'Administratorul', 'The administrator')}
${f('admin-dashboard', 'Tabloul de bord: probele în flux, termenele de livrare și indicatorii laboratorului.', 'The dashboard: samples in progress, delivery deadlines and laboratory indicators.')}
${f('admin-users', 'Conturile de operator și validator; resetarea unei parole generează o parolă temporară afișată o singură dată.', 'Operator and validator accounts; resetting a password generates a temporary password shown once.')}
${f('admin-quality', 'Setări de calitate: separarea sarcinilor, intervalul maxim între controale QC, retenția [de completat de laborator]; modificările se jurnalizează.', 'Quality settings: segregation of duties, maximum interval between QC controls, retention [to be completed by the laboratory]; changes are logged.')}
${f('admin-bulletin', 'Antetul buletinului: denumirea laboratorului, logo, semnătură și ștampilă încărcate de laborator.', 'Test report header: laboratory name, logo, signature and stamp uploaded by the laboratory.')}

<div class="pb"></div>
${h(9, 'Verificarea publică a buletinului', 'Public test report verification')}
${f('verify', 'Pagina deschisă prin codul QR (aici pe un ecran de telefon): arată dacă buletinul este autentic, modificat, lipsă sau neverificabil, fără a expune valorile.', 'The page opened through the QR code (here on a phone screen): it shows whether the test report is authentic, modified, missing or unverifiable, without exposing values.', 'narrow')}
${bi('Codul QR conține numărul buletinului și o amprentă scurtă (16 caractere) a conținutului emis. Dacă datele s-au schimbat după emitere, pagina arată „modificat”.', 'The QR code carries the test report number and a short fingerprint (16 characters) of the issued content. If the data changed after issue, the page shows “modified”.')}

${h(10, 'Decizia de conformitate', 'The conformity decision')}
${li([
  ['<b>Regula simplă:</b> rezultatul este conform dacă nu depășește limita; altfel este neconform.', '<b>Simple rule:</b> the result is compliant if it does not exceed the limit; otherwise non-compliant.'],
  ['<b>Regula Reg. (UE) 2023/2782 (cu incertitudine):</b> dacă rezultatul depășește limita, dar rezultatul diminuat cu incertitudinea extinsă (k = 2) nu o depășește, decizia este „în limita incertitudinii”; dacă o depășește și după scăderea incertitudinii, proba este neconformă.', '<b>Reg. (EU) 2023/2782 rule (with uncertainty):</b> if the result exceeds the limit but the result minus the expanded uncertainty (k = 2) does not, the decision is “within uncertainty”; if it still exceeds the limit after subtracting the uncertainty, the sample is non-compliant.'],
  ['Recuperarea, incertitudinea și limita de cuantificare sunt date de intrare furnizate de laborator din validarea metodei [de completat]; aplicația nu propune valori.', 'Recovery, uncertainty and the limit of quantification are inputs supplied by the laboratory from method validation [to be completed]; the application does not propose values.'],
  ['Limitele din aplicație trebuie reverificate de laborator pe versiunea consolidată curentă a regulamentului înainte de decizii reale.', 'The limits in the application must be rechecked by the laboratory against the current consolidated regulation before real decisions.']
])}

<div class="pb"></div>
${h(11, 'Copii de siguranță, restaurare și integritate', 'Backups, restore and integrity')}
${pre(`# Copie criptată (parola din mediu, minimum 12 caractere) / encrypted backup
docker compose exec -e LIMS_BACKUP_PASSPHRASE=... lims node scripts/backup-db.js --encrypt /data/backup
# Verificarea integrității bazei și a lanțului de amprente / integrity and fingerprint chain
docker compose exec lims node scripts/verify-integrity.js
# Rezumat exportat (de semnat și arhivat pe alt suport) / exported digest (sign and archive elsewhere)
docker compose exec lims node scripts/export-digest.js`)}
${bi('Copiile din volumul Docker nu protejează de pierderea serverului: copiați-le periodic <b>în afara</b> serverului și testați restaurarea. Cine pierde parola copiilor criptate pierde copiile.', 'Backups in the Docker volume do not protect against losing the server: copy them periodically <b>outside</b> the server and test the restore. Whoever loses the backup passphrase loses the backups.')}

${h(12, 'Securitate: ce face aplicația și ce rămâne laboratorului', 'Security: what the application does and what remains with the laboratory')}
<table><tr><th>Aplicația / The application</th><th>Laboratorul / The laboratory</th></tr>
<tr><td>Refuză pornirea în producție fără secret de sesiune valid; cookie „Secure”, HSTS; protecție CSRF; blocare pe cont; jurnal de securitate; copii criptate AES-256-GCM; lanț de amprente pe jurnal și versiuni.<br><i>Refuses to start in production without a valid session secret; Secure cookie, HSTS; CSRF protection; per-account lockout; security log; AES-256-GCM encrypted backups; fingerprint chain on log and versions.</i></td>
<td>HTTPS pe serverul real (proxy-ul inclus gestionează certificatele); păstrarea secretelor; politica de parole a instituției; actualizările sistemului; copii în afara serverului; validarea software pentru utilizarea intenționată.<br><i>HTTPS on the real server (the bundled proxy manages certificates); keeping secrets; the institution’s password policy; system updates; off-server backups; software validation for the intended use.</i></td></tr></table>
${bi('Aplicația este software liber sub AGPL-3.0: dacă o modificați și o puneți la dispoziția altor utilizatori printr-o rețea, trebuie să le oferiți și codul sursă modificat.', 'The application is free software under AGPL-3.0: if you modify it and make it available to other users over a network, you must also offer them the modified source code.')}

${h(13, 'Probleme frecvente', 'Common problems')}
${li([
  ['<b>Cont blocat:</b> așteptați 15 minute sau cereți administratorului resetarea parolei.', '<b>Locked account:</b> wait 15 minutes or ask the administrator to reset the password.'],
  ['<b>Serverul nu pornește în producție:</b> citiți mesajul din <code>docker compose logs lims</code>; aplicația spune ce lipsește (secret, proxy, LIMS_DEMO).', '<b>Server does not start in production:</b> read the message in <code>docker compose logs lims</code>; the application says what is missing (secret, proxy, LIMS_DEMO).'],
  ['<b>Browserul avertizează asupra certificatului:</b> cu <code>LIMS_DOMAIN=localhost</code> proxy-ul folosește un certificat propriu; pentru un nume public cu DNS, certificatul se obține automat.', '<b>Browser warns about the certificate:</b> with <code>LIMS_DOMAIN=localhost</code> the proxy uses its own certificate; for a public DNS name the certificate is obtained automatically.']
])}
</body></html>`;
}

(async () => {
  const demo = await startDemo();
  const browser = await chromium.launch();
  try {
    const shots = await captureAll(browser, demo.base);
    const page = await browser.newPage();
    await page.setContent(html(shots), { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await page.pdf({ path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="font-size:7pt;width:100%;text-align:center;color:#5b6b63">Registru Micotoxine · Ghid / Guide v${pkg.version} · <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' } });
    console.log(`Ghid: ${OUT} (${fs.statSync(OUT).size} octeți); capturi: ${Object.keys(shots).join(', ')}`);
  } finally {
    await browser.close(); demo.stop();
  }
})().catch(e => { console.error(e); process.exit(1); });
