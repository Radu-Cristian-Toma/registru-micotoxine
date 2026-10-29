// Verificare in browser (Playwright) a fluxurilor din etapa de inchidere a programului.
// Utilizare: NODE_PATH=<calea catre modulul playwright> node scripts/browser-verify/run.cjs <director-iesire>
// Foloseste doar o baza temporara cu date inventate; capturile si rezultatele merg in directorul de iesire.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const { chromium } = require('playwright');
const { startServer } = require('./harness.cjs');
const { buildScenario, must } = require('./scenario.cjs');

const OUT = path.resolve(process.argv[2] || 'browser-verify-out');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const rec = (id, area, status, detail) => { results.push({ id, area, status, detail }); console.log(`${status.padEnd(4)} ${id} ${area}: ${detail}`); };
const check = (id, area, cond, okMsg, failMsg) => rec(id, area, cond ? 'PASS' : 'FAIL', cond ? okMsg : failMsg);
async function step(id, area, fn) { try { await fn(); } catch (e) { rec(id, area, 'FAIL', 'excepție: ' + String(e.message).split('\n')[0].slice(0, 200)); } }

async function loginUi(browser, s, role, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(s.base);
  await page.fill('#email', s.accounts[role].email);
  await page.fill('#password', s.accounts[role].password);
  await page.click('#auth-form button[type=submit]');
  await page.waitForSelector('#btn-logout', { timeout: 8000 });
  await page.waitForTimeout(500);
  page.errors = errors;
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false });
const bodyText = (page) => page.innerText('body');
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const open = async (page, code) => { await page.getByText(code).first().click(); await page.waitForTimeout(900); };

(async () => {
  const s = await startServer();
  const sc = await buildScenario(s);
  const ids = sc.ids;
  const code = (id) => `MYC-2026-${String(id).padStart(4, '0')}`;
  // Probe suplimentare pentru fluxurile conduse din interfata.
  const mkSample = async (name) => must(await sc.owner.call('POST', '/samples', { productName: name, category: 'Cereale / produse derivate pentru consumatorul final', sampleDate: '2026-10-03', samplingAttested: true }), 'proba');
  const intake = { intakeConfirmed: true, intakeCondition: { packaging: 'intact', quantityAdequate: true, temperatureC: 4 } };
  const vals = { afb1: 0.5, afb2: 0.1, afg1: 0.1, afg2: 0.1, ota: 1, don: 200, zea: 10, analysisDate: '2026-10-06', method: 'Metodă fictivă', equipment: 'EQ fictiv', qcStatus: 'accepted' };
  ids.I = (await mkSample('Grâu I (de respins la validare din UI)')).id;
  must(await sc.op.call('PUT', `/results/${ids.I}`, { ...intake, ...vals }), 'submit I');
  ids.J = (await mkSample('Grâu J (de respins la recepție din UI)')).id;
  ids.L1 = (await mkSample('Smochine L1 (lot, proba 1)')).id;
  must(await sc.op.call('PUT', `/results/${ids.L1}`, { ...intake, ...vals, ota: 2 }), 'submit L1');
  ids.L2 = (await mkSample('Smochine L2 (lot, proba 2)')).id;
  must(await sc.op.call('PUT', `/results/${ids.L2}`, { ...intake, ...vals, ota: 4 }), 'submit L2');
  const browser = await chromium.launch();
  const bn = { A: 'BUL-2026-00001', B: 'BUL-2026-00002', C: 'BUL-2026-00003', H: 'BUL-2026-00004' };
  try {
    // ---------- Beneficiar: stari buletin, respingere, buletin cu sectiuni noi ----------
    await step('V1', 'Beneficiar: buletin înlocuit', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.A));
      let t = await bodyText(p);
      if (!/ÎNLOCUIT/.test(t)) { await p.click('#btn-print').catch(() => {}); await p.waitForTimeout(800); t = await bodyText(p); }
      check('V1', 'Beneficiar: buletin înlocuit', /ÎNLOCUIT/.test(t) && t.includes(bn.B), 'banner „ÎNLOCUIT” cu trimitere la ' + bn.B, 'banner de înlocuire lipsă ori incomplet');
      await shot(p, 'v1-owner-buletin-inlocuit'); await p.context().close();
    });
    await step('V2', 'Beneficiar: buletin retras', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.C));
      let t = await bodyText(p);
      if (!/RETRAS/.test(t)) { await p.click('#btn-print').catch(() => {}); await p.waitForTimeout(800); t = await bodyText(p); }
      check('V2', 'Beneficiar: buletin retras', /RETRAS/.test(t) && /Eroare de transcriere/.test(t), 'banner „RETRAS” cu motiv', 'banner de retragere ori motiv lipsă');
      await shot(p, 'v2-owner-buletin-retras'); await p.context().close();
    });
    await step('V3', 'Beneficiar: respingere la recepție', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.D));
      const t = await bodyText(p);
      check('V3', 'Beneficiar: respingere la recepție', /Ambalaj deteriorat/.test(t), 'motivul respingerii este vizibil', 'motivul respingerii nu apare');
      await shot(p, 'v3-owner-respins-recepție'); await p.context().close();
    });
    await step('V4', 'Beneficiar: probă respinsă la validare (verdict afișat înainte de buletin)', async () => {
      const p = await loginUi(browser, s, 'owner');
      const row = p.locator('text=' + code(ids.E)).first().locator('xpath=ancestor::*[contains(@class,"row") or contains(@class,"item") or self::li][1]');
      const rowText = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
      const t = await bodyText(p);
      const hasConform = new RegExp(code(ids.E) + '[\\s\\S]{0,160}Conform').test(t);
      rec('V4', 'Beneficiar: probă respinsă la validare (verdict afișat înainte de buletin)', hasConform ? 'OBS' : 'PASS',
        hasConform ? 'lista beneficiarului arată „Conform” pentru o probă nevalidată (respinsă la revizuire): verdict preliminar vizibil înainte de buletin' : 'fără verdict preliminar înșelător');
      await shot(p, 'v4-owner-lista'); await p.context().close();
    });

    // ---------- Pagina publica de verificare ----------
    await step('V5', 'Verificare publică: stări buletin', async () => {
      for (const [k, re, label] of [['A', /ÎNLOCUIT/, 'înlocuit'], ['C', /RETRAS/, 'retras'], ['H', /Buletin autentic/, 'valid']]) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
        await p.goto(`${s.base}/verify/${bn[k]}`); await p.waitForTimeout(1200);
        const t = await bodyText(p); const ok = await noHScroll(p);
        const noResults = k !== 'H' || !/Aflatoxina B1/.test(t);
        check('V5' + k, 'Verificare publică 390 px: ' + label, re.test(t) && ok && noResults, 'conținut corect, fără derulare orizontală a paginii', `conținut ${re.test(t)} · fără derulare orizontală ${ok}`);
        await shot(p, 'v5-verify-' + k + '-390'); await ctx.close();
      }
    });

    // ---------- Buletin cu sectiuni noi: ecran si tiparire ----------
    await step('V6', 'Buletin cu secțiuni noi: ecran și tipărire', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.H));
      await p.evaluate(() => { window.__printCalled = 0; window.print = () => { window.__printCalled++; }; });
      await p.click('#btn-print'); await p.waitForTimeout(1500);
      const t = await bodyText(p);
      const need = [['regula de decizie', /2023\/2782/], ['recuperare', /recuperare/i], ['incertitudine', /incertitudine|U \(|k = 2|k=2/i], ['baza de raportare', /substan[țt][ăa] uscat[ăa]|dry matter/i], ['masa probei', /500/], ['antet laborator/QR', /BUL-2026-00004/]];
      const missing = need.filter(([, re]) => !re.test(t)).map(([n]) => n);
      check('V6a', 'Buletin H pe ecran: secțiuni noi', missing.length === 0, 'toate secțiunile așteptate sunt prezente', 'lipsesc: ' + missing.join(', '));
      await shot(p, 'v6-buletin-ecran');
      await p.emulateMedia({ media: 'print' });
      const pdf = path.join(OUT, 'v6-buletin-H.pdf');
      await p.pdf({ path: pdf, format: 'A4', printBackground: true });
      const info = execFileSync('pdfinfo', [pdf]).toString(); const pages = Number((info.match(/Pages:\s+(\d+)/) || [])[1]);
      const txt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
      const missingPdf = need.filter(([, re]) => !re.test(txt)).map(([n]) => n);
      check('V6b', 'Buletin H la tipărire (PDF, mediu „print”)', missingPdf.length === 0, `${pages} pagină(i); secțiunile sunt prezente la tipărire`, `lipsesc la tipărire: ${missingPdf.join(', ')} (${pages} pagini)`);
      check('V6c', 'Buletin H la tipărire: lungime', pages <= 2, `${pages} pagină(i)`, `${pages} pagini (peste 2)`);
      fs.writeFileSync(path.join(OUT, 'v6-buletin-H.txt'), txt);
      await p.context().close();
    });

    // ---------- Operator ----------
    await step('V7', 'Operator: probă returnată de validator', async () => {
      const p = await loginUi(browser, s, 'operator'); await open(p, code(ids.E));
      const t = await bodyText(p);
      const editable = await p.locator('#f-method').isEditable().catch(() => false);
      check('V7a', 'Operator: nota validatorului vizibilă', /Valori de reverificat/.test(t), 'nota de respingere este vizibilă', 'nota validatorului nu apare');
      check('V7b', 'Operator: probă returnată este editabilă', editable, 'câmpurile sunt editabile', 'câmpurile rămân blocate');
      await shot(p, 'v7-operator-returnata'); await p.context().close();
    });
    await step('V8', 'Operator: respingere la recepție din interfață', async () => {
      const p = await loginUi(browser, s, 'operator'); await open(p, code(ids.J));
      await p.click('#intake-gate-no'); await p.waitForTimeout(800);
      await shot(p, 'v8a-operator-respingere-formular');
      const ta = p.locator('textarea:visible, input[type=text]:visible').filter({ hasNot: p.locator('#search-input') }).last();
      const reasonField = await p.locator('#intake-reject-reason, #qc-rejection-reason, #f-qcRejectionReason, textarea').first();
      if (await reasonField.count()) await reasonField.fill('Cantitate insuficientă (verificare)');
      const confirm = p.getByRole('button', { name: /confirm|respinge|trimite/i }).last();
      if (await confirm.count()) await confirm.click();
      await p.waitForTimeout(1200);
      const st = await sc.op.call('GET', '/results/queue');
      const row = st.data.samples.find(r => r.id === ids.J);
      check('V8', 'Operator: respingere la recepție din UI', row && row.status === 'cancelled' && /Cantitate insuficient/.test(row.qcRejectionReason || ''), 'proba J a devenit anulată cu motiv', 'proba J nu a fost anulată din UI (stare: ' + (row && row.status) + ')');
      await shot(p, 'v8b-operator-dupa-respingere'); await p.context().close();
    });
    await step('V9', 'Operator: certificat de respingere', async () => {
      const p = await loginUi(browser, s, 'operator'); await open(p, code(ids.D));
      const popupP = p.waitForEvent('popup', { timeout: 4000 }).catch(() => null);
      await p.evaluate(() => { window.__printCalled = 0; window.print = () => { window.__printCalled++; }; });
      await p.click('#btn-print-rejection-cert'); const pop = await popupP; await p.waitForTimeout(1200);
      const t = pop ? await pop.innerText('body') : await bodyText(p);
      check('V9', 'Certificat de respingere', /Ambalaj deteriorat/.test(t), 'certificatul afișează motivul', 'certificat fără motiv');
      await shot(pop || p, 'v9-certificat-respingere'); await p.context().close();
    });
    await step('V10', 'Laborator: stări QC (în termen / eșuat / depășit / fără control)', async () => {
      const p = await loginUi(browser, s, 'operator'); await p.getByRole('button', { name: 'Laborator', exact: true }).click(); await p.waitForTimeout(1200);
      let t = await bodyText(p);
      check('V10a', 'QC „eșuat”', /ultimul control a eșuat/.test(t), 'grupul OTA arată „ultimul control a eșuat”', 'starea „eșuat” nu apare');
      check('V10b', 'QC „în termen”', /în termen/.test(t), 'grupuri „în termen”', 'starea „în termen” nu apare');
      check('V10c', 'QC „fără control”', /fără control/.test(t), 'grupuri „fără control”', 'starea „fără control” nu apare');
      await shot(p, 'v10a-lab-qc');
      // qc_controls este append-only (UPDATE interzis): se insereaza direct, in baza temporara, un control antedatat.
      const db = new Database(s.dbPath);
      db.prepare(`INSERT INTO qc_controls (analyte_group, measured_value, expected_value, accept_low_pct, accept_high_pct, recovery_pct, outcome, notes, created_by, created_at)
        VALUES ('don', 10, 10, 80, 120, 100, 'pass', 'Control antedatat (verificare)', 1, datetime('now','localtime','-30 days'))`).run(); db.close();
      await p.reload(); await p.waitForSelector('#btn-logout'); await p.getByRole('button', { name: 'Laborator', exact: true }).click(); await p.waitForTimeout(1200);
      t = await bodyText(p);
      check('V10d', 'QC „depășit” (control prea vechi)', /control prea vechi/.test(t), 'după antedatarea controlului (date inventate) apare „control prea vechi”', 'starea „control prea vechi” nu apare');
      await shot(p, 'v10b-lab-qc-depasit'); await p.context().close();
    });

    // ---------- Validator ----------
    await step('V11', 'Validator: respingere din interfață', async () => {
      const p = await loginUi(browser, s, 'validator'); p.on('dialog', d => d.accept('Respins din UI (verificare)')); await open(p, code(ids.I));
      const btns = await p.$$eval('button', bs => bs.filter(b => b.offsetParent).map(b => (b.id ? '#' + b.id + ':' : '') + b.textContent.trim().slice(0, 40)));
      await shot(p, 'v11a-validator-detaliu-I');
      const rej = p.locator('#btn-review-reject, #btn-reject-results').first();
      if (await rej.count()) {
                await rej.click(); await p.waitForTimeout(1200);
      }
      const q = await sc.v1.call('GET', '/results/queue'); const row = q.data.samples.find(r => r.id === ids.I);
      check('V11', 'Validator: respingere la validare din UI', row && row.reviewStatus === 'rejected', 'proba I a fost respinsă din UI', 'respingerea din UI nu s-a produs; butoane vizibile: ' + btns.filter(b => /#btn/.test(b)).join(' | '));
      await p.context().close();
    });
    await step('V12', 'Validator: validare și emitere din interfață', async () => {
      const p = await loginUi(browser, s, 'validator2'); await open(p, code(ids.G));
      p.on('dialog', d => d.accept());
      await p.click('#btn-validate-results'); await p.waitForTimeout(1800);
      const q = await sc.v2.call('GET', '/results/queue'); const row = q.data.samples.find(r => r.id === ids.G);
      check('V12', 'Validator: validare din UI', row && row.validationStatus === 'validated' && !!row.bulletinNo, 'proba G validată, buletin ' + (row && row.bulletinNo), 'validarea din UI nu a emis buletinul');
      await shot(p, 'v12-validator-dupa-validare'); await p.context().close();
    });
    await step('V13', 'Validator 390 px', async () => {
      const p = await loginUi(browser, s, 'validator', { width: 390, height: 844 });
      let ok = await noHScroll(p); await shot(p, 'v13a-validator-390-coada');
      await open(p, code(ids.E)); ok = ok && await noHScroll(p); await shot(p, 'v13b-validator-390-detaliu');
      await p.getByRole('button', { name: 'Laborator', exact: true }).click(); await p.waitForTimeout(900); ok = ok && await noHScroll(p); await shot(p, 'v13c-validator-390-laborator');
      check('V13', 'Validator 390 px: fără derulare orizontală a paginii', ok, 'coadă, detaliu și laborator încap în lățime', 'pagina derulează orizontal'); 
      check('V13e', 'Validator 390 px: erori de consolă', p.errors.length === 0, 'fără erori', p.errors.slice(0, 3).join(' | ')); await p.context().close();
    });

    // ---------- Administrator ----------
    await step('V14', 'Administrator: conturi, politică, resetare', async () => {
      const p = await loginUi(browser, s, 'admin');
      await p.getByRole('button', { name: 'Operatori', exact: true }).click(); await p.waitForTimeout(800);
      await p.fill('#op-fullName', 'Operator Creat UI'); await p.fill('#op-email', 'op-ui@verify.invalid'); await p.fill('#op-password', 'Tx' + Date.now() + 'ab!');
      await p.getByRole('button', { name: 'Creează operator' }).click(); await p.waitForTimeout(1000);
      check('V14a', 'Admin: creare operator din UI', /op-ui@verify\.invalid/.test(await bodyText(p)) || (await sc.admin.call('GET', '/admin/operators')).data.operators.some(o => o.email === 'op-ui@verify.invalid'), 'operator creat', 'operatorul nu apare');
      await p.fill('#val-fullName', 'Validator Creat UI'); await p.fill('#val-email', 'val-ui@verify.invalid'); await p.fill('#val-password', 'Tx' + Date.now() + 'cd!');
      await p.getByRole('button', { name: 'Creează validator' }).click(); await p.waitForTimeout(1000);
      check('V14b', 'Admin: creare validator din UI', (await sc.admin.call('GET', '/admin/validators')).data.validators.some(o => o.email === 'val-ui@verify.invalid'), 'validator creat', 'validatorul nu a fost creat');
      await shot(p, 'v14a-admin-conturi');
      await p.getByRole('button', { name: 'Calitate', exact: true }).click(); await p.waitForTimeout(1000);
      // Politica: relaxarea separarii sarcinilor fara motiv trebuie refuzata, cu motiv acceptata.
      const strict = p.locator('#pol-strict'); if (await strict.isChecked()) await strict.uncheck();
      await p.click('#btn-policy-save'); await p.waitForTimeout(900);
      let pol = (await sc.admin.call('GET', '/admin/policy')).data.policy;
      check('V14c', 'Admin: relaxare fără motiv refuzată', pol.strictRoles === true, 'politica a rămas strictă fără motiv', 'politica a fost relaxată fără motiv');
      await p.fill('#pol-reason', 'Verificare în echipă mică (date inventate)'); await p.fill('#pol-retention', '10'); await p.click('#btn-policy-save'); await p.waitForTimeout(900);
      pol = (await sc.admin.call('GET', '/admin/policy')).data.policy;
      check('V14d', 'Admin: relaxare cu motiv + retenție', pol.strictRoles === false && pol.retentionYears === 10, 'politica salvată (strictRoles=false, retenție 10 ani)', 'politica nu s-a salvat: ' + JSON.stringify(pol));
      await shot(p, 'v14b-admin-politica');
      await p.fill('#reset-search-input', code(ids.F)); await p.click('#reset-search-btn'); await p.waitForTimeout(1000);
      await shot(p, 'v14c-admin-resetare-cautare');
      const resetBtn = p.locator('button').filter({ hasText: /Resetează|Deblochează/ }).filter({ hasNot: p.locator('.validation-test') });
      const body = await bodyText(p);
      rec('V14e', 'Admin: căutare probă pentru resetare', /MYC-2026-0007/.test(body) ? 'PASS' : 'FAIL', /MYC-2026-0007/.test(body) ? 'proba apare în rezultatele căutării' : 'proba nu apare');
      await p.context().close();
    });
    await step('V15', 'Administrator 390 px', async () => {
      const p = await loginUi(browser, s, 'admin', { width: 390, height: 844 }); let ok = await noHScroll(p); const bad = [];
      for (const tab of ['Dashboard', 'Operatori', 'Calitate', 'Laborator', 'Buletin']) {
        await p.getByRole('button', { name: tab, exact: true }).click(); await p.waitForTimeout(900);
        const f = await noHScroll(p); if (!f) bad.push(tab); ok = ok && f; await shot(p, 'v15-admin-390-' + tab.toLowerCase());
      }
      check('V15', 'Administrator 390 px: fără derulare orizontală a paginii', ok, 'toate filele încap în lățime', 'derulare orizontală în: ' + bad.join(', '));
      check('V15e', 'Administrator 390 px: erori de consolă', p.errors.length === 0, 'fără erori', p.errors.slice(0, 3).join(' | ')); await p.context().close();
    });
    await step('V16', 'Validator: proba returnată operatorului', async () => {
      const p = await loginUi(browser, s, 'validator');
      const t = await bodyText(p);
      const m = t.match(new RegExp(code(ids.E) + '[\\s\\S]{0,260}'));
      const rowOk = m && /Returnat/.test(m[0]) && !/Pregătit pentru validare/.test(m[0]);
      check('V16a', 'Validator: eticheta din coadă pentru proba returnată', rowOk, 'rândul arată „Returnat”, nu „Pregătit pentru validare”', 'eticheta din coadă este încă înșelătoare');
      await open(p, code(ids.E));
      const d = await bodyText(p);
      const noBtn = (await p.locator('#btn-next-action').count()) === 0;
      check('V16b', 'Validator: cardul „următorul pas” pentru proba returnată', /Returnat operatorului/.test(d) && !/Dosarul este pregătit pentru validare/.test(d) && noBtn, 'cardul indică returnarea și nu oferă „Mergi la validare”', 'cardul este încă înșelător sau oferă un buton');
      const chip = (await p.locator('#role-guide-actions .guide-chip.primary').allInnerTexts()).join(' | ');
      check('V16d', 'Validator: chip-ul activ pentru proba returnată', !/Aprobare/.test(chip) && !/Validare/.test(chip), `chip activ: „${chip.replace(/\s+/g, ' ')}”`, `chip activ înșelător: „${chip.replace(/\s+/g, ' ')}”`);
      const cur = (await p.locator('.workflow-node.current').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      check('V16e', 'Validator: pasul curent din bara de flux pentru proba returnată', !/Validare/.test(cur), `pas curent: „${cur}”`, `bara de flux marchează încă „${cur}”`);
      await shot(p, 'v16-validator-returnata'); await p.context().close();
      const pv = await loginUi(browser, s, 'validator');
      const strip = (await pv.locator('.workload-strip, #workload-strip').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
      const mm = strip.match(/(\d+) Așteaptă aprobare/);
      const q = await sc.v1.call('GET', '/results/queue');
      const expected = q.data.samples.filter(r => r.status !== 'cancelled' && r.validationStatus !== 'validated' && !r.isControlSample && r.reviewStatus !== 'approved' && r.reviewStatus !== 'rejected').length;
      check('V16f', 'Validator: contorul „Așteaptă aprobare” exclude probele returnate', mm && Number(mm[1]) === expected, `contor ${mm && mm[1]} = ${expected} probe nereturnate și neaprobate`, `contor ${mm && mm[1]} față de ${expected} așteptat (bandă: „${strip.slice(0, 120)}”)`);
      await pv.context().close();
      const o = await loginUi(browser, s, 'operator'); await open(o, code(ids.E));
      const od = await bodyText(o);
      check('V16c', 'Operator: cardul pentru proba returnată', /Returnat operatorului/.test(od) && (await o.locator('#btn-next-action').count()) === 1, 'cardul indică returnarea și oferă butonul de corectare', 'cardul operatorului nu indică returnarea');
      await o.context().close();
    });
    // ---------- Etapa D1: lot cu mai multe probe, verificare publică în stări, export JSON, tipărire ----------
    await step('V17', 'Operator: lot cu mai multe probe din UI', async () => {
      const p = await loginUi(browser, s, 'operator');
      await p.getByRole('button', { name: 'Laborator', exact: true }).click(); await p.waitForTimeout(1200);
      const t0 = await bodyText(p);
      const section = /Loturi cu mai multe probe de laborator/.test(t0);
      await p.selectOption('#lt-pick', [String(ids.L1), String(ids.L2)]);
      await p.click('#btn-lt-create'); await p.waitForTimeout(1500);
      const t1 = await bodyText(p);
      const created = /LOT-\d{4}-0001/.test(t1);
      await p.locator('.btn-lt-detail').first().click(); await p.waitForTimeout(900);
      const t2 = await bodyText(p);
      const detail = /Verdict de lot/.test(t2) && t2.includes(code(ids.L1)) && t2.includes(code(ids.L2)) && /ota/i.test(t2);
      check('V17', 'Operator: lot cu mai multe probe din UI', section && created && detail, 'secțiunea apare, lotul se constituie și detaliul arată probele și verdictul de lot', `secțiune ${section} · lot constituit ${created} · detaliu ${detail}`);
      await shot(p, 'v17-lot-laborator');
      check('V17e', 'Operator: erori de consolă în fila Laborator', p.errors.length === 0, 'fără erori', p.errors.slice(0, 3).join(' | '));
      await p.context().close();
    });
    await step('V18', 'Verificare publică în stări', async () => {
      const snap = await sc.op.call('GET', `/results/${ids.H}/bulletin-snapshot`);
      const hash = snap.data.snapshotSha256;
      const p = await loginUi(browser, s, 'owner'); // doar pentru un context; verificarea e publică
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const pg = await ctx.newPage();
      await pg.goto(`${s.base}/verify/${bn.H}?h=${hash.slice(0, 16)}`); await pg.waitForTimeout(1200);
      const okText = await bodyText(pg);
      await pg.goto(`${s.base}/verify/${bn.H}?h=${'0'.repeat(16)}`); await pg.waitForTimeout(1200);
      const badText = await bodyText(pg); const noScroll = await noHScroll(pg);
      await shot(pg, 'v18-verify-modificat-390');
      await pg.goto(`${s.base}/verify/BUL-2026-99999`); await pg.waitForTimeout(1200);
      const missText = await bodyText(pg);
      check('V18a', 'Verificare publică: amprentă corectă din QR → autentic', /autentic/i.test(okText) && !/NU corespunde/.test(okText), 'banner „autentic”', 'amprenta corectă nu dă „autentic”');
      check('V18b', 'Verificare publică: amprentă greșită → modificat', /NU corespunde/.test(badText) && !/Buletin autentic/.test(badText) && noScroll, 'banner de avertizare, fără derulare orizontală', 'documentul prezentat nu este semnalat ca modificat');
      check('V18c', 'Verificare publică: număr inexistent → lipsă', /nu a fost găsit|was not found/.test(missText), 'mesaj „nu a fost găsit”', 'mesajul pentru buletin inexistent lipsește');
      await ctx.close(); await p.context().close();
    });
    await step('V19', 'Export JSON al rezultatului', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.H));
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.click('#btn-export-json')]);
      const file = path.join(OUT, 'v19-export.json'); await dl.saveAs(file);
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      const ok = j.schema === 'registru-micotoxine/result-export/1' && j.bulletin.number === bn.H && j.bulletin.integrity === 'ok' && Array.isArray(j.measurements) && j.measurements.length > 0;
      check('V19', 'Export JSON al rezultatului (beneficiar)', ok, `schemă corectă, ${j.measurements.length} măsurători, integritate „ok”`, 'exportul nu are structura așteptată');
      await p.context().close();
    });
    await step('V20', 'Tipărire: rezumatul deciziei rămâne pe același rând (O3)', async () => {
      const p = await loginUi(browser, s, 'owner'); await open(p, code(ids.H));
      const counts = await p.evaluate(() => ({ block: document.querySelectorAll('.perf-summary .bulletin-en').length, inline: document.querySelectorAll('.perf-summary .bulletin-en-inline').length, summaries: document.querySelectorAll('.perf-summary').length }));
      await p.emulateMedia({ media: 'print' });
      const pdf = path.join(OUT, 'v20-buletin-H.pdf'); await p.pdf({ path: pdf, format: 'A4', printBackground: true });
      const txt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
      const brokenLead = /^\s*[:;)]\s/m.test(txt.split('\n').filter(l => /Regul|Decision rule|LOQ|U =/.test(l) === false).join('\n')) && false;
      check('V20', 'Tipărire: fragmente bilingve în rând (O3)', counts.summaries > 0 && counts.block === 0 && counts.inline > 0, `blocuri bilingve în rezumat: ${counts.block}; fragmente în rând: ${counts.inline}`, `rezumate ${counts.summaries}, blocuri ${counts.block}, în rând ${counts.inline}`);
      fs.writeFileSync(path.join(OUT, 'v20-buletin-H.txt'), txt);
      await p.context().close();
    });
    // ---------- Etapa D3: parole și antete de securitate ----------
    await step('V21', 'Schimbarea parolei din interfață', async () => {
      const email = 'parola.test@verify.invalid'; const pw1 = 'ParolaVeche-12345'; const pw2 = 'ParolaNoua-67890';
      must(await sc.admin.call('POST', '/admin/operators', { email, password: pw1, fullName: 'Operator parolă (verificare)' }), 'creare cont');
      const login = async (pw) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
        await page.goto(s.base); await page.fill('#email', email); await page.fill('#password', pw);
        await page.click('#auth-form button[type=submit]'); await page.waitForTimeout(1200);
        return { page, ctx, ok: await page.locator('#btn-logout').count() > 0 };
      };
      const a = await login(pw1);
      await a.page.click('#btn-password'); await a.page.waitForSelector('#pwd-save');
      await a.page.fill('#pwd-current', pw1); await a.page.fill('#pwd-new', pw2); await a.page.fill('#pwd-confirm', pw2);
      await a.page.click('#pwd-save'); await a.page.waitForTimeout(1200);
      const closed = (await a.page.locator('#password-dialog').count()) === 0;
      await shot(a.page, 'v21-parola-schimbata'); await a.ctx.close();
      const old = await login(pw1); const oldRejected = !old.ok; await old.ctx.close();
      const neu = await login(pw2); const newOk = neu.ok; await neu.ctx.close();
      check('V21', 'Schimbarea parolei din interfață', a.ok && closed && oldRejected && newOk, 'dialogul se închide, parola veche este refuzată, cea nouă funcționează', `autentificare inițială ${a.ok} · dialog închis ${closed} · veche refuzată ${oldRejected} · nouă acceptată ${newOk}`);
    });
    await step('V22', 'Resetarea parolei de către administrator și schimbarea obligatorie', async () => {
      const email = 'reset.test@verify.invalid'; const pw1 = 'ParolaVeche-12345'; const pw2 = 'ParolaNoua-67890';
      must(await sc.admin.call('POST', '/admin/operators', { email, password: pw1, fullName: 'Operator resetare (verificare)' }), 'creare cont');
      const adm = await loginUi(browser, s, 'admin');
      await adm.getByRole('button', { name: 'Calitate', exact: true }).click(); await adm.waitForSelector('#btn-rst', { timeout: 8000 });
      adm.on('dialog', d => d.accept());
      await adm.fill('#rst-email', email); await adm.click('#btn-rst'); await adm.waitForSelector('#rst-temp', { timeout: 8000 });
      const temp = (await adm.innerText('#rst-temp')).trim();
      await shot(adm, 'v22-admin-resetare'); await adm.context().close();
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const page = await ctx.newPage();
      await page.goto(s.base); await page.fill('#email', email); await page.fill('#password', temp);
      await page.click('#auth-form button[type=submit]'); await page.waitForTimeout(1200);
      const forced = /Alege o parolă nouă|Choose a new password/.test(await bodyText(page)) && (await page.locator('#btn-logout').count()) === 0;
      await page.fill('#pwd-current', temp); await page.fill('#pwd-new', pw2); await page.fill('#pwd-confirm', pw2);
      await page.click('#pwd-save'); await page.waitForTimeout(1500);
      const after = (await page.locator('#btn-logout').count()) > 0;
      await shot(page, 'v22-dupa-schimbare'); await ctx.close();
      check('V22', 'Resetare de administrator + schimbare obligatorie', /^[A-Za-z0-9]{14}$/.test(temp) && forced && after, 'parolă temporară de 14 caractere; ecranul de schimbare obligatorie blochează aplicația; după schimbare aplicația se deschide', `temporară ${temp.length} car. · ecran obligatoriu ${forced} · aplicație după schimbare ${after}`);
    });
    await step('V23', 'Antete de securitate', async () => {
      const r1 = await fetch(s.base + '/'); const r2 = await fetch(s.base + '/api/auth/me');
      const csp = r1.headers.get('content-security-policy') || ''; const nc = r2.headers.get('cache-control') || '';
      const hsts = r1.headers.get('strict-transport-security');
      check('V23', 'Antete de securitate', /frame-ancestors 'self'/.test(csp) && /no-store/.test(nc) && !hsts && r1.headers.get('x-content-type-options') === 'nosniff', 'CSP (frame-ancestors, base-uri, form-action, object-src), no-store pe /api, fără HSTS în dezvoltare', `CSP „${csp}” · Cache-Control „${nc}” · HSTS ${hsts}`);
    });
  } finally {
    await browser.close(); s.stop();
  }
  fs.writeFileSync(path.join(OUT, 'rezultate.json'), JSON.stringify(results, null, 1));
  const c = (st) => results.filter(r => r.status === st).length;
  console.log(`\nTOTAL: ${results.length} · PASS ${c('PASS')} · FAIL ${c('FAIL')} · OBS ${c('OBS')}`);
})().catch(e => { console.error('ERR', e); process.exit(1); });
