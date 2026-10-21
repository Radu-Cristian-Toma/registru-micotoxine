// Etapa C3/C4 — interfața pentru: registru de echipamente și loturi (L14), controale QC (L13),
// starea probei la recepție (L16), baza de raportare și date de laborator (L22, L15),
// retragerea trasabilă a valorilor (L20), starea buletinului (L10), politici (L17, L12) și
// exportul dosarului (L12). Se încarcă între i18n.js și app.js; folosește t(), bt(), api(),
// escapeHtml() și showToast() din celelalte fișiere.
(function () {
  const D = (ro, en) => ({ ro, en });
  Object.assign(TRANSLATIONS, {
    lab: {
      tab: D('Laborator', 'Laboratory'),
      title: D('Laborator: echipamente, loturi și controale QC', 'Laboratory: equipment, lots and QC controls'),
      intro: D('Registrul este evidența laboratorului; fiecare rezultat poate indica echipamentele și loturile folosite. Trimiterea spre validare cere calibrare valabilă și lot neexpirat la data analizei.', 'The register is the laboratory’s record; each result can name the equipment and lots used. Submission for validation requires a valid calibration and an unexpired lot at the analysis date.'),
      equipment: D('Echipamente', 'Equipment'), lots: D('Loturi de reactivi și materiale de referință', 'Reagent lots and reference materials'),
      qc: D('Controale QC', 'QC controls'), qcStatus: D('Stare pe grup de analiți', 'Status by analyte group'),
      code: D('Cod', 'Code'), name: D('Denumire', 'Name'), type: D('Tip', 'Type'), serial: D('Serie', 'Serial no.'), location: D('Loc', 'Location'),
      calDate: D('Calibrat la', 'Calibrated on'), calDue: D('Scadență calibrare', 'Calibration due'), calRef: D('Certificat / referință', 'Certificate / reference'),
      status: D('Stare', 'Status'), active: D('activ', 'active'), retired: D('scos din uz', 'retired'),
      calOk: D('valabilă', 'valid'), calSoon: D('expiră în 30 de zile', 'due within 30 days'), calExpired: D('expirată', 'expired'), calUnknown: D('scadență neînregistrată', 'due date not recorded'),
      lotKind: D('Tip lot', 'Lot kind'), kindReagent: D('reactiv', 'reagent'), kindRef: D('material de referință', 'reference material'), kindStd: D('etalon', 'standard'), kindKit: D('kit', 'kit'),
      lotNo: D('Nr. lot', 'Lot no.'), supplier: D('Furnizor', 'Supplier'), expiry: D('Expiră la', 'Expires on'), group: D('Grup analiți', 'Analyte group'),
      certValue: D('Valoare certificată', 'Certified value'), certU: D('Incertitudine certificată', 'Certified uncertainty'), unit: D('Unitate', 'Unit'),
      expOk: D('neexpirat', 'not expired'), expSoon: D('expiră în 30 de zile', 'expires within 30 days'), expExpired: D('expirat', 'expired'), expUnknown: D('fără dată de expirare', 'no expiry date'),
      add: D('Adaugă', 'Add'), save: D('Salvează', 'Save'), edit: D('Modifică', 'Edit'), retire: D('Scoate din uz', 'Retire'), reactivate: D('Reactivează', 'Reactivate'),
      saved: D('Salvat.', 'Saved.'), none: D('Nicio înregistrare.', 'No records.'),
      measured: D('Valoare măsurată', 'Measured value'), expected: D('Valoare așteptată', 'Expected value'), lowPct: D('Limita inferioară (% din așteptat)', 'Lower limit (% of expected)'), highPct: D('Limita superioară (% din așteptat)', 'Upper limit (% of expected)'),
      refLot: D('Lot de referință (opțional)', 'Reference lot (optional)'), notes: D('Observații', 'Notes'), recordQc: D('Înregistrează controlul', 'Record control'),
      qcRangeHint: D('Intervalul de acceptare îl stabilește laboratorul din validarea metodei [de completat de laborator]; aplicația nu propune valori.', 'The acceptance range is set by the laboratory from method validation [to be completed by the laboratory]; the application does not suggest values.'),
      qcOk: D('în termen', 'current'), qcStale: D('control prea vechi', 'control too old'), qcFailed: D('ultimul control a eșuat', 'last control failed'), qcNone: D('fără control', 'no control'),
      recovery: D('Recuperare', 'Recovery'), outcome: D('Rezultat', 'Outcome'), pass: D('în interval', 'within range'), fail: D('în afara intervalului', 'outside range'), by: D('Înregistrat de', 'Recorded by'), when: D('Data', 'Date'),
      maxAge: D('Interval maxim de la ultimul control', 'Maximum age of last control'), days: D('zile', 'days'),
      // formular rezultat
      extrasTitle: D('Date de laborator și trasabilitate', 'Laboratory data and traceability'),
      basis: D('Baza de raportare', 'Reporting basis'), basisAsIs: D('Masă proaspătă (ca atare)', 'As received (fresh mass)'), basisDry: D('Substanță uscată', 'Dry matter'),
      dryPct: D('Substanță uscată (%)', 'Dry matter (%)'), basisHint: D('Limitele pentru alimentele pentru sugari se referă la substanța uscată (Reg. 2023/915, anexa I); baza o alege operatorul.', 'Limits for infant foods refer to dry matter (Reg. 2023/915, Annex I); the operator chooses the basis.'),
      labMass: D('Masa probei de laborator (g)', 'Laboratory sample mass (g)'), homog: D('Omogenizare / pregătire', 'Homogenisation / preparation'), replicates: D('Replici', 'Replicates'),
      eqPick: D('Echipamente folosite', 'Equipment used'), lotPick: D('Loturi folosite', 'Lots used'), noRegistry: D('Registrul este gol; completează-l în fila „Laborator”.', 'The register is empty; fill it in under “Laboratory”.'),
      clearTitle: D('Retragerea unei valori introduse greșit', 'Withdrawing a value entered in error'), clearHint: D('Valoarea se șterge, iar motivul și valoarea anterioară rămân în jurnalul de audit și în versiuni.', 'The value is removed; the reason and the previous value remain in the audit log and versions.'),
      clearField: D('Valoarea de retras', 'Value to withdraw'), clearReason: D('Motivul retragerii', 'Reason for withdrawal'), clearNone: D('— niciuna —', '— none —'),
      // recepție
      intakeTitle: D('Starea probei la recepție', 'Sample condition at receipt'), packaging: D('Ambalaj', 'Packaging'), pkgIntact: D('intact', 'intact'), pkgDamaged: D('deteriorat', 'damaged'), pkgOpened: D('deschis', 'opened'),
      qtyOk: D('Cantitate suficientă pentru analiză', 'Quantity adequate for analysis'), tempC: D('Temperatură la recepție (°C, opțional)', 'Temperature at receipt (°C, optional)'), transport: D('Transport', 'Transport'),
      intakeNotes: D('Observații la recepție', 'Receipt notes'), intakeNotRecorded: D('Starea probei la recepție nu a fost înregistrată.', 'Sample condition at receipt was not recorded.'),
      // buletin
      bulSampleCond: D('Starea probei la recepție', 'Sample condition at receipt'), bulBasis: D('Baza de raportare', 'Reporting basis'), bulLabSample: D('Proba de laborator', 'Laboratory sample'),
      bulSampling: D('Date de prelevare declarate de beneficiar', 'Sampling data declared by the client'), bulLot: D('Dimensiunea lotului', 'Lot size'), bulIncr: D('Probe elementare', 'Increments'), bulMethod: D('Metodă / plan de prelevare', 'Sampling method / plan'),
      bulTrace: D('Echipamente și loturi folosite', 'Equipment and lots used'), bulCalDue: D('calibrare până la', 'calibrated until'), bulExpires: D('expiră', 'expires'), bulMass: D('masă', 'mass'), bulRepl: D('replici', 'replicates'),
      samplingDisclaimer: D('Laboratorul nu a fost responsabil de etapa de prelevare.', 'The laboratory was not responsible for the sampling stage.'),
      // stare buletin
      lcWithdrawn: D('BULETIN RETRAS', 'BULLETIN WITHDRAWN'), lcSuperseded: D('BULETIN ÎNLOCUIT', 'BULLETIN SUPERSEDED'),
      lcWithdrawnText: D('Acest buletin nu mai este valabil.', 'This bulletin is no longer valid.'), lcSupersededText: D('Acest buletin a fost înlocuit de buletinul', 'This bulletin has been replaced by bulletin'),
      lcReason: D('Motiv', 'Reason'), lcOn: D('la', 'on'),
      withdrawBtn: D('Retrage buletinul', 'Withdraw bulletin'), supersedeBtn: D('Marchează ca înlocuit', 'Mark as superseded'), dossierBtn: D('Exportă dosarul', 'Export file'),
      withdrawPrompt: D('Motivul retragerii (rămâne în jurnalul de audit):', 'Reason for withdrawal (kept in the audit log):'),
      supersedePrompt: D('Motivul înlocuirii (rămâne în jurnalul de audit):', 'Reason for replacement (kept in the audit log):'),
      replacementPrompt: D('Codul probei al cărei buletin îl înlocuiește (ex. MYC-2026-0002):', 'Code of the sample whose bulletin replaces it (e.g. MYC-2026-0002):'),
      replacementUnknown: D('Nu am găsit o probă cu acest cod în coadă.', 'No sample with this code was found in the queue.'),
      lcDone: D('Starea buletinului a fost înregistrată.', 'Bulletin status recorded.'),
      // politici
      policyTitle: D('Politici de laborator', 'Laboratory policies'), strictRoles: D('Separarea sarcinilor activă', 'Segregation of duties active'),
      strictHint: D('Activă: administratorul nu introduce, nu aprobă și nu validează; cine a aprobat o probă nu o validează. Relaxarea cere motiv și este jurnalizată.', 'Active: the administrator does not enter, review or validate; whoever reviewed a sample does not validate it. Relaxing requires a reason and is logged.'),
      relaxReason: D('Motivul relaxării (obligatoriu)', 'Reason for relaxing (required)'), retention: D('Perioada de retenție a dosarelor (ani)', 'File retention period (years)'),
      retentionHint: D('Perioada o stabilește laboratorul [de completat]; apare în dosarul exportat.', 'Set by the laboratory [to be completed]; shown in the exported file.'),
      qcAge: D('Interval maxim de la ultimul control QC (zile; 0 = fără avertisment)', 'Maximum age of last QC control (days; 0 = no warning)'),
      sampLot: D('Dimensiunea lotului (kg, opțional)', 'Lot size (kg, optional)'), sampIncr: D('Număr de probe elementare (opțional)', 'Number of increments (optional)'), sampMethod: D('Metodă / plan de prelevare declarat (opțional)', 'Declared sampling method / plan (optional)'),
      sampHint: D('Datele de prelevare sunt declarate de beneficiar; laboratorul nu răspunde de prelevare.', 'Sampling data are declared by the client; the laboratory is not responsible for sampling.')
    }
  });

  const L = (k) => t('lab.' + k);
  const esc = (v) => escapeHtml(v === null || v === undefined ? '' : String(v));
  const isStaff = () => ['operator', 'validator', 'admin'].includes(currentUser.role);
  const canEditRegistry = () => ['operator', 'admin'].includes(currentUser.role);
  const calLabel = (s) => ({ ok: L('calOk'), due_soon: L('calSoon'), expired: L('calExpired'), unknown: L('calUnknown') }[s] || s);
  const expLabel = (s) => ({ ok: L('expOk'), due_soon: L('expSoon'), expired: L('expExpired'), unknown: L('expUnknown') }[s] || s);
  const stateClass = (s) => (s === 'expired' || s === 'failed' ? 'fail' : (s === 'due_soon' || s === 'stale' ? 'warn' : (s === 'ok' ? 'ok' : 'empty')));
  const chip = (s, label) => `<span class="result-flag ${stateClass(s)}">${esc(label)}</span>`;
  const KIND = () => ({ reagent: L('kindReagent'), reference_material: L('kindRef'), standard: L('kindStd'), kit: L('kindKit') });
  const GROUP_LABEL = { aflatoxins: 'Aflatoxine / Aflatoxins', ota: 'OTA', m1: 'M1', don: 'DON', zea: 'ZEA', fum: 'FB1+FB2' };

  // --- registru în memorie, folosit de formularul rezultatelor -------------------------
  let registry = { equipment: [], lots: [] };
  window.ensureLabRegistry = async function () {
    if (!isStaff()) return registry;
    try {
      const [e, l] = await Promise.all([api('/lab/equipment'), api('/lab/reagent-lots')]);
      registry = { equipment: e.equipment || [], lots: l.lots || [] };
    } catch (_) { /* registrul lipsă nu blochează formularul */ }
    return registry;
  };
  const parseIds = (json) => { try { const a = json ? JSON.parse(json) : []; return Array.isArray(a) ? a : []; } catch (_) { return []; } };

  // --- formularul rezultatelor: baza, date de laborator, echipamente, loturi, retragere -------------
  window.labExtrasFormHtml = function (sample) {
    const selEq = parseIds(sample.equipmentIdsJson); const selLot = parseIds(sample.reagentLotIdsJson);
    const eq = registry.equipment.filter(e => e.status === 'active' || selEq.includes(e.id));
    const lots = registry.lots.filter(l => l.status === 'active' || selLot.includes(l.id));
    const basis = sample.reportingBasis || 'as_is';
    const valueKeys = ['afb1', 'afb2', 'afg1', 'afg2', 'ota', 'm1', 'don', 'zea', 'fum'].filter(k => sample[k] !== null && sample[k] !== undefined);
    return `
      <div class="lab-extras" id="lab-extras">
        <div class="section-label"><span>${L('extrasTitle')}</span></div>
        <div class="lab-grid">
          <div class="field"><label for="f-basis">${L('basis')}</label>
            <select id="f-basis"><option value="as_is" ${basis === 'as_is' ? 'selected' : ''}>${L('basisAsIs')}</option><option value="dry_matter" ${basis === 'dry_matter' ? 'selected' : ''}>${L('basisDry')}</option></select>
            <div class="section-hint">${L('basisHint')}</div></div>
          <div class="field"><label for="f-drymatter">${L('dryPct')}</label><input type="number" step="0.1" min="0" max="100" id="f-drymatter" value="${esc(sample.dryMatterPct ?? '')}"></div>
          <div class="field"><label for="f-labmass">${L('labMass')}</label><input type="number" step="0.1" min="0" id="f-labmass" value="${esc(sample.labSampleMassG ?? '')}"></div>
          <div class="field"><label for="f-replicates">${L('replicates')}</label><input type="number" step="1" min="1" max="20" id="f-replicates" value="${esc(sample.replicates ?? '')}"></div>
          <div class="field" style="grid-column:1/-1"><label for="f-homog">${L('homog')}</label><input type="text" id="f-homog" maxlength="300" value="${esc(sample.homogenization || '')}"></div>
        </div>
        <div class="lab-pick">
          <div class="field"><label>${L('eqPick')}</label>
            ${eq.length ? eq.map(e => `<label class="checkbox-row"><input type="checkbox" class="f-eq" value="${e.id}" ${selEq.includes(e.id) ? 'checked' : ''}> <span><strong>${esc(e.code)}</strong> ${esc(e.name)} ${chip(e.calibrationState, calLabel(e.calibrationState) + (e.calibrationDue ? ' · ' + e.calibrationDue : ''))}${e.status !== 'active' ? ' ' + chip('expired', L('retired')) : ''}</span></label>`).join('') : `<div class="section-hint">${L('noRegistry')}</div>`}</div>
          <div class="field"><label>${L('lotPick')}</label>
            ${lots.length ? lots.map(l => `<label class="checkbox-row"><input type="checkbox" class="f-lot" value="${l.id}" ${selLot.includes(l.id) ? 'checked' : ''}> <span><strong>${esc(l.code)}</strong> ${esc(l.name)} · ${esc(l.lotNo)} ${chip(l.expiryState, expLabel(l.expiryState) + (l.expiryDate ? ' · ' + l.expiryDate : ''))}${l.status !== 'active' ? ' ' + chip('expired', L('retired')) : ''}</span></label>`).join('') : `<div class="section-hint">${L('noRegistry')}</div>`}</div>
        </div>
        ${valueKeys.length ? `<details class="lab-clear"><summary>${L('clearTitle')}</summary>
          <div class="section-hint">${L('clearHint')}</div>
          <div class="lab-grid"><div class="field"><label for="f-clear-field">${L('clearField')}</label>
            <select id="f-clear-field"><option value="">${L('clearNone')}</option>${valueKeys.map(k => `<option value="${k}">${k.toUpperCase()} = ${esc(sample[k])}</option>`).join('')}</select></div>
            <div class="field"><label for="f-clear-reason">${L('clearReason')}</label><input type="text" id="f-clear-reason" maxlength="300"></div></div></details>` : ''}
      </div>`;
  };
  window.collectLabExtras = function () {
    const val = (id) => document.getElementById(id)?.value ?? '';
    const x = {};
    if (!document.getElementById('lab-extras')) return x;
    x.reportingBasis = val('f-basis');
    if (val('f-drymatter') !== '') x.dryMatterPct = val('f-drymatter');
    if (val('f-labmass') !== '') x.labSampleMassG = val('f-labmass');
    if (val('f-replicates') !== '') x.replicates = val('f-replicates');
    if (val('f-homog').trim() !== '') x.homogenization = val('f-homog').trim();
    x.equipmentIds = [...document.querySelectorAll('.f-eq:checked')].map(i => Number(i.value));
    x.reagentLotIds = [...document.querySelectorAll('.f-lot:checked')].map(i => Number(i.value));
    const cf = val('f-clear-field');
    if (cf) { x.clearFields = [cf]; x.clearReason = val('f-clear-reason').trim(); }
    return x;
  };

  // --- poarta de recepție: starea probei -----------------------------------------------
  window.intakeGateFieldsHtml = function () {
    return `<div class="intake-condition">
      <h4>${L('intakeTitle')}</h4>
      <div class="lab-grid">
        <div class="field"><label for="ic-packaging">${L('packaging')}</label>
          <select id="ic-packaging"><option value="intact">${L('pkgIntact')}</option><option value="damaged">${L('pkgDamaged')}</option><option value="opened">${L('pkgOpened')}</option></select></div>
        <div class="field"><label for="ic-temp">${L('tempC')}</label><input type="number" step="0.1" id="ic-temp"></div>
        <div class="field"><label for="ic-transport">${L('transport')}</label><input type="text" id="ic-transport" maxlength="200"></div>
        <div class="field"><label class="checkbox-row"><input type="checkbox" id="ic-qty" checked> ${L('qtyOk')}</label></div>
        <div class="field" style="grid-column:1/-1"><label for="ic-notes">${L('intakeNotes')}</label><input type="text" id="ic-notes" maxlength="300"></div>
      </div></div>`;
  };
  window.collectIntakeCondition = function () {
    const v = (id) => document.getElementById(id)?.value ?? '';
    const c = { packaging: v('ic-packaging') || 'intact', quantityAdequate: !!document.getElementById('ic-qty')?.checked, transport: v('ic-transport').trim(), notes: v('ic-notes').trim() };
    if (v('ic-temp') !== '') c.temperatureC = Number(v('ic-temp'));
    return c;
  };

  // --- înregistrarea probei de către beneficiar: date de prelevare --------------------------
  window.samplingFieldsHtml = function () {
    return `<div class="field"><label for="ns-lotSize">${L('sampLot')}</label><input type="number" step="1" min="0" id="ns-lotSize"></div>
      <div class="field"><label for="ns-increments">${L('sampIncr')}</label><input type="number" step="1" min="1" max="1000" id="ns-increments"></div>
      <div class="field"><label for="ns-samplingMethod">${L('sampMethod')}</label><input type="text" id="ns-samplingMethod" maxlength="300"><div class="section-hint">${L('sampHint')}</div></div>`;
  };
  window.collectSamplingFields = function () {
    const v = (id) => (document.getElementById(id)?.value ?? '').trim();
    const x = {};
    if (v('ns-lotSize') !== '') x.lotSizeKg = v('ns-lotSize');
    if (v('ns-increments') !== '') x.incrementsCount = v('ns-increments');
    if (v('ns-samplingMethod') !== '') x.samplingMethod = v('ns-samplingMethod');
    return x;
  };

  // --- starea buletinului -----------------------------------------------------------------
  window.lifecycleBannerHtml = function (lc) {
    if (!lc || lc.state === 'valid' || !lc.state) return '';
    const withdrawn = lc.state === 'withdrawn';
    return `<div class="lifecycle-banner ${withdrawn ? 'withdrawn' : 'superseded'}" role="alert">
      <strong>${withdrawn ? bt('lab.lcWithdrawn') : bt('lab.lcSuperseded')}</strong>
      <div>${withdrawn ? L('lcWithdrawnText') : `${L('lcSupersededText')} <span class="mono">${esc(lc.replacedByBulletinNo || '')}</span>.`}</div>
      <div class="section-hint">${L('lcReason')}: ${esc(lc.reason || '')} · ${L('lcOn')} ${esc(lc.at || '')}</div></div>`;
  };

  const intakeText = (c) => {
    if (!c) return L('intakeNotRecorded');
    if (c.packaging === 'not_recorded') return L('intakeNotRecorded');
    const pk = { intact: L('pkgIntact'), damaged: L('pkgDamaged'), opened: L('pkgOpened') }[c.packaging] || c.packaging;
    return [`${L('packaging')}: ${pk}`, c.quantityAdequate ? L('qtyOk') : null, c.temperatureC !== undefined ? `${c.temperatureC} °C` : null, c.transport || null, c.notes || null].filter(Boolean).map(esc).join(' · ');
  };

  window.loadBulletinLab = async function (sample) {
    const slot = document.getElementById('bulletin-lab-slot');
    if (!slot) return;
    let html = '';
    if (sample.bulletinNo) {
      try {
        const d = await api(`/results/${sample.id}/bulletin-snapshot`);
        const s = d.snapshot || {};
        const tr = s.traceability || { equipment: [], lots: [] };
        const smp = s.samplingDeclared || {};
        const ls = s.labSample || {};
        html += `<div class="bulletin-lab section-hint" style="margin:8px 0;">
          <div class=\"lab-line\"><strong>${bt('lab.bulSampleCond')}</strong><div>${intakeText(s.intake)}</div>
          <div class=\"lab-line\"><strong>${bt('lab.bulBasis')}</strong><div>${s.reportingBasis === 'dry_matter' ? L('basisDry') + (s.dryMatterPct != null ? ` (${esc(s.dryMatterPct)} %)` : '') : L('basisAsIs')}</div>
          ${(ls.massG != null || ls.homogenization || ls.replicates != null) ? `<div class=\"lab-line\"><strong>${bt('lab.bulLabSample')}</strong><div>${[ls.massG != null ? `${L('bulMass')} ${esc(ls.massG)} g` : null, ls.homogenization ? esc(ls.homogenization) : null, ls.replicates != null ? `${esc(ls.replicates)} ${L('bulRepl')}` : null].filter(Boolean).join(' · ')}</div>` : ''}
          ${(smp.lotSizeKg != null || smp.incrementsCount != null || smp.samplingMethod) ? `<div class=\"lab-line\"><strong>${bt('lab.bulSampling')}</strong><div>${[smp.lotSizeKg != null ? `${L('bulLot')} ${esc(smp.lotSizeKg)} kg` : null, smp.incrementsCount != null ? `${L('bulIncr')} ${esc(smp.incrementsCount)}` : null, smp.samplingMethod ? esc(smp.samplingMethod) : null].filter(Boolean).join(' · ')} — <em>${L('samplingDisclaimer')}</em></div>` : ''}
          ${(tr.equipment.length || tr.lots.length) ? `<div class=\"lab-line\"><strong>${bt('lab.bulTrace')}</strong><div>${[...tr.equipment.map(e => `${esc(e.code)} ${esc(e.name)}${e.calibrationDue ? ` (${L('bulCalDue')} ${esc(e.calibrationDue)})` : ''}`), ...tr.lots.map(l => `${esc(l.code)} ${esc(l.name)} ${esc(l.lotNo)}${l.expiryDate ? ` (${L('bulExpires')} ${esc(l.expiryDate)})` : ''}`)].join('; ')}</div>` : ''}
        </div>`;
      } catch (_) { /* instantaneul poate lipsi la buletine mai vechi */ }
    }
    const lcSlot = document.getElementById('bulletin-lifecycle-slot');
    if (lcSlot) lcSlot.innerHTML = lifecycleBannerHtml(sample.bulletinLifecycle);
    if (isStaff() && sample.bulletinNo) {
      const lcValid = !sample.bulletinLifecycle || sample.bulletinLifecycle.state === 'valid';
      const canChange = ['validator', 'admin'].includes(currentUser.role) && lcValid;
      html += `<div class="bulletin-lab-actions no-print">
        ${canChange ? `<button type="button" class="btn secondary small-btn" id="btn-lc-withdraw">${L('withdrawBtn')}</button>
        <button type="button" class="btn secondary small-btn" id="btn-lc-supersede">${L('supersedeBtn')}</button>` : ''}
        <button type="button" class="btn secondary small-btn" id="btn-dossier">${L('dossierBtn')}</button></div>`;
    }
    slot.innerHTML = html;
    document.getElementById('btn-lc-withdraw')?.addEventListener('click', async () => {
      const reason = (window.prompt(t('lab.withdrawPrompt')) || '').trim();
      if (!reason) return;
      await lifecycleCall(sample, 'withdraw', { reason });
    });
    document.getElementById('btn-lc-supersede')?.addEventListener('click', async () => {
      const reason = (window.prompt(t('lab.supersedePrompt')) || '').trim();
      if (!reason) return;
      const code = (window.prompt(t('lab.replacementPrompt')) || '').trim();
      if (!code) return;
      let list = [];
      try { list = (await api('/results/queue')).samples || []; } catch (_) { list = []; }
      const rep = list.find(s => s.code === code && s.bulletinNo);
      if (!rep) { showToast(t('lab.replacementUnknown')); return; }
      await lifecycleCall(sample, 'supersede', { reason, replacedBySampleId: rep.id });
    });
    document.getElementById('btn-dossier')?.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/lab/dossier/${sample.id}`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.status);
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `dosar-${sample.code}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (err) { showToast(String(err.message || err)); }
    });
  };
  async function lifecycleCall(sample, action, body) {
    try {
      const r = await api(`/lab/bulletins/${sample.id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      sample.bulletinLifecycle = r.lifecycle;
      showToast(t('lab.lcDone'));
      await window.loadBulletinLab(sample);
    } catch (err) { showToast(String(err.message || err)); }
  }

  // --- fila „Laborator”: registru și controale QC --------------------------------------------
  const fld = (id, label, type = 'text', extra = '') => `<div class="field"><label for="${id}">${label}</label><input type="${type}" id="${id}" ${extra}></div>`;
  window.renderLabView = async function (rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.innerHTML = `<div class="admin-panel view-transition"><div class="admin-section-head"><div><div class="eyebrow">${L('tab')}</div><h2>${L('title')}</h2><p>${L('intro')}</p></div></div><div id="lab-body"></div></div>`;
    await refreshLabBody();
  };
  async function refreshLabBody() {
    const body = document.getElementById('lab-body');
    if (!body) return;
    let eq = [], lots = [], ctl = [], st = { groups: [], maxAgeDays: 7 };
    try {
      const r = await Promise.all([api('/lab/equipment'), api('/lab/reagent-lots'), api('/lab/qc-controls'), api('/lab/qc-status')]);
      eq = r[0].equipment; lots = r[1].lots; ctl = r[2].controls; st = r[3];
    } catch (err) { body.innerHTML = `<p class="section-hint">${esc(err.message)}</p>`; return; }
    registry = { equipment: eq, lots };
    const edit = canEditRegistry();
    const stateLabel = (s) => ({ ok: L('qcOk'), stale: L('qcStale'), failed: L('qcFailed'), none: L('qcNone') }[s]);
    body.innerHTML = `
      <section class="lab-section"><h3>${L('qcStatus')}</h3>
        <div class="lab-status-grid">${st.groups.map(g => `<div class="lab-status-card">${chip(g.state, stateLabel(g.state))}<strong>${esc(GROUP_LABEL[g.analyteGroup])}</strong>${g.last ? `<span class="section-hint">${esc(g.last.createdAt)} · ${L('recovery')} ${Math.round(g.last.recoveryPct * 10) / 10} %</span>` : ''}</div>`).join('')}</div>
        <p class="section-hint">${L('maxAge')}: ${esc(st.maxAgeDays)} ${L('days')}.</p></section>
      ${edit ? `<section class="lab-section"><h3>${L('qc')}</h3><p class="section-hint">${L('qcRangeHint')}</p>
        <div class="lab-grid">
          <div class="field"><label for="qc-group">${L('group')}</label><select id="qc-group">${Object.keys(GROUP_LABEL).map(k => `<option value="${k}">${esc(GROUP_LABEL[k])}</option>`).join('')}</select></div>
          <div class="field"><label for="qc-lot">${L('refLot')}</label><select id="qc-lot"><option value="">—</option>${lots.filter(l => l.status === 'active').map(l => `<option value="${l.id}">${esc(l.code)} · ${esc(l.name)}</option>`).join('')}</select></div>
          ${fld('qc-measured', L('measured'), 'number', 'step="any" min="0"')}${fld('qc-expected', L('expected'), 'number', 'step="any" min="0"')}
          ${fld('qc-low', L('lowPct'), 'number', 'step="any" min="0"')}${fld('qc-high', L('highPct'), 'number', 'step="any" min="0"')}
          ${fld('qc-notes', L('notes'), 'text', 'maxlength="300"')}
        </div><button class="btn" id="btn-qc-add">${L('recordQc')}</button></section>` : ''}
      <section class="lab-section"><h3>${L('qc')}</h3>${ctl.length ? `<div class="table-scroll"><table class="contaminants"><thead><tr><th>${L('when')}</th><th>${L('group')}</th><th>${L('measured')}</th><th>${L('expected')}</th><th>${L('recovery')}</th><th>${L('outcome')}</th><th>${L('by')}</th></tr></thead><tbody>
        ${ctl.map(c => `<tr><td class="mono">${esc(c.createdAt)}</td><td>${esc(GROUP_LABEL[c.analyteGroup])}</td><td class="mono">${esc(c.measuredValue)}</td><td class="mono">${esc(c.expectedValue)}</td><td class="mono">${Math.round(c.recoveryPct * 10) / 10} % <span class="section-hint">(${esc(c.acceptLowPct)}–${esc(c.acceptHighPct)})</span></td><td>${chip(c.outcome === 'pass' ? 'ok' : 'failed', c.outcome === 'pass' ? L('pass') : L('fail'))}</td><td>${esc(c.byName || '')}</td></tr>`).join('')}</tbody></table></div>` : `<p class="section-hint">${L('none')}</p>`}</section>
      <section class="lab-section"><h3>${L('equipment')}</h3>
        ${eq.length ? `<div class="table-scroll"><table class="contaminants"><thead><tr><th>${L('code')}</th><th>${L('name')}</th><th>${L('calDue')}</th><th>${L('calRef')}</th><th>${L('status')}</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
        ${eq.map(e => `<tr><td class="mono">${esc(e.code)}</td><td>${esc(e.name)}<div class="section-hint">${esc(e.type || '')} ${esc(e.serialNo || '')} ${esc(e.location || '')}</div></td><td>${chip(e.calibrationState, calLabel(e.calibrationState))}<div class="mono">${esc(e.calibrationDue || '')}</div></td><td>${esc(e.calibrationRef || '')}</td><td>${e.status === 'active' ? L('active') : L('retired')}</td>${edit ? `<td><button class="btn secondary small-btn btn-eq-edit" data-id="${e.id}">${L('edit')}</button> <button class="btn secondary small-btn btn-eq-status" data-id="${e.id}" data-status="${e.status === 'active' ? 'retired' : 'active'}">${e.status === 'active' ? L('retire') : L('reactivate')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : `<p class="section-hint">${L('none')}</p>`}
        ${edit ? `<div class="lab-grid" id="eq-form"><input type="hidden" id="eq-id">${fld('eq-code', L('code'), 'text', 'maxlength="40"')}${fld('eq-name', L('name'), 'text', 'maxlength="200"')}${fld('eq-type', L('type'), 'text', 'maxlength="100"')}${fld('eq-serial', L('serial'), 'text', 'maxlength="100"')}${fld('eq-location', L('location'), 'text', 'maxlength="100"')}${fld('eq-caldate', L('calDate'), 'date')}${fld('eq-caldue', L('calDue'), 'date')}${fld('eq-calref', L('calRef'), 'text', 'maxlength="200"')}</div><button class="btn" id="btn-eq-save">${L('save')}</button>` : ''}</section>
      <section class="lab-section"><h3>${L('lots')}</h3>
        ${lots.length ? `<div class="table-scroll"><table class="contaminants"><thead><tr><th>${L('code')}</th><th>${L('name')}</th><th>${L('lotKind')}</th><th>${L('expiry')}</th><th>${L('certValue')}</th><th>${L('status')}</th>${edit ? '<th></th>' : ''}</tr></thead><tbody>
        ${lots.map(l => `<tr><td class="mono">${esc(l.code)}</td><td>${esc(l.name)}<div class="section-hint">${esc(l.lotNo)} ${esc(l.supplier || '')}</div></td><td>${esc(KIND()[l.kind])}${l.analyteGroup ? ` · ${esc(GROUP_LABEL[l.analyteGroup] || l.analyteGroup)}` : ''}</td><td>${chip(l.expiryState, expLabel(l.expiryState))}<div class="mono">${esc(l.expiryDate || '')}</div></td><td class="mono">${l.certifiedValue != null ? `${esc(l.certifiedValue)}${l.certifiedU != null ? ' ± ' + esc(l.certifiedU) : ''} ${esc(l.unit || '')}` : '—'}</td><td>${l.status === 'active' ? L('active') : L('retired')}</td>${edit ? `<td><button class="btn secondary small-btn btn-lot-status" data-id="${l.id}" data-status="${l.status === 'active' ? 'retired' : 'active'}">${l.status === 'active' ? L('retire') : L('reactivate')}</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : `<p class="section-hint">${L('none')}</p>`}
        ${edit ? `<div class="lab-grid" id="lot-form">${fld('lot-code', L('code'), 'text', 'maxlength="40"')}${fld('lot-name', L('name'), 'text', 'maxlength="200"')}
          <div class="field"><label for="lot-kind">${L('lotKind')}</label><select id="lot-kind">${Object.entries(KIND()).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          ${fld('lot-no', L('lotNo'), 'text', 'maxlength="100"')}${fld('lot-supplier', L('supplier'), 'text', 'maxlength="200"')}${fld('lot-expiry', L('expiry'), 'date')}
          <div class="field"><label for="lot-group">${L('group')}</label><select id="lot-group"><option value="">—</option>${Object.keys(GROUP_LABEL).map(k => `<option value="${k}">${esc(GROUP_LABEL[k])}</option>`).join('')}</select></div>
          ${fld('lot-cert', L('certValue'), 'number', 'step="any" min="0"')}${fld('lot-certu', L('certU'), 'number', 'step="any" min="0"')}${fld('lot-unit', L('unit'), 'text', 'maxlength="30"')}</div><button class="btn" id="btn-lot-save">${L('save')}</button>` : ''}</section>`;
    wireLabBody(eq);
  }
  function wireLabBody(eq) {
    const val = (id) => document.getElementById(id)?.value ?? '';
    const done = async (msg) => { showToast(msg || L('saved')); await refreshLabBody(); };
    const fail = (err) => showToast(String(err.message || err));
    document.getElementById('btn-qc-add')?.addEventListener('click', async () => {
      try {
        const r = await api('/lab/qc-controls', { method: 'POST', body: JSON.stringify({ analyteGroup: val('qc-group'), reagentLotId: val('qc-lot') || null, measuredValue: val('qc-measured'), expectedValue: val('qc-expected'), acceptLowPct: val('qc-low'), acceptHighPct: val('qc-high'), notes: val('qc-notes') }) });
        await done(`${r.outcome === 'pass' ? L('pass') : L('fail')} · ${Math.round(r.recoveryPct * 10) / 10} %`);
      } catch (e) { fail(e); }
    });
    document.querySelectorAll('.btn-eq-edit').forEach(b => b.addEventListener('click', () => {
      const e = eq.find(x => String(x.id) === b.dataset.id); if (!e) return;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
      set('eq-id', e.id); set('eq-code', e.code); set('eq-name', e.name); set('eq-type', e.type); set('eq-serial', e.serialNo); set('eq-location', e.location);
      set('eq-caldate', e.calibrationDate); set('eq-caldue', e.calibrationDue); set('eq-calref', e.calibrationRef);
      document.getElementById('eq-form')?.scrollIntoView({ block: 'center' });
    }));
    document.getElementById('btn-eq-save')?.addEventListener('click', async () => {
      const id = val('eq-id');
      const payload = { code: val('eq-code'), name: val('eq-name'), type: val('eq-type'), serialNo: val('eq-serial'), location: val('eq-location'), calibrationDate: val('eq-caldate'), calibrationDue: val('eq-caldue'), calibrationRef: val('eq-calref') };
      try { await api(id ? `/lab/equipment/${id}` : '/lab/equipment', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) }); await done(); } catch (e) { fail(e); }
    });
    document.querySelectorAll('.btn-eq-status').forEach(b => b.addEventListener('click', async () => {
      try { await api(`/lab/equipment/${b.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: b.dataset.status }) }); await done(); } catch (e) { fail(e); }
    }));
    document.getElementById('btn-lot-save')?.addEventListener('click', async () => {
      const payload = { code: val('lot-code'), name: val('lot-name'), kind: val('lot-kind'), lotNo: val('lot-no'), supplier: val('lot-supplier'), expiryDate: val('lot-expiry'), analyteGroup: val('lot-group'), certifiedValue: val('lot-cert'), certifiedU: val('lot-certu'), unit: val('lot-unit') };
      try { await api('/lab/reagent-lots', { method: 'POST', body: JSON.stringify(payload) }); await done(); } catch (e) { fail(e); }
    });
    document.querySelectorAll('.btn-lot-status').forEach(b => b.addEventListener('click', async () => {
      try { await api(`/lab/reagent-lots/${b.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: b.dataset.status }) }); await done(); } catch (e) { fail(e); }
    }));
  }

  // --- politici (administrator) -----------------------------------------------------------
  window.renderPolicyCard = async function () {
    const root = document.getElementById('admin-view-root');
    if (!root) return;
    let p;
    try { p = (await api('/admin/policy')).policy; } catch (_) { return; }
    const card = document.createElement('div');
    card.className = 'admin-panel view-transition lab-card';
    card.innerHTML = `<div class="admin-section-head"><div><h2>${L('policyTitle')}</h2></div></div>
      <div class="lab-grid">
        <div class="field"><label class="checkbox-row"><input type="checkbox" id="pol-strict" ${p.strictRoles ? 'checked' : ''}> ${L('strictRoles')}</label><div class="section-hint">${L('strictHint')}</div></div>
        <div class="field"><label for="pol-reason">${L('relaxReason')}</label><input type="text" id="pol-reason" maxlength="300"></div>
        <div class="field"><label for="pol-retention">${L('retention')}</label><input type="number" min="1" max="100" step="1" id="pol-retention" value="${esc(p.retentionYears ?? '')}"><div class="section-hint">${L('retentionHint')}</div></div>
        <div class="field"><label for="pol-qcage">${L('qcAge')}</label><input type="number" min="0" max="365" step="1" id="pol-qcage" value="${esc(p.qcMaxAgeDays)}"></div>
      </div><button class="btn" id="btn-policy-save">${L('save')}</button>`;
    root.prepend(card);
    document.getElementById('btn-policy-save').addEventListener('click', async () => {
      const ret = document.getElementById('pol-retention').value;
      try {
        await api('/admin/policy', { method: 'PUT', body: JSON.stringify({ strictRoles: document.getElementById('pol-strict').checked, reason: document.getElementById('pol-reason').value, retentionYears: ret === '' ? null : Number(ret), qcMaxAgeDays: Number(document.getElementById('pol-qcage').value) }) });
        showToast(L('saved'));
      } catch (err) { showToast(String(err.message || err)); }
    });
  };
})();
