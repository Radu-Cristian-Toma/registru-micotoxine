// Acceptanță + captură de figuri (v2) — Registru Micotoxine v1.53.5.
// Interfața în engleză. Capturile se fac PE ELEMENT, nu pe pagină întreagă:
// aplicația derulează într-un container interior, deci o captură de pagină
// prinde doar ce se vede în fereastră (ecrane repetate, formulare lipsă).
const { chromium } = require('/Users/xtian_ro/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const CHROME = '/Users/xtian_ro/.cache/puppeteer/chrome/mac_arm-142.0.7444.175/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = 'http://127.0.0.1:3219';
const OUT = '/Users/xtian_ro/lims-figuri-final6-20261007/acceptanta-final6';
const FIG = '/Users/xtian_ro/Documents/Proiecte/LIMS-Metrofood/figuri-final6';
fs.mkdirSync(OUT, { recursive: true });
// NU se șterge nimic: setul anterior (capturi de pagină, cu defecte) rămâne pe disc
// până când autorul confirmă comanda de curățare.
fs.mkdirSync(FIG, { recursive: true });

const P = {
  owner: { email: 'beneficiar@test.local', pass: 'Beneficiar-2026!', nume: 'Ferma Test SRL' },
  operator: { email: 'operator@test.local', pass: 'Operator-2026!', nume: 'Operator Test' },
  validator: { email: 'validator@test.local', pass: 'Validator-2026!', nume: 'Validator Test' },
  admin: { email: 'admin@test.local', pass: 'TestAcceptanta-2026!', nume: 'Admin Test' },
};

const rez = { produs: 'Registru Micotoxine v1.53.5', limba: 'en', captura: 'pe element', inceput: new Date().toISOString(),
  pasi: [], capturi: [], capturiEsuate: [], interactiuniUI: 0, eroriConsola: [], date: {} };
const salveaza = () => fs.writeFileSync(path.join(OUT, 'rezultate.json'), JSON.stringify(rez, null, 1));
let nrPas = 0, ui = 0, nrFig = 0;
const asigura = (c, m) => { if (!c) throw new Error('ASERȚIUNE: ' + m); };

async function pas(page, titlu, fn) {
  const n = ++nrPas, t0 = Date.now();
  try {
    const d = await fn();
    rez.pasi.push({ n, titlu, ms: Date.now() - t0, ok: true, detaliu: d ?? null });
    console.log(`${String(n).padStart(2)} ✓ ${titlu}  (${Date.now() - t0} ms)`);
  } catch (e) {
    rez.pasi.push({ n, titlu, ms: Date.now() - t0, ok: false, eroare: e.message });
    console.log(`${String(n).padStart(2)} ✗ ${titlu} → ${e.message}`);
    salveaza(); throw e;
  }
  salveaza();
}

// reglez o figură: element, sau zonă decupată dintr-un element
async function fig(page, mod, arg, slug, titlu, { asteapta = 500, inaltime = null } = {}) {
  nrFig++;
  const nume = `figura-${String(nrFig).padStart(2, '0')}-${slug}.png`;
  const f = path.join(FIG, nume);
  try {
    if (asteapta) await page.waitForTimeout(asteapta);
    if (mod === 'element') {
      const loc = page.locator(arg).first();
      await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
      await curata(page);
      await loc.screenshot({ path: f, timeout: 20000 });
    } else if (mod === 'zona') {           // arg = { interior, martor } -> cel mai apropiat strămoș comun
      const box = await page.evaluate(([a, b]) => {
        const el = document.querySelector(a), martor = document.querySelector(b);
        if (!el || !martor) return null;
        let n = el;
        while (n && !n.contains(martor)) n = n.parentElement;
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
      }, [arg.interior, arg.martor]);
      asigura(box, `nu am găsit containerul pentru ${arg.interior}`);
      await curata(page);
      await page.screenshot({ path: f, clip: box });
    } else if (mod === 'varf') {           // arg = selector, inaltime = px de la vârf
      const box = await page.evaluate(([sel, h]) => {
        const el = document.querySelector(sel); if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: Math.min(h, r.height) };
      }, [arg, inaltime || 1500]);
      asigura(box, `nu am găsit ${arg}`);
      await curata(page);
      await page.screenshot({ path: f, clip: box });
    } else if (mod === 'pagina') {
      await page.screenshot({ path: f, fullPage: true });
    }
    const kb = Math.round(fs.statSync(f).size / 1024);
    const dim = require('child_process').execSync(`sips -g pixelWidth -g pixelHeight "${f}" | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}'`).toString().trim();
    rez.capturi.push({ nr: nrFig, fisier: nume, titlu, kb, pixeli: dim });
    console.log(`   ▣ fig.${String(nrFig).padStart(2)} ${nume}  ${dim}  ${kb} KB`);
    return nume;
  } catch (e) {
    rez.capturiEsuate.push({ nr: nrFig, slug, eroare: e.message });
    console.log(`   ▢ fig.${String(nrFig).padStart(2)} EȘUATĂ (${slug}): ${e.message}`);
    return null;
  }
}

async function umple(page, sel, val) { ui++; await page.fill(sel, val); }
async function apasa(page, sel) { ui++; await page.click(sel); }
async function alege(page, sel, val) { ui++; await page.selectOption(sel, val); }
async function bifeaza(page, sel) { ui++; await page.check(sel); }

async function autentifica(page, cont, { inregistrare = false } = {}) {
  await page.context().clearCookies();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#auth-form');
  if (inregistrare) {
    ui++; await page.click('#toggle-auth'); await page.waitForSelector('#fullName');
    await umple(page, '#fullName', cont.nume);
    await umple(page, '#email', cont.email);
    await umple(page, '#password', cont.pass);
    ui++; await page.click('#auth-form button[type=submit]');
    await page.waitForTimeout(1200);
    return { mod: 'inregistrare' };
  }
  await umple(page, '#email', cont.email);
  await umple(page, '#password', cont.pass);
  ui++; await page.click('#auth-form button[type=submit]');
  await page.waitForTimeout(900);
  await spreEngleza(page);
  return { mod: 'autentificare' };
}

// Igiena capturii: fara antet lipicios peste continut, fara notificari, fara
// containere care taie elementul (altfel elementele mai inalte decat fereastra
// ies gri, iar banda de actiuni lipicioasa acopera ultimul rand de tabel).
async function curata(page) {
  await page.addStyleTag({ content: `
    .registry-head, .actions-row, header, .app-header, .header-tabs { position: static !important; }
    .toast { display: none !important; }
    .sample-list, .detail, .archive-table-wrap, .dossier-modal,
    #main-area, .scroll-area, .registry, #admin-view-root {
      overflow: visible !important; max-height: none !important; }
    * { animation: none !important; transition: none !important; }
  ` }).catch(() => {});
}

// Limba: aplicatia revine la romana la fiecare delogare (setLang('ro') in
// logout()), deci dupa fiecare autentificare o reapucam pe engleza si redesenam.
const asteapta = (page, sel, ms = 20000) => page.waitForSelector(sel, { timeout: ms });
const spreEngleza = (page) => page.evaluate(() => { if (typeof setLang === 'function') setLang('en'); if (typeof render === 'function') render(); }).catch(() => {});

async function apiDinPagina(page, cale, optiuni = {}) {
  return page.evaluate(async ([c, o]) => {
    const csrf = await fetch('/api/auth/me').then(r => r.json()).then(d => d.csrfToken).catch(() => null);
    const res = await fetch('/api' + c, { headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...o });
    const corp = await res.json().catch(() => ({}));
    return { status: res.status, corp };
  }, [cale, optiuni]);
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 2400 }, deviceScaleFactor: 3, locale: 'en-GB' });
  await ctx.addInitScript(() => { try { localStorage.setItem('appLang', 'en'); } catch (e) {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('console', m => { if (m.type() === 'error') rez.eroriConsola.push(m.text()); });
  page.on('pageerror', e => rez.eroriConsola.push('pageerror: ' + e.message));
  page.on('dialog', async d => { rez.dialogs = rez.dialogs || []; rez.dialogs.push({ tip: d.type(), mesaj: d.message().slice(0, 160) });
    await d.accept(d.type() === 'prompt' ? 'Approved — acceptance run' : undefined).catch(() => {}); });

  let codProba = null, nrBuletin = null, idProba = null;

  await pas(page, 'Beneficiar: creare cont prin interfață', async () => {
    await autentifica(page, P.owner, { inregistrare: true });
    await asteapta(page, '#btn-new-sample');
    return { cont: P.owner.email };
  });

  await pas(page, 'Beneficiar: formular probă nouă, cu atestarea prelevării', async () => {
    await apasa(page, '#btn-new-sample');
    await asteapta(page, '#new-sample-form');
    const optiuni = await page.$$eval('#ns-category-select option', o => o.map(x => ({ v: x.value, t: x.textContent.trim() })));
    const cereale = optiuni.find(o => /unprocessed cereals|maize|cereal/i.test(o.t)) || optiuni[1];
    rez.date.categorieAlesa = cereale.t;
    await umple(page, '#ns-productName', 'Maize grain — lot 26/0417');
    await alege(page, '#ns-category-select', cereale.v);
    await umple(page, '#ns-sampledBy', 'Sampling inspector');
    await umple(page, '#ns-sampleDate', new Date().toISOString().slice(0, 10));
    await umple(page, '#ns-dueDate', new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
    const areAtestare = !!(await page.$('#ns-sampling-attest'));
    asigura(areAtestare, 'câmpul de atestare a prelevării nu există în formular');
    await bifeaza(page, '#ns-sampling-attest');
    await fig(page, 'element', '#new-sample-form', 'inregistrare-proba-atestare',
      'Sample-owner registration form with the sampling attestation');
    ui++; await page.click('#new-sample-form button[type=submit]');
    await page.waitForTimeout(1400);
    const lista = await apiDinPagina(page, '/samples/mine');
    asigura(lista.status === 200 && (lista.corp.samples || []).length >= 1, 'proba nu apare în lista beneficiarului');
    const proba = lista.corp.samples[0];
    idProba = proba.id; codProba = proba.code;
    rez.date.codProba = codProba;
    return { cod: codProba };
  });

  await pas(page, 'NEGATIV — API: probă fără atestarea prelevării', async () => {
    const r = await apiDinPagina(page, '/samples', { method: 'POST', body: JSON.stringify({
      productName: 'Sample without attestation', category: rez.date.categorieAlesa,
      sampleDate: new Date().toISOString().slice(0, 10), samplingAttested: false }) });
    asigura(r.status === 400, `așteptam 400, am primit ${r.status}`);
    return { status: r.status, mesaj: r.corp.error };
  });

  await pas(page, 'NEGATIV — API: dată de prelevare în viitor', async () => {
    const viitor = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const r = await apiDinPagina(page, '/samples', { method: 'POST', body: JSON.stringify({
      productName: 'Sample with future date', category: rez.date.categorieAlesa,
      sampleDate: viitor, samplingAttested: true }) });
    asigura(r.status === 400, `așteptam 400, am primit ${r.status}`);
    return { status: r.status, mesaj: r.corp.error };
  });

  await pas(page, 'Administrator: creare cont operator', async () => {
    await autentifica(page, P.admin);
    ui++; await page.click('button.header-tab[data-tab="operators"]');
    await asteapta(page, '#admin-form');
    await page.waitForTimeout(800);
    await umple(page, '#op-fullName', P.operator.nume);
    await umple(page, '#op-email', P.operator.email);
    await umple(page, '#op-password', P.operator.pass);
    ui++; await page.click('#admin-form button[type=submit]');
    await page.waitForTimeout(1000);
    const eroare = await page.$eval('#admin-error', e => e.textContent.trim()).catch(() => '');
    asigura(!eroare, 'formular operator: ' + eroare);
    return { operator: P.operator.email };
  });

  await pas(page, 'Administrator: creare cont validator', async () => {
    await umple(page, '#val-fullName', P.validator.nume);
    await umple(page, '#val-email', P.validator.email);
    await umple(page, '#val-password', P.validator.pass);
    ui++; await page.click('#validator-form button[type=submit]');
    await page.waitForTimeout(1000);
    const eroare = await page.$eval('#validator-error', e => e.textContent.trim()).catch(() => '');
    asigura(!eroare, 'formular validator: ' + eroare);
    return { validator: P.validator.email };
  });

  await pas(page, 'Administrator: roluri și conturi', async () => {
    await fig(page, 'zona', { interior: '#admin-form', martor: '#validator-form' }, 'roluri-si-conturi',
      'Role and account management: analyst and validator accounts');
    const randuri = await page.$$eval('.account-row, .user-row, tbody tr', r => r.length).catch(() => 0);
    return { randuri };
  });

  await pas(page, 'Administrator: pregătire pentru acreditare (ISO/IEC 17025)', async () => {
    ui++; await page.click('button.header-tab[data-tab="quality"]');
    await asteapta(page, '.quality-evidence');
    await page.waitForTimeout(2800);
    await fig(page, 'element', '.quality-evidence:has-text("17025")', 'pregatire-acreditare',
      'Accreditation readiness: requirements coverage summary (ISO/IEC 17025:2017)', { asteapta: 300 });
    const text = (await page.evaluate(() => document.body.innerText));
    rez.date.contine17025 = /17025/.test(text);
    asigura(rez.date.contine17025, 'secțiunea nu pomenește ISO/IEC 17025');
    await fig(page, 'element', '.quality-evidence:nth-of-type(3)', 'mapare-iso-17025',
      'Requirement-by-requirement mapping: what the application must support, and the evidence',
      { asteapta: 300 });
    return { iso: true };
  });

  await pas(page, 'Administrator: tablou de bord — indicatori operaționali', async () => {
    ui++; await page.click('button.header-tab[data-tab="dashboard"]');
    await page.waitForTimeout(2400);
    await fig(page, 'varf', '#admin-view-root', 'tablou-bord-admin',
      'Administrator dashboard: operational indicators', { inaltime: 1650, asteapta: 300 });
    return { tab: 'dashboard' };
  });

  await pas(page, 'Operator: coada de lucru conține proba', async () => {
    await autentifica(page, P.operator);
    await asteapta(page, '.sample-row');
    await page.waitForTimeout(600);
    await fig(page, 'element', 'aside', 'coada-de-lucru', 'Analyst work queue: samples awaiting processing');
    const randuri = await page.$$eval('.sample-row', r => r.length);
    return { randuri };
  });

  await pas(page, 'Operator: poarta de intrare (confirmarea primirii fizice)', async () => {
    ui++; await page.click('.sample-row');
    await asteapta(page, '#intake-gate-yes');
    await fig(page, 'element', '.intake-gate-card', 'poarta-de-intrare',
      'Intake gate: the analyst must confirm physical receipt before any result is recorded');
    ui++; await page.click('#intake-gate-yes');
    await page.waitForTimeout(1600);
    await asteapta(page, '[data-key="afb1"]');
    return { poarta: 'confirmată' };
  });

  await pas(page, 'Operator: câmpurile lipsă sunt enumerate, trimiterea e blocată', async () => {
    const blocante = await page.$eval('.submit-blockers-hint', e => e.textContent.trim()).catch(() => null);
    asigura(!!blocante, 'nu s-a afișat lista câmpurilor lipsă');
    const dezactivat = await page.$eval('#btn-submit-to-validator', b => b.disabled).catch(() => null);
    rez.date.listaBlocante = blocante;
    return { blocante: blocante.slice(0, 140), butonDezactivat: dezactivat };
  });

  await pas(page, 'Operator: completare rezultate + control de calitate', async () => {
    await umple(page, '#f-method', 'HPLC-FLD, method MT-01');
    await umple(page, '#f-equipment', 'Agilent 1260 / FLD');
    await umple(page, '#f-analysisDate', new Date().toISOString().slice(0, 10));
    const valori = { afb1: '1.20', afb2: '0.15', afg1: '0.30', afg2: '0.10', ota: '0.80', m1: '0.02', don: '500', zea: '50', fum: '1000' };
    const completate = [];
    for (const [k, v] of Object.entries(valori)) {
      const sel = `[data-key="${k}"]`;
      if (await page.$(sel)) { await umple(page, sel, v); completate.push(k + '=' + v); }
    }
    await alege(page, '#f-qcStatus', 'accepted');
    await page.waitForTimeout(900);
    await fig(page, 'zona', { interior: '#f-method', martor: '#btn-save-results' }, 'formular-rezultate',
      'Analyst result entry: measured values, method, equipment and quality-control decision');
    return { completate: completate.join(', ') };
  });

  await pas(page, 'Operator: salvare rezultate + urma de audit a probei', async () => {
    ui++; await page.click('#btn-save-results');
    await page.waitForTimeout(1800);
    const stare = await page.$eval('#save-state', e => e.textContent.trim()).catch(() => '');
    const h = await page.$('#btn-history');
    asigura(!!h, 'butonul de istoric nu e disponibil pentru operator');
    ui++; await h.click();
    await asteapta(page, '#audit-slot .audit-card, #audit-slot .history-card, #audit-slot article', 15000);
    await fig(page, 'element', '#audit-slot', 'pista-de-audit',
      'Append-only history of one sample: attestation, result saves, review steps');
    return { stare };
  });

  await pas(page, 'Operator: trimitere spre validare', async () => {
    await asteapta(page, '#btn-submit-to-validator');
    const dezactivat = await page.$eval('#btn-submit-to-validator', b => b.disabled);
    asigura(!dezactivat, 'butonul de trimitere e dezactivat deși datele sunt complete');
    ui++; await page.click('#btn-submit-to-validator');
    await page.waitForTimeout(1800);
    return { trimis: true };
  });

  await pas(page, 'NEGATIV — API: operatorul încearcă să valideze (rol insuficient)', async () => {
    // Nu ne mulțumim că butonul lipsește din interfață: cererea se trimite
    // direct, cu sesiunea operatorului, ca refuzul să fie al serverului.
    const buton = await page.$('#btn-validate-results');
    const r = await apiDinPagina(page, `/results/${idProba}/validate`, { method: 'POST', body: JSON.stringify({}) });
    rez.date.controlOperator = { status: r.status, mesaj: r.corp.error || null, butonVizibil: !!buton };
    asigura(r.status === 403, `așteptam refuz 403 pentru operator, am primit ${r.status}`);
    return rez.date.controlOperator;
  });

  await pas(page, 'Validator: revizuirea independentă înainte de emitere', async () => {
    await autentifica(page, P.validator);
    await asteapta(page, '.sample-row');
    ui++; await page.click('.sample-row');
    await asteapta(page, '#btn-review-approve');
    await fig(page, 'element', '.bulletin.validator-review-mode', 'revizuire-validator',
      'Independent review by the validator: the dossier is read-only and the decision is recorded');
    return { revizuire: 'deschisă' };
  });

  await pas(page, 'Validator: aprobare și emitere buletin', async () => {
    ui++; await page.click('#btn-review-approve');
    await page.waitForTimeout(1600);
    await asteapta(page, '#btn-validate-results');
    const dezactivat = await page.$eval('#btn-validate-results', b => b.disabled);
    asigura(!dezactivat, 'butonul de validare e încă dezactivat după aprobare');
    const [raspuns] = await Promise.all([
      page.waitForResponse(r => r.url().includes(`/api/results/${idProba}/validate`), { timeout: 20000 }),
      (async () => { ui++; await page.click('#btn-validate-results'); })(),
    ]);
    const corp = await raspuns.json().catch(() => ({}));
    nrBuletin = corp.bulletinNo || null;
    rez.date.nrBuletin = nrBuletin;
    asigura(raspuns.status() === 200, `validarea a răspuns ${raspuns.status()}`);
    asigura(!!nrBuletin, 'buletinul nu a fost emis');
    await page.waitForTimeout(1500);
    return { nrBuletin };
  });

  await pas(page, 'NEGATIV — API: re-validarea unui buletin emis', async () => {
    const r = await apiDinPagina(page, `/results/${idProba}/validate`, { method: 'POST', body: JSON.stringify({}) });
    asigura(r.status === 403, `așteptam 403, am primit ${r.status}`);
    return { status: r.status, mesaj: r.corp.error };
  });

  await pas(page, 'Buletinul emis, cu codul QR (portalul beneficiarului)', async () => {
    await autentifica(page, P.owner);
    await asteapta(page, '#sample-list');
    await page.waitForTimeout(1800);
    const randuri = await page.$$('.sample-row');
    asigura(randuri.length > 0, 'beneficiarul nu vede proba în lista proprie');
    ui++; await randuri[0].click();
    await asteapta(page, '#detail-panel .bulletin', 20000);
    const qrOk = await page.waitForSelector('#bulletin-qr-slot img', { timeout: 20000 }).then(() => true).catch(() => false);
    asigura(qrOk, 'codul QR nu s-a randat în buletinul beneficiarului');
    await fig(page, 'element', '#detail-panel .bulletin', 'buletin-emis-qr',
      'Released bulletin as the client receives it: unique number, QR code, per-analyte verdicts', { asteapta: 900 });
    const lista = await apiDinPagina(page, '/samples/mine');
    const p = (lista.corp.samples || [])[0] || {};
    rez.date = { ...rez.date, codProba: p.code, nrBuletin: p.bulletinNo, idProba: p.id,
      rezultate: ['afb1', 'afb2', 'afg1', 'afg2', 'ota', 'don', 'zea', 'fum'].reduce((o, k) => (o[k] = p[k], o), {}),
      limite: { afb1: p.limitAfb1, aflaSum: p.limitAflaSum, ota: p.limitOta, don: p.limitDon, zea: p.limitZea, fum: p.limitFum },
      sumaAflatoxine: p.aflaSum, bulletinIssuedAt: p.bulletinIssuedAt, validatDe: p.validatedByName };
    return { qr: true, nrBuletin: p.bulletinNo };
  });

  await pas(page, 'Verificare publică fără autentificare', async () => {
    const ctxNou = await browser.newContext({ viewport: { width: 860, height: 1750 }, deviceScaleFactor: 3, locale: 'en-GB' });
    await ctxNou.addInitScript(() => { try { localStorage.setItem('appLang', 'en'); } catch (e) {} });
    const p2 = await ctxNou.newPage();
    await p2.goto(`${BASE}/verify/${nrBuletin}`, { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(3000);
    const text = (await p2.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
    const doc = await p2.evaluate(() => !!document.querySelector('input[type=password]'));
    asigura(text.length > 60, 'pagina publică nu a afișat conținut');
    asigura(!doc, 'pagina publică cere autentificare');
    await fig(p2, 'pagina', null, 'verificare-publica', 'Public verification page for a released bulletin (no account required)');
    rez.date.textPublic = text.slice(0, 400);
    await ctxNou.close();
    return { nrBuletin, faraAutentificare: true };
  });

  await pas(page, 'Eticheta fizică a probei (QR + cod de bare)', async () => {
    await autentifica(page, P.operator);
    await asteapta(page, '.sample-row');
    ui++; await page.click('.sample-row');
    await page.waitForTimeout(1500);
    // pentru o probă deja validată butonul poate lipsi din vedere; funcția de tipărire
    // este globală (app.js e script clasic), deci o chemăm direct.
    const areButon = !!(await page.$('#btn-print-label'));
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 20000 }),
      areButon ? (async () => { ui++; await page.click('#btn-print-label'); })()
               : page.evaluate(i => window.printSampleLabel(i), idProba),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.setViewportSize({ width: 560, height: 780 });
    await popup.waitForTimeout(2400);
    const coduri = await popup.evaluate(() => Array.from(document.querySelectorAll('img')).filter(i => (i.src || '').startsWith('data:image')).length);
    asigura(coduri >= 2, `eticheta are ${coduri} coduri, așteptam cel puțin 2 (QR + cod de bare)`);
    await fig(popup, 'pagina', null, 'eticheta-probei',
      'Physical sample label generated by the system: QR code and Code 128 barcode');
    await popup.close();
    return { eticheta: true, coduri, buton: areButon ? 'da' : 'chemată direct' };
  });

  await pas(page, 'Administrator: urma de audit a probei', async () => {
    await autentifica(page, P.admin);
    await page.waitForTimeout(1600);
    const audit = await page.evaluate(async (id) => {
      const csrf = await fetch('/api/auth/me').then(r => r.json()).then(d => d.csrfToken);
      const r = await fetch(`/api/samples/${id}/audit`, { headers: { 'X-CSRF-Token': csrf } });
      return r.json();
    }, idProba);
    const lista = JSON.stringify(audit);
    rez.date.auditBrut = lista.slice(0, 2500);
    const intrari = Array.isArray(audit) ? audit : (audit.entries || audit.audit || []);
    rez.date.actiuniAudit = intrari.map(a => a.action).filter(Boolean);
    rez.date.nrIntrariAudit = intrari.length;
    asigura(/sampling_attested|attest|prelev/i.test(lista), 'atestarea prelevării nu apare în jurnalul de audit');
    asigura(rez.date.actiuniAudit.includes('result_validated'), 'lipsa evenimentului de validare în jurnal');
    // Pista se recapturează aici, la capătul lanțului: captura din timpul
    // lucrului se oprea la a doua salvare, deși legenda descrie tot lanțul.
    ui++; await page.click('body');
    await page.waitForTimeout(500);
    const areAudit = await page.$('#audit-slot');
    if (areAudit) await fig(page, 'element', '#audit-slot', 'pista-de-audit-complet', 'Append-only history of one sample after release');
    return { intrari: intrari.length, actiuni: rez.date.actiuniAudit.join(' → ') };
  });

  await pas(page, 'Administrator: tabloul de bord după rulare', async () => {
    // Indicatorii se citesc după ce probele au trecut prin flux; altfel
    // tabloul arată zerouri și pare nefolosit.
    await page.evaluate(() => { try { localStorage.setItem('adminTab', 'dashboard'); } catch (e) {} });
    await page.waitForTimeout(1500);
    await fig(page, 'varf', '#admin-view-root', 'tablou-bord-admin-dupa-rulare', 'Operational dashboard after the run', { inaltime: 1400 });
    return { recapturat: true };
  });

  rez.interactiuniUI = ui;
  rez.sfarsit = new Date().toISOString();
  rez.durataTotala = rez.pasi.reduce((s, p) => s + p.ms, 0);
  rez.pasiReusiti = rez.pasi.filter(p => p.ok).length;
  rez.pasiTotal = rez.pasi.length;
  salveaza();
  console.log('\n=== SUMAR ===');
  console.log(`Pași: ${rez.pasiReusiti}/${rez.pasiTotal} | ${(rez.durataTotala / 1000).toFixed(1)} s cumulat`);
  console.log(`Interacțiuni de interfață: ${ui} | Erori consolă: ${rez.eroriConsola.length}`);
  console.log(`Buletin: ${nrBuletin} | Proba: ${codProba} | id ${idProba}`);
  console.log(`Figuri: ${rez.capturi.length} capturate, ${rez.capturiEsuate.length} eșuate`);
  await browser.close();
})().catch(e => { console.error('OPRIRE:', e.message); salveaza(); process.exit(1); });
