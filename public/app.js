// ---------- API helper ----------
let csrfToken = null;

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('common.genericError'));
  return data;
}

const CONTAMINANT_ROWS = [
  { key: 'afb1', get label() { return bt('bulletin.afb1Name'); } },
  { key: 'afb2', get label() { return bt('bulletin.afb2Name'); } },
  { key: 'afg1', get label() { return bt('bulletin.afg1Name'); } },
  { key: 'afg2', get label() { return bt('bulletin.afg2Name'); } },
  { key: 'ota',  get label() { return bt('bulletin.otaName'); } },
];
// Subseturi folosite pentru ordinea de afisare: cele 4 aflatoxine care intra
// in suma B1+B2+G1+G2 apar impreuna cu randul de suma, iar OTA - fiind un
// contaminant complet independent, care nu intra in nicio suma - e afisat
// separat, dupa suma, nu amestecat printre aflatoxine.
const AFLATOXIN_ROWS = CONTAMINANT_ROWS.filter(r => r.key !== 'ota');
const OTA_ROW = CONTAMINANT_ROWS.find(r => r.key === 'ota');

// Randeaza un rand editabil pentru un contaminant "suplimentar" (DON, ZEA,
// FUM) in formularul operatorului - input rezultat + input limita, cu
// data-key/id compatibile cu updateLiveAssessment() pentru actualizare live.
function renderEditableExtraToxinRow(sample, key, label, hint, step) {
  const val = sample[key];
  const limitKey = 'limit' + key.charAt(0).toUpperCase() + key.slice(1); // don -> limitDon
  const limit = sample[limitKey];
  const isOver = limit !== null && limit !== undefined && val !== null && val !== undefined && val > limit;
  const flagId = `f-limit${key.charAt(0).toUpperCase() + key.slice(1)}`;
  let flag = '<span class="result-flag empty">—</span>';
  if (val !== null && val !== undefined) {
    if (limit === null || limit === undefined) flag = `<span class="result-flag empty">${t('operator.noLimitFlag')}</span>`;
    else flag = isOver ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
  }
  return `
    <tr class="extra-toxin-row">
      <td class="name-cell" style="padding-left:28px;">${label} ${hint ? `<span class="section-hint">${hint}</span>` : ''}</td>
      <td><input type="number" step="${step}" min="0" class="mono result-input ${isOver ? 'over-limit' : ''}" data-key="${key}" value="${val !== null && val !== undefined ? val : ''}" placeholder="0"></td>
      <td class="limit-cell mono"><input type="number" step="${step}" min="0" id="${flagId}" class="mono" value="${limit ?? ''}" placeholder="${t('operator.limitPlaceholderGeneric')}" style="width:90px;"></td>
      <td id="flag-${key}">${flag}</td>
    </tr>
  `;
}

// Randeaza un rand read-only pentru un contaminant "suplimentar" (DON, ZEA,
// FUM), afisat doar daca proba are o valoare sau o limita pentru el - altfel
// randul nu apare deloc, ca sa nu aglomereze buletinul probelor unde acesti
// contaminanti nu sunt relevanti.
// Gaseste profilul legal (din RULE_PROFILES_CACHE) care corespunde exact
// categoriei textuale a probei (eticheta salvata la inregistrare). Daca
// proprietarul a ales "Altceva / nu stiu categoria" sau textul nu se
// potriveste niciunui profil cunoscut, se returneaza null - caz in care
// buletinul revine la comportamentul "exploratoriu" (arata toti
// contaminantii care au date, fara sa ascunda nimic).
// Determina starea unui termen de livrare (TAT) fata de data curenta -
// folosita atat in buletinul proprietarului cat si in coada operatorului,
// pentru consecventa vizuala.
function dueDateStatus(dueDate, validationStatus, sampleStatus) {
  if (!dueDate) return 'none';
  // Termenul de livrare nu mai are sens sa "curga" pentru o proba care nu
  // mai poate avansa: fie livrata deja (buletin emis), fie anulata la
  // controlul de calitate - in ambele cazuri analiza s-a incheiat, nu mai
  // exista un risc real de intarziere de urmarit. Aceeasi conditie ca cea
  // folosita de isFinished() in coada operatorului/validatorului.
  if (validationStatus === 'validated' || sampleStatus === 'cancelled') return 'done'; // incheiat deja, termenul nu mai conteaza
  const due = new Date(dueDate + 'T23:59:59');
  const now = new Date();
  const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  if (due < now) return 'overdue';
  if (due < twoDaysFromNow) return 'soon';
  return 'ok';
}

// Contact direct cu laboratorul, pentru o sesizare sau o intrebare despre
// aceasta proba anume - fara infrastructura noua (fara SMTP, fara sistem
// de tichete): un link "mailto:" deschide clientul de mail al
// beneficiarului, cu subiectul precompletat cu codul probei, exact
// identificatorul comun pe care l-ar folosi si la telefon.
function renderContactLabCard(sample) {
  if (!labBranding || (!labBranding.institutionEmail && !labBranding.institutionPhone)) return '';
  const subject = encodeURIComponent(`Sesizare / întrebare — proba ${sample.code}`);
  const mailtoHref = labBranding.institutionEmail ? `mailto:${labBranding.institutionEmail}?subject=${subject}` : null;
  return `
    <div class="contact-lab-card">
      <div class="contact-lab-text">
        <span class="eyebrow">${t('owner.contactLabEyebrow')}</span>
        <p>${t('owner.contactLabIntro')}</p>
      </div>
      <div class="contact-lab-actions">
        ${labBranding.institutionPhone ? `<a class="btn secondary small-btn" href="tel:${escapeAttr(labBranding.institutionPhone.replace(/\s+/g, ''))}">${escapeHtml(labBranding.institutionPhone)}</a>` : ''}
        ${mailtoHref ? `<a class="btn secondary small-btn" href="${mailtoHref}">${t('owner.contactLabEmailBtn')}</a>` : ''}
      </div>
    </div>
  `;
}

function renderDueDateChip(sample) {
  if (!sample.dueDate) return '';
  const status = dueDateStatus(sample.dueDate, sample.validationStatus, sample.status);
  if (status === 'done') return ''; // deja livrat, nu mai afisam termenul
  const label = status === 'overdue' ? t('owner.dueDateOverdue') : status === 'soon' ? t('owner.dueDateSoon') : t('owner.dueDateLabel');
  return `<div class="due-date-chip ${status}"><span>${label}</span><strong>${escapeHtml(sample.dueDate)}</strong></div>`;
}

// Randeaza un mini-grafic SVG de evolutie pentru un contaminant, cu o linie
// punctata pentru limita legala (daca exista). Fara biblioteca externa de
// grafice - SVG generat direct, consecvent cu restul aplicatiei (fara
// dependinte noi).
function renderTrendSvg(label, values, limit) {
  const validPoints = values.map((v, i) => ({ v, i })).filter(p => p.v !== null && p.v !== undefined);
  if (validPoints.length < 2) return '';

  // Semnal vizual, nu blocare - recomandarea 3 din auditul logic. Compara
  // ultimul rezultat cu media celor anterioare din aceeasi categorie; daca
  // e cu mult peste (prag simplu, nu statistica avansata), arata o mentiune
  // discreta langa titlul graficului. Are nevoie de cel putin 3 puncte, ca
  // "media anterioara" sa insemne ceva, nu doar un singur punct de comparat.
  let unusual = false;
  if (validPoints.length >= 3) {
    const last = validPoints[validPoints.length - 1].v;
    const prior = validPoints.slice(0, -1).map(p => p.v);
    const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
    if (priorAvg > 0 && last > priorAvg * 1.5) unusual = true;
  }

  const width = 320, height = 120, padding = 28;
  const maxVal = Math.max(...validPoints.map(p => p.v), limit || 0) * 1.15 || 1;
  const xStep = (width - padding * 2) / (values.length - 1 || 1);
  const yScale = (v) => height - padding - (v / maxVal) * (height - padding * 2);

  const pathPoints = validPoints.map(p => `${(padding + p.i * xStep).toFixed(1)},${yScale(p.v).toFixed(1)}`).join(' ');
  const dots = validPoints.map(p => {
    const isOver = limit !== null && limit !== undefined && p.v > limit;
    return `<circle cx="${(padding + p.i * xStep).toFixed(1)}" cy="${yScale(p.v).toFixed(1)}" r="3.5" fill="${isOver ? 'var(--danger)' : 'var(--focus)'}" />`;
  }).join('');
  const limitLine = (limit !== null && limit !== undefined)
    ? `<line x1="${padding}" y1="${yScale(limit).toFixed(1)}" x2="${width - padding}" y2="${yScale(limit).toFixed(1)}" stroke="var(--danger)" stroke-dasharray="4,3" stroke-width="1.3" /><text x="${width - padding}" y="${(yScale(limit) - 4).toFixed(1)}" font-size="9" fill="var(--danger)" text-anchor="end">${escapeHtml(t('owner.trendLimitLine'))}</text>`
    : '';

  return `
    <div class="trend-chart-card">
      <div class="trend-chart-label">${escapeHtml(label)}${unusual ? `<span class="trend-unusual-flag" title="${escapeAttr(t('owner.trendUnusualHint'))}">${escapeHtml(t('owner.trendUnusualBadge'))}</span>` : ''}</div>
      <svg viewBox="0 0 ${width} ${height}" class="trend-chart-svg" preserveAspectRatio="xMidYMid meet">
        <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="var(--line)" stroke-width="1" />
        ${limitLine}
        <polyline points="${pathPoints}" fill="none" stroke="var(--focus)" stroke-width="2" />
        ${dots}
      </svg>
    </div>
  `;
}

async function loadOwnerTrend(sample) {
  const slot = document.getElementById('owner-trend-slot');
  if (!slot) return;
  try {
    const { points } = await api(`/samples/trend?category=${encodeURIComponent(sample.category)}`);
    const requested = sample.requestedTests || TEST_GROUP_DEFS.map(g => g.key);
    const last = points.length ? points[points.length - 1] : {};
    const chartDefs = [
      ['aflatoxins', t('owner.testAflatoxins'), points.map(p => p.aflaSum), last.limitAflaSum],
      ['ota', t('owner.testOta'), points.map(p => p.ota), last.limitOta],
      ['m1', t('owner.testM1'), points.map(p => p.m1), last.limitM1],
      ['don', t('owner.testDon'), points.map(p => p.don), last.limitDon],
      ['zea', t('owner.testZea'), points.map(p => p.zea), last.limitZea],
      ['fum', t('owner.testFum'), points.map(p => p.fum), last.limitFum],
    ];
    const charts = chartDefs
      .filter(([key]) => requested.includes(key))
      .map(([, label, values, limit]) => renderTrendSvg(label, values, limit))
      .filter(Boolean)
      .join('');

    slot.innerHTML = `
      <div class="audit-card">
        <div class="dashboard-card-head"><h3>${t('owner.trendTitle')}</h3><button class="btn secondary" id="btn-close-trend">${t('common.close')}</button></div>
        ${charts ? `<div class="trend-charts-grid">${charts}</div>` : `<div class="empty-list">${t('owner.trendNotEnough')}</div>`}
      </div>
    `;
    document.getElementById('btn-close-trend')?.addEventListener('click', () => { slot.innerHTML = ''; });
  } catch (e) {
    showToast(t('owner.trendLoadError'));
  }
}

function getCategoryProfile(category) {
  if (!category || !RULE_PROFILES_CACHE.length) return null;
  return RULE_PROFILES_CACHE.find(p => p.label === category) || null;
}

// Determina daca un contaminant e relevant pentru profilul dat (adica are
// o limita legala setata pentru acea categorie de produs). Fara profil
// (mod exploratoriu), toti contaminantii sunt considerati relevanti.
function isContaminantRelevant(key, profile) {
  if (!profile) return true;
  const has = (v) => v !== null && v !== undefined;
  switch (key) {
    case 'afb1': return has(profile.limit_afb1) || has(profile.limit_afla_sum);
    case 'afb2': case 'afg1': case 'afg2': return has(profile.limit_afla_sum);
    case 'ota': return has(profile.limit_ota);
    case 'm1': return has(profile.limit_m1);
    case 'don': return has(profile.limit_don);
    case 'zea': return has(profile.limit_zea);
    case 'fum': return has(profile.limit_fum);
    default: return true;
  }
}

// Grupuri de analize comandabile separat - oglindeste TEST_GROUP_KEYS din
// db/evaluation.js (backend). Aflatoxinele raman mereu un singur pachet
// (limita legala foloseste suma lor), restul sunt teste independente.
const TEST_GROUP_DEFS = [
  { key: 'aflatoxins', labelKey: 'owner.testAflatoxins' },
  { key: 'ota', labelKey: 'owner.testOta' },
  { key: 'm1', labelKey: 'owner.testM1' },
  { key: 'don', labelKey: 'owner.testDon' },
  { key: 'zea', labelKey: 'owner.testZea' },
  { key: 'fum', labelKey: 'owner.testFum' },
];

// Determina ce grupuri de analize sunt disponibile pentru un profil de
// categorie - oglindeste availableGroupsForProfile() din db/evaluation.js.
// Fara profil (categorie libera/necunoscuta), toate grupurile raman
// disponibile, ca proprietarul sa poata alege liber.
function availableGroupsForProfileClient(profile) {
  if (!profile) return TEST_GROUP_DEFS.map(g => g.key);
  const has = (v) => v !== null && v !== undefined;
  const groups = [];
  if (has(profile.limit_afb1) || has(profile.limit_afla_sum)) groups.push('aflatoxins');
  if (has(profile.limit_ota)) groups.push('ota');
  if (has(profile.limit_m1)) groups.push('m1');
  if (has(profile.limit_don)) groups.push('don');
  if (has(profile.limit_zea)) groups.push('zea');
  if (has(profile.limit_fum)) groups.push('fum');
  return groups;
}

function renderReadOnlyExtraToxinRow(label, value, limit, hint, forceShow) {
  const hasAny = (value !== null && value !== undefined) || (limit !== null && limit !== undefined);
  if (!hasAny && !forceShow) return '';
  const isOver = limit !== null && limit !== undefined && value !== null && value !== undefined && value > limit;
  const flag = (value === null || value === undefined)
    ? `<span class="result-flag empty">${t('common.pending')}</span>`
    : (limit === null || limit === undefined)
      ? `<span class="result-flag empty">${bt('bulletin.limitNotSet')}</span>`
      : (isOver ? `<span class="result-flag fail">${bt('common.exceeded')}</span>` : `<span class="result-flag ok">${bt('common.conform')}</span>`);
  return `
    <tr class="extra-toxin-row">
      <td class="name-cell" style="padding-left:28px;">${label} ${hint ? `<span class="section-hint">${hint}</span>` : ''}</td>
      <td class="mono">${value !== null && value !== undefined ? value : '—'}</td>
      <td class="limit-cell mono">${limit !== null && limit !== undefined ? limit : '—'}</td>
      <td>${flag}</td>
    </tr>
  `;
}

// Provenienta limitelor afisate (L5): profil / implicite / manual / nedocumentat.
function limitProvenanceText(sample) {
  const basis = sample && sample.limitBasis;
  if (basis === 'profile') return `${t('operator.limitBasisProfile')} ${escapeHtml(sample.limitSource || '')}`;
  if (basis === 'fallback') return `⚠ ${t('operator.limitBasisFallback')}`;
  if (basis === 'manual') return `${t('operator.limitBasisManual')} ${escapeHtml(sample.limitOverrideReason || '')}`;
  if (basis === 'none') return t('operator.limitBasisNone');
  return t('operator.limitBasisUnknown');
}

function ruleSourceLabel(source) {
  return source ? `${t('operator.ruleSourcePrefix')} ${escapeHtml(source)}` : t('operator.ruleStandardPoc');
}

// Varianta cu o singura limba (cea curent selectata) a statusului - pentru
// elemente de interfata precum bara laterala, arhiva, cronologia probei.
// Diferita de statusLabel(status, true), care arata AMBELE limbi simultan
// si e rezervata exclusiv continutului buletinului tiparit.
// Distinct de statusLabelUI (verdict de conformitate, relevant in coada
// activa) - arhiva arata stadiul FLUXULUI: e in lucru, anulata, sau emisa.
// O proba cu rezultate conforme dar inca nevalidata NU e "gata", e "in
// lucru" - altfel se confunda cu una cu buletin deja emis.
function archiveWorkflowLabel(s) {
  if (s.status === 'cancelled') return t('operator.archiveStatusCancelled');
  if (s.validationStatus === 'validated') return t('operator.archiveStatusIssued');
  return t('operator.archiveStatusInProgress');
}

function statusLabelUI(status) {
  if (status === 'ok') return t('common.conform');
  if (status === 'fail') return t('common.exceeded');
  if (status === 'cancelled') return t('common.cancelledStatus');
  if (status === 'in_analysis') return t('common.inAnalysis');
  return t('common.pending');
}

function statusLabel(status, simultaneousBilingual) {
  if (simultaneousBilingual) {
    if (status === 'ok') return bt('common.conform');
    if (status === 'fail') return bt('common.exceeded');
    if (status === 'cancelled') return bt('common.cancelledStatus');
    if (status === 'in_analysis') return bt('common.inAnalysis');
    return bt('common.pending');
  }
  if (status === 'ok') return t('common.conform');
  if (status === 'fail') return t('common.exceeded');
  if (status === 'cancelled') return t('common.cancelledStatus');
  if (status === 'in_analysis') return t('common.inAnalysis');
  return t('common.pending');
}


function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2400);
}


// v1.16 — shared interaction helpers. These keep feedback consistent across roles.
function markFieldError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  const field = el.closest('.field') || el.parentElement;
  field?.classList.add('has-error');
  let msg = field?.querySelector('.field-error');
  if (!msg) { msg = document.createElement('div'); msg.className = 'field-error'; field?.appendChild(msg); }
  msg.textContent = message;
  el.setAttribute('aria-invalid', 'true');
}
function clearFieldErrors(scope = document) {
  scope.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
  scope.querySelectorAll('.field-error').forEach(el => el.remove());
  scope.querySelectorAll('[aria-invalid="true"]').forEach(el => el.removeAttribute('aria-invalid'));
}
function focusAndExplain(id, message) {
  clearFieldErrors(document.getElementById('detail-panel') || document);
  markFieldError(id, message);
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior:'smooth', block:'center' });
  setTimeout(() => el?.focus(), 180);
}

// ---------- App state ----------
let currentUser = null;
let labBranding = null; // cache-uit dupa prima incarcare; se reincarca doar daca lipseste
let authMode = 'login'; // 'login' | 'register'
let ownerSamples = [];
let ownerActiveId = null;
let ownerSearchTerm = '';
let ownerStatusFilter = 'all'; // all | active | pending | validated | cancelled
let ownerShowNewForm = false;
let ownerView = 'samples'; // 'samples' | 'archive'
let ownerShowQr = false;
let ownerQrData = null;

let archiveSamples = [];
let archivePage = 1;
let archiveTotal = 0;
let archiveFilters = { status: '', category: '', dateFrom: '', dateTo: '' };

let operatorQueue = [];
let operatorActiveId = null;
// Selectia din meniul de QC, tinuta local, separat de sample.qcStatus (baza
// de date) - fara asta, orice salvare obisnuita intre selectarea unei
// optiuni si apasarea efectiva a "Trimite spre validare" ar rescrie
// formularul din datele salvate (inca "in asteptare"), stergand vizual
// alegerea utilizatorului, desi el nu a renuntat la ea.
let operatorQcSelection = null;
let operatorQcSelectionSampleId = null;
let operatorSearchTerm = '';
let operatorView = 'queue'; // 'queue' | 'archive' | 'dashboard'
let operatorQueueFilter = 'all';
let adminView = 'dashboard'; // 'dashboard' | 'operators' | 'quality'
let validationTests = [];
let validationSummary = { total: 0, passed: 0, failed: 0, notRun: 0 };

let operatorArchiveSamples = [];
let operatorArchiveFilters = { status: '', category: '', dateFrom: '', dateTo: '', search: '' };

let adminOperators = [];
let adminValidators = [];
let operatorRuleProfiles = [];
let operatorSuggestedRule = null;
let RULE_PROFILES_CACHE = []; // lista completa de profiluri, incarcata o data la boot
let operatorSelectedProfileId = ''; // profilul ales manual de operator pt proba curent deschisa
let operatorSelectedProfileSampleId = null; // id-ul probei pt care e valabila selectia de mai sus
let activeFormDirty = false;

// v1.11 UX evaluation instrumentation. Local to the browser session.
let uxTest = { active: false, startedAt: 0, clicks: 0, role: '', goal: '', startedView: '' };
let uxHistory = JSON.parse(localStorage.getItem('limsUxHistory') || '[]');

function uxGoalForRole(role) {
  return {
    owner: t('common.uxGoalOwner'),
    operator: t('common.uxGoalOperator'),
    validator: t('common.uxGoalValidator'),
    admin: t('common.uxGoalAdmin')
  }[role] || t('common.uxGoalDefault');
}

function uxStartTest() {
  uxTest = { active: true, startedAt: performance.now(), clicks: 0, role: currentUser?.role || '', goal: uxGoalForRole(currentUser?.role), startedView: location.pathname };
  document.body.classList.add('ux-test-active');
  renderUxTestPanel();
  showToast(t('common.uxTestStartedToast'));
}

function uxFinishTest() {
  if (!uxTest.active) return;
  const seconds = Math.max(0, Math.round((performance.now() - uxTest.startedAt) / 1000));
  const result = { role: uxTest.role, goal: uxTest.goal, clicks: uxTest.clicks, seconds, at: new Date().toISOString() };
  uxHistory = [result, ...uxHistory].slice(0, 10);
  localStorage.setItem('limsUxHistory', JSON.stringify(uxHistory));
  uxTest.active = false;
  document.body.classList.remove('ux-test-active');
  renderUxTestPanel(result);
}

function renderUxTestPanel(lastResult = null) {
  let panel = document.getElementById('ux-test-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'ux-test-panel'; document.body.appendChild(panel); }
  if (!uxTest.active && !lastResult) {
    panel.innerHTML = `
      <div class="ux-modal">
        <button class="ux-close" id="ux-close" aria-label="${t('demo.closeAria')}">×</button>
        <div class="eyebrow">${t('common.uxEvaluationEyebrow')}</div><h2>${t('common.uxMeasureRealUsage')}</h2>
        <p>${t('common.uxToolIntro')}</p>
        <div class="ux-goal"><span>${t('common.uxTaskLabel')}</span><strong>${escapeHtml(uxGoalForRole(currentUser?.role))}</strong></div>
        <div class="ux-history">${uxHistory.length ? `<b>${t('common.uxLastSessionPrefix')}</b> ${uxHistory[0].seconds}s · ${uxHistory[0].clicks} ${t('common.uxClicksSuffix')}` : t('common.uxNoSessionsMeasured')}</div>
        <button class="btn" id="ux-start">${t('common.uxStartTestBtn')}</button>
      </div>`;
    panel.style.display = 'grid';
    document.getElementById('ux-start').onclick = uxStartTest;
    document.getElementById('ux-close').onclick = () => panel.style.display = 'none';
    return;
  }
  if (uxTest.active) {
    panel.innerHTML = `
      <div class="ux-live">
        <div><span class="eyebrow">${t('common.uxInProgressEyebrow')}</span><strong>${escapeHtml(uxTest.goal)}</strong></div>
        <div class="ux-live-stats"><span><b id="ux-clicks">${uxTest.clicks}</b> ${t('common.uxClicksSuffix')}</span><span><b id="ux-time">0:00</b></span></div>
        <button class="btn secondary small-btn" id="ux-finish">${t('common.uxFinishMeasurementBtn')}</button>
      </div>`;
    panel.style.display = 'block';
    document.getElementById('ux-finish').onclick = uxFinishTest;
    clearInterval(window.__uxTimer);
    window.__uxTimer = setInterval(() => {
      if (!uxTest.active) return;
      const sec = Math.round((performance.now() - uxTest.startedAt) / 1000);
      const el = document.getElementById('ux-time');
      if (el) el.textContent = `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
    }, 500);
    return;
  }
  panel.innerHTML = `
    <div class="ux-modal">
      <div class="eyebrow">${t('common.uxResultEyebrow')}</div><h2>${t('common.uxSessionEndedTitle')}</h2>
      <div class="ux-result-grid"><div><span>${t('common.uxTimeLabel')}</span><strong>${lastResult.seconds}s</strong></div><div><span>${t('common.uxClicksLabel')}</span><strong>${lastResult.clicks}</strong></div></div>
      <p class="ux-muted">${t('common.uxCompareNote')}</p>
      <button class="btn" id="ux-close-result">${t('common.close')}</button>
    </div>`;
  panel.style.display = 'grid';
  document.getElementById('ux-close-result').onclick = () => panel.style.display = 'none';
}

document.addEventListener('click', (event) => {
  if (!uxTest.active) return;
  if (event.target.closest('#ux-test-panel')) return;
  uxTest.clicks += 1;
  const el = document.getElementById('ux-clicks');
  if (el) el.textContent = uxTest.clicks;
}, true);

const app = document.getElementById('app');

// ---------- Boot ----------
async function boot() {
  try {
    const { user, csrfToken: token } = await api('/auth/me');
    currentUser = user;
    if (token) csrfToken = token;
  } catch (e) {
    currentUser = null;
  }
  render();
}

function render() {
  if (!currentUser) {
    renderAuth();
  } else if (currentUser.role === 'owner') {
    renderOwnerApp();
  } else if (currentUser.role === 'operator' || currentUser.role === 'validator') {
    renderOperatorApp();
  } else if (currentUser.role === 'admin') {
    renderAdminApp();
  }
}

// ================= AUTH SCREENS =================
function renderAuth() {
  const isRegister = authMode === 'register';
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card">
        <button type="button" class="lang-toggle" id="lang-toggle" title="Switch language">${t('auth.languageToggle')}</button>
        <h1>${t('auth.title')}</h1>
        <p class="sub">${t('auth.subtitle')}</p>
        <div id="auth-error"></div>
        <form id="auth-form">
          ${isRegister ? `
            <div class="field">
              <label for="fullName">${t('auth.fullName')}</label>
              <input type="text" id="fullName" required autocomplete="name">
            </div>
          ` : ''}
          <div class="field">
            <label for="email">${t('auth.email')}</label>
            <input type="email" id="email" required autocomplete="username">
          </div>
          <div class="field">
            <label for="password">${t('auth.password')}</label>
            <input type="password" id="password" required autocomplete="${isRegister ? 'new-password' : 'current-password'}" minlength="8">
          </div>
          <button type="submit" class="btn block">${isRegister ? t('auth.createAccount') : t('common.login')}</button>
        </form>
        <div class="auth-toggle">
          ${isRegister
            ? `${t('auth.haveAccount')} <a id="toggle-auth">${t('auth.loginLink')}</a>`
            : `${t('auth.noAccount')} <a id="toggle-auth">${t('auth.registerLink')}</a>`}
        </div>
        <div class="auth-toggle" style="margin-top:6px; font-size:11.5px;">
          ${t('auth.operatorNote')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('lang-toggle').addEventListener('click', () => {
    setLang(currentLang === 'ro' ? 'en' : 'ro');
    render();
  });

  document.getElementById('toggle-auth').addEventListener('click', () => {
    authMode = isRegister ? 'login' : 'register';
    render();
  });

  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('auth-error');
    errorEl.innerHTML = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const fullName = isRegister ? document.getElementById('fullName').value.trim() : undefined;

    try {
      const payload = isRegister ? { email, password, fullName } : { email, password };
      const { user, csrfToken: token } = await api(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      currentUser = user;
      if (token) csrfToken = token;
      render();
    } catch (err) {
      errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  currentUser = null;
  ownerSamples = [];
  operatorQueue = [];
  // Sesiunea veche a fost distrusa server-side - token-ul CSRF retinut pe
  // client a ramas orfan. Il reimprospatam acum, altfel prima actiune care
  // modifica ceva dupa delogare (de regula un login nou) ar esua cu 403.
  try {
    const { csrfToken: token } = await api('/auth/me');
    if (token) csrfToken = token;
  } catch (e) { /* ignoram - boot() va reincerca la urmatoarea incarcare */ }
  // Reseteaza limba la romana la fiecare delogare - altfel pagina de
  // autentificare mostenea limba ultimului rol conectat (ex: iesire din
  // cont in engleza -> pagina de login si urmatorul cont porneau tot in
  // engleza, desi utilizatorul nu alesese asta pentru noua sesiune).
  setLang('ro');
  render();
}

function renderHeader(subtitle, roleLabel, roleClass, tabs) {
  const tabsHtml = tabs ? `
    <div class="header-tabs">
      ${tabs.map(tab => `<button class="header-tab ${tab.active ? 'active' : ''}" data-tab="${tab.key}">${tab.label}</button>`).join('')}
    </div>
  ` : '';
  // Comutatorul de limba apare pentru toate cele 4 roluri - toate sunt
  // traduse acum (owner, operator, validator, admin).
  const langToggleHtml = `<button type="button" class="header-lang-toggle" id="header-lang-toggle" title="Switch language">${t('auth.languageToggle')}</button>`;
  return `
    <header class="app-header">
      <div class="app-brand"><div class="app-mark">M</div><div><div class="app-title">${t('common.appTitle')}</div><div class="app-context">${subtitle}</div></div></div>
      ${tabsHtml}
      <div class="header-right">
        ${langToggleHtml}
        <span class="role-badge ${roleClass}">${roleLabel}</span>
        <span>${escapeHtml(currentUser.fullName)}</span>
        ${currentUser.role === 'owner' ? `<button class="btn secondary small-btn" id="btn-company">${t('owner.companyBtn')}</button>` : ''}<button class="btn secondary" id="btn-logout">${t('common.logout')}</button>
      </div>
    </header>
  `;
}

function renderRoleGuide(role) {
  const guides = {
    owner: {
      eyebrow: t('owner.guideEyebrow'),
      title: t('owner.guideTitle'),
      text: t('owner.guideText'),
      actions: [t('owner.beneficiaryStep1'), t('owner.beneficiaryStep2'), t('owner.beneficiaryStep3')]
    },
    operator: {
      eyebrow: t('operator.guideOperatorEyebrow'),
      title: t('operator.guideOperatorTitle'),
      text: t('operator.guideOperatorText'),
      actions: [t('operator.guideOperatorStep1'), t('operator.guideOperatorStep2'), t('operator.guideOperatorStep3')]
    },
    validator: {
      eyebrow: t('operator.guideValidatorEyebrow'),
      title: t('operator.guideValidatorTitle'),
      text: t('operator.guideValidatorText'),
      actions: [t('operator.guideValidatorStep1'), t('operator.guideValidatorStep2'), t('operator.guideValidatorStep3')]
    },
    admin: {
      eyebrow: t('admin.guideEyebrow'),
      title: t('admin.guideTitle'),
      text: t('admin.guideText'),
      actions: [t('admin.guideStep1'), t('admin.guideStep2'), t('admin.guideStep3')]
    }
  };
  const g = guides[role];
  if (!g) return '';
  return `<section class="role-guide role-guide-${role}">
    <div class="role-guide-copy"><h2>${g.title}</h2><p>${g.text}</p></div>
    <div class="role-guide-actions" id="role-guide-actions">${g.actions.map((x,i)=>`<span class="guide-chip ${i===0?'primary':''}"><span class="guide-index">0${i+1}</span>${x}</span>`).join('')}</div>
  </section>`;
}

// Actualizeaza chip-urile din caseta de sus a proprietarului (Inregistrare/
// Analiza/Buletin) sa reflecte STADIUL REAL al probei curent deschise in
// mansheta din stanga - initial, caseta era statica (randata o singura
// data la incarcarea paginii, cu "Inregistrare" mereu evidentiat, indiferent
// ce proba se vizualiza). Apelata din nou de fiecare data cand proprietarul
// deschide o alta proba.
function updateOwnerGuideProgress(sample) {
  const container = document.getElementById('role-guide-actions');
  if (!container) return;
  const isCancelledOpen = sample && sample.status === 'cancelled';
  // Schema beneficiarului e independenta de schema interna a laboratorului
  // (Primire probă/Înregistrare/Analiză/QC/Validare) - vezi ownerProgress().
  // Un client nu are nevoie sa vada granularitatea interna de proces, la
  // fel cum un pacient care isi verifica analizele de sange vede "in lucru",
  // nu fiecare pas separat al laboratorului.
  const labels = [t('owner.beneficiaryStep0'), t('owner.beneficiaryStep1'), t('owner.beneficiaryStep2'), t('owner.beneficiaryStep3')];
  let activeIndex = -1; // -1: nicio proba selectata, sau proba deschisa e anulata (evidentiem chip-ul de anulare in loc)
  if (sample && !isCancelledOpen) {
    const p = ownerProgress(sample);
    // Varianta B: "Probă recepționată" ramane pasul CURENT pana cand
    // laboratorul confirma efectiv primirea fizica a probei - nu se sare
    // direct la pasul de procesare doar pentru ca cererea a fost trimisa
    // online (asta era exact bug-ul semnalat: chip-ul 02 aparea activ
    // instantaneu, fara ca operatorul sa faca nimic).
    activeIndex = p.done ? 3 : p.received ? 2 : 1;
  }
  const stepChips = labels.map((x, i) => `<span class="guide-chip ${i === activeIndex ? 'primary' : ''}"><span class="guide-index">0${i + 1}</span>${x}</span>`).join('');
  // Statusul de anulare e o stare aparte, nu un pas din secventa - fara
  // numerotare, fara contor propriu (exista deja la casetele de rezumat),
  // fara culoare distincta. Se comporta identic cu celelalte chip-uri:
  // activ doar cand proba curent deschisa e chiar anulata.
  const cancelledChip = `<span class="guide-chip ${isCancelledOpen ? 'primary' : ''}">${t('common.cancelledChipShort')}</span>`;
  container.innerHTML = stepChips + cancelledChip;
}

// Echivalentul lui updateOwnerGuideProgress, pentru operator si validator -
// lipsea complet, chip-urile ramaneau statice (mereu primul evidentiat)
// indiferent de proba deschisa sau de statusul ei real.
function updateStaffGuideProgress(sample, role) {
  const container = document.getElementById('role-guide-actions');
  if (!container) return;
  const isCancelledOpen = sample && sample.status === 'cancelled';
  const isValidator = role === 'validator';
  // Cinci chipsuri la ambele roluri, ca sa fie consecvent cu bara de flux
  // detaliata (care are deja 5 pasi la operator si validator deopotriva) -
  // "Validat" e propriul chip, nu o reetichetare in acelasi loc a lui
  // "Trimis spre validare".
  const labels = isValidator
    ? [t('operator.guideStep0'), t('operator.guideValidatorStep0'), t('operator.guideValidatorStep1'), t('operator.guideValidatorStep2'), t('operator.guideValidatorStep3')]
    : [t('operator.guideStep0'), t('operator.guideOperatorStep1'), t('operator.guideOperatorStep2'), t('operator.guideOperatorStep3'), t('operator.guideOperatorStep3Done')];
  let activeIndex = -1; // -1: nicio proba selectata, sau proba deschisa e anulata (evidentiem chip-ul de la final in loc)
  if (sample && !isCancelledOpen) {
    // Varianta B (aleasa explicit de beneficiar dupa raportarea bug-ului la
    // proprietar): chip-ul "Primire probă" ramane pasul CURENT de la
    // inregistrarea online a cererii si pana cand operatorul confirma
    // efectiv primirea fizica la poarta de intrare (intakeCheckedAt) - nu
    // sare direct la "De procesat"/"În analiză" doar pentru ca proba a fost
    // creata. Aplicata identic la operator si la validator, ca cele doua
    // seturi de chip-uri sa ramana coerente intre ele si cu bara detaliata
    // de mai jos (vezi sampleProgress()/renderWorkflowRail()).
    const isReceived = !!sample.intakeCheckedAt;
    if (isValidator) {
      const submittedToValidator = sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required';
      activeIndex = sample.validationStatus === 'validated' ? 4
        : sample.reviewStatus === 'approved' ? 3
        : submittedToValidator ? 2
        : isReceived ? 1
        : 0;
    } else {
      const submittedToValidator = sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required';
      const analysisStarted = ['afb1', 'afb2', 'afg1', 'afg2', 'ota', 'm1', 'don', 'zea', 'fum'].some(k => sample[k] !== null && sample[k] !== undefined);
      activeIndex = sample.validationStatus === 'validated' ? 4
        : submittedToValidator ? 3
        : analysisStarted ? 2
        : isReceived ? 1
        : 0;
    }
  }
  const stepChips = labels.map((x, i) => `<span class="guide-chip ${i === activeIndex ? 'primary' : ''}"><span class="guide-index">0${i + 1}</span>${x}</span>`).join('');
  // Aceeasi simplificare ca la beneficiar - fara numerotare, fara contor,
  // fara culoare distincta; contorul real exista deja in bara de mai jos
  // si in filtrul din coada, nu trebuie dublat aici.
  const cancelledChip = `<span class="guide-chip ${isCancelledOpen ? 'primary' : ''}">${t('common.cancelledChipShort')}</span>`;
  container.innerHTML = stepChips + cancelledChip;
}
function attachLogout() {
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-ux-test')?.addEventListener('click', () => renderUxTestPanel());
  document.getElementById('btn-company')?.addEventListener('click', () => openCompanyDialog());
  document.getElementById('header-lang-toggle')?.addEventListener('click', () => {
    setLang(currentLang === 'ro' ? 'en' : 'ro');
    render();
  });
}

// ---------- v1.10 human-centred workflow helpers ----------
// Bara si chip-urile detaliate de mai jos sunt STRICT interne laboratorului
// (operator/validator) - schema beneficiarului e complet separata, vezi
// ownerProgress()/renderOwnerWorkflowRail() mai jos.
function sampleProgress(sample) {
  // Varianta B (decizie explicita, dupa ce beneficiarul a semnalat ca
  // "Primire probă" aparea bifat instantaneu, fara ca operatorul sa faca
  // nimic): "primit" nu mai e un adevar automat, garantat doar de faptul
  // ca cererea a fost inregistrata online de beneficiar - devine adevarat
  // abia cand operatorul confirma efectiv primirea fizica a probei la
  // poarta de intrare. Pana atunci, chip-ul/nodul ramane pasul CURENT, nu
  // unul deja bifat. In fluxul acestei aplicatii, "primire" si
  // "inregistrare" se petrec in acelasi moment (confirmarea de la poarta),
  // asa ca cele doua noduri se bifeaza impreuna - nu exista, in datele
  // disponibile, un eveniment distinct intre ele.
  const registration = !!sample.intakeCheckedAt;
  const received = registration;
  const analysisStarted = ['afb1', 'afb2', 'afg1', 'afg2', 'ota', 'm1', 'don', 'zea', 'fum'].some(k => sample[k] !== null && sample[k] !== undefined);
  const analysis = registration && analysisStarted;
  const qc = sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required';
  const validation = sample.validationStatus === 'validated';
  return { received, registration, analysis, qc, validation };
}

function renderWorkflowRail(sample, mode = 'operator') {
  const p = sampleProgress(sample);
  // Bara detaliata de 5 pasi e vocabularul intern al laboratorului -
  // folosita doar la operator/validator. La beneficiar, vezi
  // renderOwnerWorkflowRail(), care are propria schema, mai simpla.
  const shortDate = (v) => v ? String(v).slice(0, 10) : null;
  const dates = [shortDate(sample.intakeCheckedAt), shortDate(sample.intakeCheckedAt), shortDate(sample.analysisDate), null, shortDate(sample.validatedAt)];
  const steps = [
    ['1', t('operator.workflowStep0'), p.received],
    ['2', t('operator.workflowStep1'), p.registration],
    ['3', t('operator.workflowStep2'), p.analysis],
    ['4', t('operator.workflowStep3'), p.qc],
    ['5', t('operator.workflowStep4'), p.validation],
  ];
  // Varianta B: pasul curent e "Primire probă" (nodul 1) cat timp proba nu
  // a fost inca receptionata/inregistrata efectiv - nu se sare direct la
  // nodul 2, asa cum se intampla inainte (bifat automat de la creare).
  const current = !p.registration ? 1 : !p.analysis ? 3 : !p.qc ? 4 : !p.validation ? 5 : 5;
  const doneLabel = t('operator.workflowDone');
  const currentLabel = t('operator.workflowCurrent');
  const upcomingLabel = t('operator.workflowUpcoming');
  return `<div class="workflow-rail operator">${steps.map((st, i) => `<div class="workflow-node ${st[2] ? 'done' : ''} ${!st[2] && current === i+1 ? 'current' : ''}"><span class="workflow-number">${st[2] ? '✓' : st[0]}</span><div><b>${st[1]}</b><small>${st[2] ? (dates[i] || doneLabel) : current === i+1 ? currentLabel : upcomingLabel}</small></div></div>${i < steps.length-1 ? '<span class="workflow-connector"></span>' : ''}`).join('')}</div>`;
}

// Schema beneficiarului: independenta de vocabularul intern al laboratorului
// (Primire probă/Înregistrare/Analiză/QC/Validare) - un client extern nu
// are de ce sa vada cele 5 trepte interne fine, la fel cum un pacient care
// isi urmareste analizele de sange online vede "recoltat -> in lucru la
// laborator -> rezultat disponibil", nu fiecare etapa tehnica a
// laboratorului medical. Aceleasi 2 criterii reale ca la sampleProgress()
// (intakeCheckedAt, validationStatus) - doar comprimate in 4 trepte
// orientate spre ce ii intereseaza beneficiarului, nu spre cum lucreaza
// laboratorul pe dinauntru.
function ownerProgress(sample) {
  const submitted = true; // cererea beneficiarului exista deja - e chiar actiunea lui, mereu adevarata
  // Varianta B, si aici: "receptionat" nu e adevarat doar pentru ca cererea
  // a fost trimisa online - abia cand laboratorul confirma efectiv
  // primirea fizica a probei.
  const received = !!sample.intakeCheckedAt;
  const cancelled = sample.status === 'cancelled';
  // O proba anulata la controlul de calitate e un caz INCHIS, la fel ca
  // una validata - beneficiarul nu mai are nimic de asteptat de la ea.
  // Bara detaliata trebuie sa ajunga la ultima treapta ("Rezultat
  // disponibil" - situatia e clarificata, chiar daca rezultatul e o
  // anulare), nu sa ramana blocata vizual la "in procesare la laborator",
  // ca si cum analiza ar mai continua.
  const done = sample.validationStatus === 'validated' || cancelled;
  return { submitted, received, done, cancelled };
}

function renderOwnerWorkflowRail(sample) {
  const p = ownerProgress(sample);
  const shortDate = (v) => v ? String(v).slice(0, 10) : null;
  const dates = [shortDate(sample.createdAt), shortDate(sample.intakeCheckedAt), null, p.cancelled ? null : shortDate(sample.validatedAt)];
  const steps = [
    ['1', t('owner.beneficiaryStep0'), p.submitted],
    ['2', t('owner.beneficiaryStep1'), p.received],
    ['3', t('owner.beneficiaryStep2'), p.done],
    ['4', t('owner.beneficiaryStep3'), p.done],
  ];
  const current = !p.received ? 2 : !p.done ? 3 : 4;
  const doneLabel = p.cancelled ? t('common.cancelledChipShort') : t('owner.workflowDone');
  const currentLabel = t('owner.workflowCurrent');
  const upcomingLabel = t('owner.workflowUpcoming');
  return `<div class="workflow-rail owner">${steps.map((st, i) => `<div class="workflow-node ${st[2] ? 'done' : ''} ${!st[2] && current === i+1 ? 'current' : ''}"><span class="workflow-number">${st[2] ? '✓' : st[0]}</span><div><b>${st[1]}</b><small>${st[2] ? (dates[i] || doneLabel) : current === i+1 ? currentLabel : upcomingLabel}</small></div></div>${i < steps.length-1 ? '<span class="workflow-connector"></span>' : ''}`).join('')}</div>`;
}

function renderHumanStatus(sample, mode = 'operator') {
  if (sample.status === 'cancelled') {
    const eyebrowC = mode === 'owner' ? t('owner.statusEyebrow') : t('operator.statusEyebrow');
    const explanationC = mode === 'owner' ? t('owner.cancelledExplanation') : t('operator.cancelledExplanation');
    const reasonText = sample.qcRejectionReason ? escapeHtml(sample.qcRejectionReason) : '';
    return `<div class="human-status-card cancelled"><div class="human-status-copy"><span class="eyebrow">${eyebrowC}</span><strong>${escapeHtml(t('common.cancelledStatus'))}</strong><p>${escapeHtml(explanationC)}${reasonText ? `<br><em>${reasonText}</em>` : ''}</p>${reasonText ? `<button class="btn secondary small-btn" id="btn-print-rejection-cert" style="margin-top:8px;">${t('common.printRejectionCertBtn')}</button>` : ''}</div><div class="human-status-code mono">${escapeHtml(sample.code)}</div></div>`;
  }
  const isOwner = mode === 'owner';
  let title, text;
  if (isOwner) {
    // Schema simplificata a beneficiarului (ownerProgress) - 3 stari, nu
    // cele 5 interne ale laboratorului, consecvent cu chip-urile de sus si
    // cu bara detaliata dedicate beneficiarului.
    const op = ownerProgress(sample);
    if (!op.received) { title = t('owner.statusWaitingTitle'); text = t('owner.statusWaitingText'); }
    else if (!op.done) { title = t('owner.statusProcessingTitle'); text = t('owner.statusProcessingText'); }
    else { title = t('owner.statusValidatedTitle'); text = t('owner.statusValidatedText'); }
  } else {
    const p = sampleProgress(sample);
    title = t('operator.statusRegisteredTitle'); text = t('operator.statusRegisteredText');
    if (!p.analysis) { title = t('operator.statusWaitingTitle'); text = t('operator.statusWaitingText'); }
    else if (!p.qc) { title = t('operator.statusResultsInTitle'); text = t('operator.statusResultsInText'); }
    else if (!p.validation) { title = t('operator.statusReadyTitle'); text = t('operator.statusReadyText'); }
    else { title = t('operator.statusValidatedTitle'); text = t('operator.statusValidatedText'); }
  }
  const eyebrow = isOwner ? t('owner.statusEyebrow') : t('operator.statusEyebrow');
  return `<div class="human-status-card"><div class="human-status-copy"><span class="eyebrow">${eyebrow}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div><div class="human-status-code mono">${escapeHtml(sample.code)}</div></div>`;
}

function renderAttentionPanel(metrics) {
  const items = [];
  if (metrics.pending) items.push(`<li><b>${metrics.pending}</b> ${t('operator.attentionPendingSamples')}</li>`);
  if (metrics.inAnalysis) items.push(`<li><b>${metrics.inAnalysis}</b> ${t('operator.attentionInAnalysis')}</li>`);
  if (metrics.fail) items.push(`<li><b>${metrics.fail}</b> ${t('operator.attentionFail')}</li>`);
  if (!items.length) items.push(`<li>${t('operator.attentionNone')}</li>`);
  return `<div class="attention-panel"><div><span class="eyebrow">${t('operator.attentionEyebrow')}</span><h3>${t('operator.attentionTitle')}</h3></div><ul>${items.join('')}</ul></div>`;
}

// ================= OWNER APP =================
async function renderOwnerApp() {
  const tabs = [
    { key: 'samples', label: t('owner.mySamples'), active: ownerView === 'samples' },
    { key: 'archive', label: t('owner.archive'), active: ownerView === 'archive' },
  ];

  app.innerHTML = `
    ${renderHeader(t('owner.portalSubtitle'), t('common.owner'), '', tabs)}
    <div class="page-shell">${renderRoleGuide('owner')}<div id="owner-view-root"></div></div>
  `;
  attachLogout();

  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      ownerView = tab.dataset.tab;
      document.querySelectorAll('.header-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === ownerView));
      renderOwnerViewRoot();
    });
  });

  renderOwnerViewRoot();
}

function renderOwnerViewRoot() {
  if (ownerView === 'archive') {
    renderOwnerArchiveView();
  } else {
    renderOwnerSamplesView();
  }
}

function renderOwnerSamplesView() {
  const root = document.getElementById('owner-view-root');
  root.innerHTML = `
    <div class="layout view-transition">
      <aside class="registry">
        <div class="registry-head">
          <h2>${t('owner.mySamples')}</h2>
          <button class="btn block" id="btn-new-sample">${t('owner.newSample')}</button>
          <div class="owner-summary" id="owner-summary" aria-label="Rezumat probe"></div>
        </div>
        <div class="qr-toggle-row">
          <button class="qr-toggle-btn" id="btn-toggle-qr">${t('owner.quickAccess')}</button>
        </div>
        <div id="qr-slot"></div>
        <div class="search-row">
          <input type="text" id="search-input" placeholder="${t('owner.search')}">
        </div>
        <div class="sample-list" id="sample-list"><div class="empty-list">${t('common.loading')}</div></div>
      </aside>
      <main class="detail" id="detail-panel">
        <div class="detail-empty">${t('owner.selectSampleFull')}</div>
      </main>
    </div>
  `;

  document.getElementById('btn-new-sample').addEventListener('click', () => {
    ownerShowNewForm = true;
    ownerActiveId = null;
    renderOwnerDetail();
  });
  document.getElementById('search-input').addEventListener('input', (e) => {
    ownerSearchTerm = e.target.value;
    renderOwnerList();
  });
  document.getElementById('btn-toggle-qr').addEventListener('click', toggleOwnerQr);

  if (ownerShowQr) renderQrSlot();

  loadOwnerSamples();
}

async function toggleOwnerQr() {
  ownerShowQr = !ownerShowQr;
  if (ownerShowQr && !ownerQrData) {
    try {
      ownerQrData = await api('/auth/qr');
    } catch (e) {
      showToast('Nu s-a putut genera codul QR.');
      ownerShowQr = false;
    }
  }
  renderQrSlot();
}

function renderQrSlot() {
  const slot = document.getElementById('qr-slot');
  if (!slot) return;
  if (!ownerShowQr || !ownerQrData) {
    slot.innerHTML = '';
    return;
  }
  slot.innerHTML = `
    <div class="qr-card">
      <img src="${ownerQrData.dataUrl}" alt="Cod QR de acces">
      <div class="qr-label">${t('owner.qrLabel')}<br>${t('owner.qrSubLabel')}</div>
    </div>
  `;
}

async function loadOwnerSamples() {
  try {
    const { samples } = await api('/samples/mine');
    ownerSamples = samples;
  } catch (e) {
    showToast(t('owner.samplesLoadError'));
  }
  renderOwnerSummary();
  renderOwnerList();
  renderOwnerDetail();
}

function renderOwnerSummary() {
  const host = document.getElementById('owner-summary');
  if (!host) return;
  // "Active" insemna anterior "nevalidate", ceea ce includea gresit si
  // probele anulate (o proba anulata nu mai e activa, e inchisa definitiv).
  // Ramane suma logica a "Asteapta" + "In analiza" - orice proba inca in
  // lucru, indiferent de subetapa.
  const active = ownerSamples.filter(s => s.validationStatus !== 'validated' && s.status !== 'cancelled').length;
  // "Asteapta" se opreste acum la decizia de acceptare a probei (poarta de
  // intrare), nu la introducerea primei valori - o proba deja acceptata,
  // dar fara nicio valoare inca, e "in lucru", nu "in asteptare".
  const pending = ownerSamples.filter(s => !s.intakeCheckedAt && s.status !== 'cancelled').length;
  const inProgress = ownerSamples.filter(s => s.intakeCheckedAt && s.validationStatus !== 'validated' && s.status !== 'cancelled').length;
  const ready = ownerSamples.filter(s => s.validationStatus === 'validated').length;
  const cancelled = ownerSamples.filter(s => s.status === 'cancelled').length;
  const boxes = [
    { key: 'active', label: t('owner.summaryActive'), count: active },
    { key: 'pending', label: t('owner.summaryPending'), count: pending },
    { key: 'in_progress', label: t('owner.summaryInProgress'), count: inProgress },
    { key: 'validated', label: t('owner.summaryBulletins'), count: ready },
    { key: 'cancelled', label: t('owner.summaryCancelled'), count: cancelled },
  ];
  host.innerHTML = boxes.map(b => `<button type="button" class="owner-summary-box${ownerStatusFilter === b.key ? ' active-filter' : ''}" data-filter="${b.key}"><span>${escapeHtml(b.label)}</span><strong>${b.count}</strong></button>`).join('');
  host.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', () => {
    ownerStatusFilter = ownerStatusFilter === btn.dataset.filter ? 'all' : btn.dataset.filter;
    renderOwnerSummary();
    renderOwnerList();
  }));
}

function renderOwnerList() {
  const listEl = document.getElementById('sample-list');
  const f = ownerSearchTerm.trim().toLowerCase();
  let filtered = ownerSamples.filter(s =>
    s.code.toLowerCase().includes(f) || (s.productName || '').toLowerCase().includes(f)
  );

  if (ownerStatusFilter === 'active') {
    filtered = filtered.filter(s => s.validationStatus !== 'validated' && s.status !== 'cancelled');
  } else if (ownerStatusFilter === 'pending') {
    filtered = filtered.filter(s => !s.intakeCheckedAt && s.status !== 'cancelled');
  } else if (ownerStatusFilter === 'in_progress') {
    filtered = filtered.filter(s => s.intakeCheckedAt && s.validationStatus !== 'validated' && s.status !== 'cancelled');
  } else if (ownerStatusFilter === 'validated') {
    filtered = filtered.filter(s => s.validationStatus === 'validated');
  } else if (ownerStatusFilter === 'cancelled') {
    filtered = filtered.filter(s => s.status === 'cancelled');
  }

  // Probele finalizate (buletin emis sau anulate) nu mai cer nicio atentie -
  // le mutam la finalul listei, ca sa nu aglomereze probele inca active,
  // ordonate intre ele dupa momentul in care au ajuns in starea finala.
  const isFinished = (s) => s.validationStatus === 'validated' || s.status === 'cancelled';
  const finishedAt = (s) => new Date(s.validatedAt || s.createdAt).getTime();
  const active = filtered.filter(s => !isFinished(s));
  const finished = filtered.filter(isFinished).sort((a, b) => finishedAt(b) - finishedAt(a));
  filtered = [...active, ...finished];

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-list">${ownerSamples.length === 0 ? t('owner.noSamples') : t('owner.noSamplesFound')}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(s => {
    const isActive = s.id === ownerActiveId ? 'active' : '';
    return `
      <div class="sample-row ${isActive}" data-id="${s.id}" role="button" tabindex="0" aria-current="${isActive ? 'true' : 'false'}" aria-label="Deschide proba ${escapeHtml(s.code)}">
        <div class="sample-main">
          <span class="id mono">${escapeHtml(s.code)}${s.hasUpdate ? `<span class="update-badge">${t('owner.newBadge')}</span>` : ''}</span>
          <span class="label">${escapeHtml(s.productName)}</span>
          <div class="date">${s.sampleDate ? t('owner.sampledOnPrefix') + ' ' + s.sampleDate : t('owner.dateNotSet')}</div>
          ${s.retestOfCode ? `<div class="queue-retest-tag">↻ ${t('owner.retestOfPrefix')} ${escapeHtml(s.retestOfCode)}</div>` : ''}
        </div>
        <div class="sample-status"><span class="status-dot ${s.status}" title="${statusLabelUI(s.status)}"></span><span>${statusLabelUI(s.status)}</span></div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.sample-row').forEach(row => {
    const openRow = () => {
      ownerActiveId = parseInt(row.dataset.id, 10);
      ownerShowNewForm = false;
      const openedSample = ownerSamples.find(s => s.id === ownerActiveId);
      // Marcheaza proba ca vazuta, stergand notificarea "Nou" - actualizare
      // optimista (imediata in UI), apelul catre server ruleaza in fundal,
      // fara sa blocam deschiderea probei pe raspunsul lui.
      if (openedSample && openedSample.hasUpdate) {
        openedSample.hasUpdate = false;
        api(`/samples/${ownerActiveId}/mark-seen`, { method: 'POST' }).catch(() => {});
      }
      renderOwnerList();
      renderOwnerDetail();
      // Caseta de sus (Inregistrare/Analiza/Buletin) reflecta stadiul REAL
      // al probei deschise, nu ramane fixata pe "Inregistrare".
      updateOwnerGuideProgress(openedSample);
      if (window.matchMedia('(max-width: 880px)').matches) document.getElementById('detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    row.addEventListener('click', openRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRow();
      }
    });
  });
}

async function renderOwnerDetail() {
  const panel = document.getElementById('detail-panel');

  if (ownerShowNewForm) {
    await ensureRuleProfilesCache();
    const categoryOptions = RULE_PROFILES_CACHE.map(p => `<option value="${escapeAttr(p.label)}">${escapeHtml(categoryLabelPlain(p.label))}</option>`).join('');
    panel.innerHTML = `
      <div class="new-sample-form">
        <div class="form-kicker">${t('owner.registerStep')}</div><h2>${t('owner.registerTitle')}</h2>
        <div id="new-sample-error"></div>
        <form id="new-sample-form">
          <div class="field">
            <label for="ns-productName">${t('owner.productName')}</label>
            <input type="text" id="ns-productName" required placeholder="${t('owner.productNamePh')}">
          </div>
          <div class="field">
            <label for="ns-category-select">${t('owner.category')}</label>
            <select id="ns-category-select">
              <option value="">${t('owner.chooseCategory')}</option>
              ${categoryOptions}
              <option value="__other__">${t('owner.otherCategory')}</option>
            </select>
            <span class="section-hint">${t('owner.categoryHint')}</span>
          </div>
          <div class="field" id="ns-category-other-wrap" style="display:none;">
            <label for="ns-category">${t('owner.categoryOther')}</label>
            <input type="text" id="ns-category" placeholder="ex: Cereale, consum uman direct">
          </div>
          <div class="field" id="ns-tests-wrap">
            <label>${t('owner.testsTitle')}</label>
            <div id="ns-tests-list" class="tests-checklist"></div>
            <span class="section-hint">${t('owner.testsHint')}</span>
          </div>
          <div class="field">
            <label for="ns-sampledBy">${t('owner.sampledBy')}</label>
            <input type="text" id="ns-sampledBy" placeholder="${t('owner.sampledByPh')}">
          </div>
          <div class="field">
            <label for="ns-sampleDate">${t('owner.sampleDate')}</label>
            <input type="date" id="ns-sampleDate" required>
          </div>
          <div class="field">
            <label for="ns-dueDate">${t('owner.requestedDueDate')}</label>
            <input type="date" id="ns-dueDate">
            <span class="section-hint">${t('owner.requestedDueDateHint')}</span>
          </div>
          <div class="field sampling-attest-field">
            <label class="checkbox-row" for="ns-sampling-attest">
              <input type="checkbox" id="ns-sampling-attest">
              <span><strong>${t('owner.samplingAttestTitle')}</strong><br>${t('owner.samplingAttestText')}</span>
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn">${t('owner.registerBtn')}</button>
            <button type="button" class="btn secondary" id="ns-cancel">${t('common.cancel')}</button>
          </div>
        </form>
      </div>
    `;

    const categorySelect = document.getElementById('ns-category-select');
    const otherWrap = document.getElementById('ns-category-other-wrap');
    const otherInput = document.getElementById('ns-category');
    const testsList = document.getElementById('ns-tests-list');

    // Randeaza bifele de analize disponibile pentru categoria curent
    // selectata (sau toate 6, in modul exploratoriu "Altceva"). Toate
    // pornesc bifate implicit - proprietarul poate debifa ce nu are nevoie.
    function renderTestsChecklist() {
      const selectedValue = categorySelect.value;
      let available;
      if (selectedValue === '' ) {
        available = [];
      } else if (selectedValue === '__other__') {
        available = TEST_GROUP_DEFS.map(g => g.key);
      } else {
        const profile = getCategoryProfile(selectedValue);
        available = availableGroupsForProfileClient(profile);
      }
      if (!available.length) {
        testsList.innerHTML = `<div class="empty-hint">${t('owner.noTestsForCategory')}</div>`;
        return;
      }
      testsList.innerHTML = TEST_GROUP_DEFS.filter(g => available.includes(g.key)).map(g => `
        <label class="test-checkbox">
          <input type="checkbox" name="ns-test" value="${g.key}" checked>
          ${t(g.labelKey)}
        </label>
      `).join('');
    }

    categorySelect.addEventListener('change', () => {
      if (categorySelect.value === '__other__') {
        otherWrap.style.display = '';
        otherInput.value = '';
        otherInput.focus();
      } else {
        otherWrap.style.display = 'none';
        otherInput.value = '';
      }
      renderTestsChecklist();
    });
    renderTestsChecklist();

    document.getElementById('ns-cancel').addEventListener('click', () => {
      ownerShowNewForm = false;
      renderOwnerDetail();
    });

    document.getElementById('new-sample-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errorEl = document.getElementById('new-sample-error');
      errorEl.innerHTML = '';
      if (!document.getElementById('ns-sampling-attest').checked) {
        errorEl.innerHTML = `<div class="auth-error">${escapeHtml(t('owner.samplingAttestRequired'))}</div>`;
        return;
      }
      if (!document.getElementById('ns-sampleDate').value) {
        errorEl.innerHTML = `<div class="auth-error">${escapeHtml(t('owner.sampleDateRequired'))}</div>`;
        return;
      }
      // Categoria salvata e fie eticheta profilului ales din lista, fie
      // textul liber introdus manual pentru "Altceva / nu știu categoria".
      const selectedValue = categorySelect.value;
      const category = selectedValue === '__other__'
        ? otherInput.value.trim()
        : (selectedValue || '');
      const requestedTests = [...testsList.querySelectorAll('input[name="ns-test"]:checked')].map(cb => cb.value);
      try {
        const { id } = await api('/samples', {
          method: 'POST',
          body: JSON.stringify({
            productName: document.getElementById('ns-productName').value.trim(),
            category,
            requestedTests,
            sampledBy: document.getElementById('ns-sampledBy').value.trim(),
            sampleDate: document.getElementById('ns-sampleDate').value,
            requestedDueDate: document.getElementById('ns-dueDate').value,
            samplingAttested: document.getElementById('ns-sampling-attest').checked,
          }),
        });
        ownerShowNewForm = false;
        ownerActiveId = id;
        await loadOwnerSamples();
        showToast(t('owner.registeredToast'));
      } catch (err) {
        errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
      }
    });
    return;
  }

  const sample = ownerSamples.find(s => s.id === ownerActiveId);
  if (!sample) {
    panel.innerHTML = `<div class="detail-empty">${t('owner.selectSample')}</div>`;
    updateOwnerGuideProgress(null);
    return;
  }

  await ensureLabBranding();
  await ensureRuleProfilesCache();
  panel.innerHTML = sample.status === 'cancelled'
    ? renderHumanStatus(sample, 'owner') + renderOwnerWorkflowRail(sample) + renderContactLabCard(sample)
    // Buletinul necompletat nu se arata beneficiarului inainte de validare -
    // la fel cum un portal de analize de sange nu arata un formular de
    // laborator gol/pe jumatate completat, ci doar un status ("in lucru"),
    // pana exista un rezultat final, semnat. Vezi renderBulletinPendingCard().
    : renderHumanStatus(sample, 'owner') + renderOwnerWorkflowRail(sample) + renderDueDateChip(sample) + renderNextActionCard(sample, 'owner') + renderContactLabCard(sample) + (sample.validationStatus === 'validated' ? renderBulletinReadOnly(sample) : renderBulletinPendingCard(sample));
  const printBtn = document.getElementById('btn-print');
  if (printBtn) printBtn.addEventListener('click', () => window.print());
  document.getElementById('btn-print-rejection-cert')?.addEventListener('click', () => printRejectionCertificate(sample.id));
  const historyBtn = document.getElementById('btn-history');
  if (historyBtn) historyBtn.addEventListener('click', () => loadUnifiedHistory(sample.id, 'owner-versions-slot'));
  const retestBtn = document.getElementById('btn-request-retest');
  if (retestBtn) retestBtn.addEventListener('click', async () => {
    const reason = window.prompt(t('owner.retestReasonPrompt'), '');
    if (reason === null) return; // anulat
    try {
      await api(`/samples/${sample.id}/retest`, { method: 'POST', body: JSON.stringify({ reason }) });
      showToast(t('owner.retestCreated'));
      await loadOwnerSamples();
    } catch (err) {
      showToast(t('owner.retestError') + ' ' + err.message);
    }
  });
  const trendBtn = document.getElementById('btn-show-trend');
  if (trendBtn) trendBtn.addEventListener('click', () => loadOwnerTrend(sample));
  if (sample.bulletinNo) loadBulletinQr(sample.id);
  loadTrendAlert(sample);
}

async function ensureLabBranding() {
  if (labBranding) return labBranding;
  try {
    const { settings } = await api('/admin/lab-settings');
    labBranding = settings || {};
  } catch (e) {
    labBranding = {};
  }
  return labBranding;
}

async function ensureRuleProfilesCache() {
  if (RULE_PROFILES_CACHE.length) return RULE_PROFILES_CACHE;
  try {
    const data = await api('/results/rules');
    RULE_PROFILES_CACHE = data.profiles || [];
  } catch (e) {
    RULE_PROFILES_CACHE = [];
  }
  return RULE_PROFILES_CACHE;
}

// Cardul afisat beneficiarului IN LOCUL buletinului, cat timp acesta nu e
// inca validat. Practica din portalurile reale de analize (medicale sau de
// alta natura) e consecventa: nu se arata un formular gol/pe jumatate
// completat inainte de a exista un rezultat final - doar un status simplu
// ("in lucru"), pentru a evita confuzia cu date incomplete sau nesigure.
// La aceasta aplicatie, diferenta fata de un panou de analize de sange (unde
// unele teste individuale pot fi eliberate separat, pe masura ce se
// finalizeaza) e ca cei doi contaminanti/parametri de pe un buletin provin
// dintr-o singura rulare analitica, verificata si aprobata ca intreg - nu
// exista, in acest domeniu, un "rezultat partial" cu sens propriu inainte de
// validare, asa ca gate-ul e pe validare completa, nu pe o valoare introdusa.
function renderBulletinPendingCard(sample) {
  const op = ownerProgress(sample);
  const title = !op.received ? t('owner.bulletinPendingWaitingTitle') : t('owner.bulletinPendingTitle');
  const text = !op.received ? t('owner.bulletinPendingWaitingText') : t('owner.bulletinPendingText');
  return `<div class="bulletin-pending-card"><span class="eyebrow">${t('owner.bulletinPendingEyebrow')}</span><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
}

function renderBulletinReadOnly(sample) {
  const afVals = ['afb1', 'afb2', 'afg1', 'afg2'].map(k => sample[k]);
  const afAllEntered = afVals.every(v => v !== null && v !== undefined);
  const afSum = afAllEntered ? afVals.reduce((a, b) => a + b, 0) : null;
  const b = labBranding || {};
  const institutionName = b.institutionName || 'USAMV București · Facultatea de Biotehnologii · Laborator analize contaminanți';

  return `
    <div class="bulletin">
      <div class="bulletin-head">
        <div class="bulletin-head-with-logo">
          ${b.logoDataUrl ? `<img class="bulletin-logo-img" src="${b.logoDataUrl}" alt="Logo laborator">` : ''}
          <div>
            <h1>${bt('bulletin.title')} — ${escapeHtml(sample.code)}</h1>
            <div class="institution">${escapeHtml(institutionName)}</div>
            ${b.institutionAddress ? `<div class="institution">${escapeHtml(b.institutionAddress)}</div>` : ''}
            ${b.institutionEmail ? `<div class="institution">${escapeHtml(b.institutionEmail)}</div>` : ''}
            ${sample.bulletinNo ? `<div class="bulletin-no mono">${bt('bulletin.bulletinNumber')} ${escapeHtml(sample.bulletinNo)} · ${bt('bulletin.issuedOn')} ${escapeHtml(sample.bulletinIssuedAt || '')}</div><div id="bulletin-qr-slot" class="bulletin-qr"></div>` : ''}
          </div>
        </div>
        <div class="verdict ${sample.status}">${statusLabel(sample.status, true)}</div>
      </div>
      <div id="trend-alert-slot"></div>

      <div class="field-grid">
        ${sample.companyName ? `<div class="field"><label>${sample.companyType === 'persoana_fizica' ? bt('bulletin.clientPersonLabel') : bt('bulletin.companyLabel')}</label><div class="field-static">${escapeHtml(sample.companyName)}</div></div>` : ''}
        <div class="field"><label>${bt('bulletin.productLabel')}</label><div class="field-static">${escapeHtml(sample.productName)}</div></div>
        <div class="field"><label>${bt('bulletin.categoryLabel')}</label><div class="field-static">${sample.category ? btCategory(sample.category) : '—'}</div></div>
        <div class="field"><label>${bt('bulletin.sampledByLabel')}</label><div class="field-static">${escapeHtml(sample.sampledBy || '—')}</div></div>
        <div class="field"><label>${bt('bulletin.sampleDateLabel')}</label><div class="field-static">${sample.sampleDate || '—'}</div></div>
        <div class="field"><label>${bt('bulletin.receiptDateLabel')}</label><div class="field-static">${sample.intakeCheckedAt ? escapeHtml(String(sample.intakeCheckedAt).slice(0, 10)) : '—'}</div></div>
        <div class="field"><label>${bt('bulletin.analysisDateLabel')}</label><div class="field-static">${sample.analysisDate || '—'}</div></div>
        <div class="field"><label>${bt('bulletin.method')}</label><div class="field-static">${escapeHtml(sample.method || '—')}</div></div>
        <div class="field"><label>${bt('bulletin.equipment')}</label><div class="field-static">${escapeHtml(sample.equipment || '—')}</div></div>
        <div class="field"><label>${bt('bulletin.validation')}</label><div class="field-static"><span class="validation-badge ${sample.validationStatus === 'validated' ? 'validated' : ''}">${sample.validationStatus === 'validated' ? bt('bulletin.validated') : bt('bulletin.draft')}</span>${sample.validatedByName ? ` · ${escapeHtml(sample.validatedByName)}` : ''}</div></div>
      </div>
      <div id="rule-info" class="rule-info">${bt('bulletin.ruleInfo')}</div>

      <div class="section-label"><span>${bt('bulletin.contaminants')} <span class="unit">(µg/kg)</span></span><span class="section-hint">${bt('bulletin.enterMethodValues')}</span></div>
      <table class="contaminants">
        <thead>
          <tr><th style="padding-left:28px;">${bt('bulletin.contaminant')}</th><th>${bt('bulletin.result')}</th><th>${bt('bulletin.maxLimit')}</th><th>${bt('bulletin.verdict')}</th></tr>
        </thead>
        <tbody>
          ${(() => {
            const profile = getCategoryProfile(sample.category);
            // Sursa de adevar este lista de analize comandate la
            // inregistrare. Fara ea (probe mai vechi, dinainte de aceasta
            // functionalitate), revenim la relevanta dedusa din profilul de
            // categorie, ca sa nu se piarda afisarea corecta a buletinelor deja emise.
            const requested = sample.requestedTests;
            const legacyKeyMap = { aflatoxins: 'afb1', ota: 'ota', m1: 'm1', don: 'don', zea: 'zea', fum: 'fum' };
            const hasTest = (group) => requested ? requested.includes(group) : isContaminantRelevant(legacyKeyMap[group], profile);
            let rows = '';

            AFLATOXIN_ROWS.forEach(row => {
              const val = sample[row.key];
              const hasVal = val !== null && val !== undefined;
              if (!hasTest('aflatoxins') && !hasVal) return; // analiza necomandata si fara date
              const limitKey = row.key === 'afb1' ? 'limitAfb1' : null;
              const limit = limitKey ? sample[limitKey] : null;
              const isOver = limit !== null && hasVal && val > limit;
              let flag = `<span class="result-flag empty">${t('common.pending')}</span>`;
              if (hasVal) {
                if (limit === null) flag = `<span class="result-flag empty">${bt('bulletin.noLimit')}</span>`;
                else flag = isOver ? `<span class="result-flag fail">${bt('common.exceeded')}</span>` : `<span class="result-flag ok">${bt('common.conform')}</span>`;
              }
              rows += `
                <tr>
                  <td class="name-cell" style="padding-left:28px;">${row.label}</td>
                  <td class="mono readonly-val">${hasVal ? val : '—'}</td>
                  <td class="limit-cell mono">${limit !== null && limit !== undefined ? limit : '—'}</td>
                  <td>${flag}</td>
                </tr>
              `;
            });

            // Suma aflatoxinelor apare doar daca pachetul de aflatoxine a
            // fost comandat (sau daca exista deja date calculate).
            if (hasTest('aflatoxins') || afSum !== null) {
              rows += `
                <tr class="sum-row">
                  <td class="name-cell">${bt('bulletin.aflatoxinSum')}</td>
                  <td class="mono">${afSum !== null ? afSum.toFixed(2) : '—'}</td>
                  <td class="limit-cell mono">${sample.limitAflaSum ?? '—'}</td>
                  <td>${afSum !== null && sample.limitAflaSum !== null && afSum > sample.limitAflaSum ? `<span class="result-flag fail">${bt('common.exceeded')}</span>` : afSum !== null ? `<span class="result-flag ok">${bt('common.conform')}</span>` : `<span class="result-flag empty">${t('common.pending')}</span>`}</td>
                </tr>
              `;
            }

            // OTA e independent de suma aflatoxinelor - afisat separat, doar
            // daca a fost comandat sau daca are deja date.
            const otaVal = sample.ota;
            const otaHasVal = otaVal !== null && otaVal !== undefined;
            if (hasTest('ota') || otaHasVal) {
              const limit = sample.limitOta;
              const isOver = limit !== null && otaHasVal && otaVal > limit;
              let flag = `<span class="result-flag empty">${t('common.pending')}</span>`;
              if (otaHasVal) {
                flag = isOver ? `<span class="result-flag fail">${bt('common.exceeded')}</span>` : `<span class="result-flag ok">${bt('common.conform')}</span>`;
              }
              rows += `
                <tr class="ota-row">
                  <td class="name-cell" style="padding-left:28px;">${OTA_ROW.label}</td>
                  <td class="mono readonly-val">${otaHasVal ? otaVal : '—'}</td>
                  <td class="limit-cell mono">${limit !== null && limit !== undefined ? limit : '—'}</td>
                  <td>${flag}</td>
                </tr>
              `;
            }

            // M1 (doar lapte) - afisat daca a fost comandat (chiar fara date
            // inca) sau daca exista deja date.
            const m1HasVal = sample.m1 !== null && sample.m1 !== undefined;
            const m1HasLimit = sample.limitM1 !== null && sample.limitM1 !== undefined;
            if (hasTest('m1') || m1HasVal || m1HasLimit) {
              const isOver = m1HasLimit && m1HasVal && sample.m1 > sample.limitM1;
              let flag = `<span class="result-flag empty">${t('common.pending')}</span>`;
              if (m1HasVal) flag = isOver ? `<span class="result-flag fail">${bt('common.exceeded')}</span>` : `<span class="result-flag ok">${bt('common.conform')}</span>`;
              rows += `
                <tr class="m1-row">
                  <td class="name-cell" style="padding-left:28px;">${bt('bulletin.aflatoxinM1Name')} <span class="section-hint">${bt('bulletin.milkOnly')}</span></td>
                  <td class="mono">${m1HasVal ? sample.m1 : '—'}</td>
                  <td class="limit-cell mono">${m1HasLimit ? sample.limitM1 : '—'}</td>
                  <td>${flag}</td>
                </tr>
              `;
            }

            rows += renderReadOnlyExtraToxinRow(bt('bulletin.donName'), sample.don, sample.limitDon, bt('bulletin.fusariumToxins'), hasTest('don'));
            rows += renderReadOnlyExtraToxinRow(bt('bulletin.zeaName'), sample.zea, sample.limitZea, bt('bulletin.fusariumToxins'), hasTest('zea'));
            rows += renderReadOnlyExtraToxinRow(bt('bulletin.fumName'), sample.fum, sample.limitFum, bt('bulletin.fusariumMaize'), hasTest('fum'));

            return rows;
          })()}
        </tbody>
      </table>

      <div class="section-hint" style="margin:8px 0;">${bt('bulletin.limitsBasis')}: ${sample.limitBasis === 'profile' || sample.limitBasis === 'manual' ? `${escapeHtml(sample.limitSource || '')}${sample.limitRegulationRef ? ` — ${escapeHtml(sample.limitRegulationRef)}` : ''}${sample.limitBasis === 'manual' ? ` — ${bt('bulletin.limitsManual')}: ${escapeHtml(sample.limitOverrideReason || '')}` : ''}` : (sample.limitBasis === 'fallback' ? bt('bulletin.limitsFallback') : bt('bulletin.limitsUndocumented'))}</div>

      <div class="section-label">${bt('bulletin.operatorNotes')}</div>
      <div class="notes-area"><p class="readonly-notes">${sample.notes ? escapeHtml(sample.notes) : bt('bulletin.noNotes')}</p></div>

      ${sample.bulletinNo && (labBranding?.signatureDataUrl || labBranding?.signatureName || labBranding?.stampDataUrl) ? `
      <div class="bulletin-signature-block">
        ${labBranding.signatureDataUrl ? `<img class="bulletin-sig-img" src="${labBranding.signatureDataUrl}" alt="${t('bulletin.signatureAltReal')}">` : ''}
        ${labBranding.stampDataUrl ? `<img class="bulletin-stamp-img" src="${labBranding.stampDataUrl}" alt="${t('bulletin.stampAltReal')}">` : ''}
        ${labBranding.signatureName ? `<div class="bulletin-sig-name">${escapeHtml(labBranding.signatureName)}${labBranding.signatureRole ? ` · ${escapeHtml(labBranding.signatureRole)}` : ''}</div>` : ''}
        <div class="section-hint">${bt('bulletin.simpleSignatureNote')}</div>
      </div>` : ''}
      <div class="section-hint bulletin-sampling-disclaimer">${bt('bulletin.samplingDisclaimer')}</div>

      <div class="actions-row">
        <div class="save-state" id="save-state">${t('bulletin.allSaved')}</div>
        <div class="actions-left">
          <button class="btn secondary" id="btn-print" ${sample.validationStatus !== 'validated' ? 'disabled title="' + escapeAttr(t('bulletin.printDisabledHint')) + '"' : ''}>${t('bulletin.generateBulletin')}</button>
          <button class="btn secondary" id="btn-history">${t('common.historyTitle')}</button>
          ${currentUser.role !== 'operator' ? `<button class="btn secondary" id="btn-request-retest">${t('owner.requestRetest')}</button>` : ''}
          ${sample.category && currentUser.role === 'owner' ? `<button class="btn secondary" id="btn-show-trend">${t('owner.viewTrend')}</button>` : ''}
        </div>
      </div>
      ${sample.validationStatus !== 'validated' ? `<p class="section-hint" style="padding:0 4px;">${t('bulletin.printDisabledHint')}</p>` : ''}
      ${sample.retestOfCode ? `<p class="section-hint retest-origin-hint" style="padding:0 4px;">${t('owner.retestOfPrefix')} ${escapeHtml(sample.retestOfCode)}</p>` : ''}
      <div id="owner-versions-slot"></div>
      <div id="owner-trend-slot"></div>
    </div>
  `;
}



async function loadBulletinQr(sampleId) {
  const slot = document.getElementById('bulletin-qr-slot');
  if (!slot) return;
  try {
    const { dataUrl, url } = await api(`/results/${sampleId}/bulletin-qr`);
    slot.innerHTML = `
      <div class="bulletin-qr-inner">
        <img src="${dataUrl}" alt="QR verificare buletin" title="${escapeHtml(url)}">
        <span class="bulletin-qr-label">${bt('bulletin.scanToVerify')}</span>
      </div>
    `;
  } catch (_) {}
}

const TREND_CONTAMINANT_NAMES = {
  afb1: 'afb1Name', aflaSum: 'aflatoxinSum', ota: 'otaName', don: 'donName', zea: 'zeaName', fum: 'fumName',
};

async function loadTrendAlert(sample) {
  const slot = document.getElementById('trend-alert-slot');
  if (!slot || !sample.category) return;
  try {
    const { trendAlerts } = await api(`/samples/trend?category=${encodeURIComponent(sample.category)}`);
    if (!trendAlerts || !Object.keys(trendAlerts).length) { slot.innerHTML = ''; return; }
    const items = Object.entries(trendAlerts).map(([key, alert]) => {
      const nameKey = TREND_CONTAMINANT_NAMES[key];
      const contaminantName = nameKey ? bt('bulletin.' + nameKey) : key;
      const body = bt('bulletin.trendAlertBody').replace(/\{contaminant\}/g, contaminantName).replace(/\{n\}/g, alert.n);
      return `<div class="trend-alert-item">${body}</div>`;
    }).join('');
    slot.innerHTML = `
      <div class="trend-alert-box">
        <div class="trend-alert-heading">⚠ ${bt('bulletin.trendAlertTitle')}</div>
        ${items}
      </div>
    `;
  } catch (_) { slot.innerHTML = ''; }
}

// Eticheta fizica a probei - cod + QR, gata de lipit pe recipient. Separata
// de codul QR al buletinului (care exista doar dupa validare): eticheta
// trebuie sa fie disponibila chiar de la inregistrare, cand proba ajunge
// fizic in laborator, nu abia la final.
// Certificat de respingere la receptie - "hartia la mana" pentru o proba
// anulata la poarta de intrare. Raspunde direct §7.4.3 ISO/IEC 17025:
// abaterea constatata la primire trebuie inregistrata, nu doar comunicata
// verbal. Motivul exista deja in aplicatie; aici devine document tiparibil.
async function printRejectionCertificate(sampleId) {
  let data;
  try {
    data = await api(`/results/${sampleId}/rejection-certificate`);
  } catch (err) {
    showToast(t('common.printRejectionCertError') + ' ' + err.message);
    return;
  }
  const win = window.open('', '_blank', 'width=480,height=620');
  if (!win) { showToast(t('operator.printLabelPopupBlocked')); return; }
  const nowStr = new Date().toLocaleString('ro-RO');
  win.document.write(`
    <!DOCTYPE html>
    <html lang="ro">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(data.code)}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 24px; color: #1c2b24; }
        .cert-title { font-size: 12px; letter-spacing: .04em; color: #8A6D1A; text-transform: uppercase; font-weight: 700; margin: 0 0 4px; }
        h1 { font-size: 19px; margin: 0 0 18px; }
        .row { display: flex; gap: 16px; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #E4E9E6; }
        .row .label { width: 150px; font-size: 11px; color: #5B6B62; flex-shrink: 0; }
        .row .value { font-size: 13px; font-weight: 600; }
        .reason-box { margin-top: 14px; padding: 12px; background: #FBEAEA; border: 1px solid #E7B9B9; border-radius: 8px; }
        .reason-box .label { font-size: 11px; color: #A23B3B; font-weight: 700; margin-bottom: 4px; }
        .footer { margin-top: 20px; display: flex; align-items: center; gap: 12px; }
        .footer img { width: 60px; height: 60px; }
        .footer .clause { font-size: 10px; color: #5B6B62; font-style: italic; }
        .print-bar { margin-top: 22px; text-align: center; }
        .print-bar button { font-size: 13px; padding: 6px 14px; cursor: pointer; }
        @media print { .print-bar { display: none; } }
      </style>
    </head>
    <body>
      <p class="cert-title">${escapeHtml(t('common.printRejectionCertTitle'))}</p>
      <h1>${escapeHtml(data.code)} — ${escapeHtml(data.productName || '')}</h1>
      <div class="row"><span class="label">${escapeHtml(t('common.certCategory'))}</span><span class="value">${escapeHtml(data.category || '—')}</span></div>
      <div class="row"><span class="label">${escapeHtml(t('common.certClient'))}</span><span class="value">${escapeHtml(data.companyName || data.ownerName || '—')}</span></div>
      <div class="row"><span class="label">${escapeHtml(t('common.certSampleDate'))}</span><span class="value">${escapeHtml(data.sampleDate || '—')}</span></div>
      <div class="row"><span class="label">${escapeHtml(t('common.certHandledBy'))}</span><span class="value">${escapeHtml(data.operatorName || '—')}</span></div>
      <div class="row"><span class="label">${escapeHtml(t('common.certGeneratedOn'))}</span><span class="value">${escapeHtml(nowStr)}</span></div>
      <div class="reason-box">
        <div class="label">${escapeHtml(t('common.certReasonLabel'))}</div>
        <div>${escapeHtml(data.reason)}</div>
      </div>
      <div class="footer">
        ${data.dataUrl ? `<img src="${data.dataUrl}" alt="QR">` : ''}
        <div class="clause">${escapeHtml(t('common.certIsoClause'))}</div>
      </div>
      <div class="print-bar"><button onclick="window.print()">${escapeHtml(t('operator.printLabelPrintNow'))}</button></div>
    </body>
    </html>
  `);
  win.document.close();
}

async function printSampleLabel(sampleId) {
  let data;
  try {
    data = await api(`/results/${sampleId}/label-qr`);
  } catch (err) {
    showToast(t('operator.printLabelError') + ' ' + err.message);
    return;
  }
  const win = window.open('', '_blank', 'width=440,height=420');
  if (!win) { showToast(t('operator.printLabelPopupBlocked')); return; }
  const dateStr = data.sampleDate || '';
  win.document.write(`
    <!DOCTYPE html>
    <html lang="ro">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(data.code)}</title>
      <style>
        @page { size: 62mm 45mm; margin: 2mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 8px; }
        .label { border: 1px solid #ccc; border-radius: 6px; padding: 8px; }
        .label-top { display: flex; align-items: center; gap: 10px; }
        .label-top img { width: 72px; height: 72px; flex-shrink: 0; }
        .label .info { min-width: 0; }
        .label .code { font: 700 15px 'IBM Plex Mono', 'Courier New', monospace; margin: 0 0 4px; }
        .label .product { font-size: 12px; font-weight: 600; margin: 0 0 2px; word-break: break-word; }
        .label .meta { font-size: 10px; color: #555; margin: 0; }
        .label-barcode { margin-top: 6px; text-align: center; }
        .label-barcode img { max-width: 100%; height: 40px; }
        .print-bar { margin-top: 10px; text-align: center; }
        .print-bar button { font-size: 13px; padding: 6px 14px; cursor: pointer; }
        @media print { .print-bar { display: none; } body { padding: 0; } .label { border: none; } }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="label-top">
          <img src="${data.dataUrl}" alt="QR">
          <div class="info">
            <p class="code">${escapeHtml(data.code)}</p>
            <p class="product">${escapeHtml(data.productName || '')}</p>
            <p class="meta">${escapeHtml(dateStr)}</p>
          </div>
        </div>
        ${data.barcodeDataUrl ? `<div class="label-barcode"><img src="${data.barcodeDataUrl}" alt="Cod de bare"></div>` : ''}
      </div>
      <div class="print-bar"><button onclick="window.print()">${escapeHtml(t('operator.printLabelPrintNow'))}</button></div>
    </body>
    </html>
  `);
  win.document.close();
}


async function loadUnifiedHistory(sampleId, slotId = 'versions-slot') {
  const AUDIT_LABEL_KEYS = {
    results_saved: 'common.auditResultsSaved',
    result_validated: 'common.auditResultValidated',
    review_approved: 'common.auditReviewApproved',
    review_rejected: 'common.auditReviewRejected',
    sampling_attested: 'common.auditSamplingAttested',
    qc_rejected: 'common.auditQcRejected',
    control_sample_completed: 'common.auditControlSampleCompleted',
    haccp_context_updated: 'common.auditHaccpContextUpdated',
    nonconforming_work_opened: 'common.auditNonconformingOpened',
    nonconforming_work_closed: 'common.auditNonconformingClosed',
    retest_requested: 'common.auditRetestRequested',
    system_incident_opened: 'common.auditIncidentOpened',
    system_incident_updated: 'common.auditIncidentUpdated',
  };
  try {
    const [{ audit }, { versions }] = await Promise.all([
      api(`/samples/${sampleId}/audit`),
      api(`/results/${sampleId}/versions`),
    ]);
    // O singura cronologie, nu doua liste separate cu logica diferita -
    // evenimentele generale (audit_log) si corectiile ulterioare validarii
    // (result_versions) sunt fatete ale ACELUIASI istoric, nu doua concepte.
    const items = [
      ...audit.map(a => ({
        createdAt: a.createdAt,
        who: a.userName,
        label: t(AUDIT_LABEL_KEYS[a.action] || 'common.auditResultsSaved'),
        isCorrection: false,
      })),
      ...versions.map(v => ({
        createdAt: v.createdAt,
        who: v.changedByName,
        label: `${t('common.auditResultsSaved')} · ${t('owner.versionLabel')} ${v.versionNo}`,
        reason: v.changeReason ? `${t('owner.changeReasonLabel')}: ${escapeHtml(v.changeReason)}` : '',
        changesHtml: formatVersionChanges(v.changes),
        isCorrection: true,
      })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const html = items.length ? items.map(it => `
      <div class="audit-row${it.isCorrection ? ' audit-row-version' : ''}">
        <div>
          <strong>${escapeHtml(it.label)}</strong>
          <div class="audit-details">${escapeHtml(it.who || t('owner.userFallback'))}</div>
          ${it.reason ? `<div class="version-reason">${it.reason}</div>` : ''}
          ${it.changesHtml || ''}
        </div>
        <time>${escapeHtml(it.createdAt)}</time>
      </div>
    `).join('') : `<div class="empty-list">${t('common.historyEmpty')}</div>`;

    const slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = `<div class="audit-card"><div class="dashboard-card-head"><h3>${t('common.historyTitle')}</h3><button class="btn secondary" id="btn-close-history-${slotId}">${t('common.close')}</button></div>${html}</div>`;
    const closeBtn = document.getElementById(`btn-close-history-${slotId}`);
    if (closeBtn) closeBtn.onclick = () => { slot.innerHTML = ''; };
  } catch (e) { showToast(t('common.historyLoadError')); }
}

// Notă: verificarea publică a buletinului (scanare cod QR) este acum
// servită direct de server.js prin pagina dedicată public/verify.html,
// independentă de aplicația principală (fără autentificare, fără app.js).

// ================= OWNER ARCHIVE VIEW =================
function renderOwnerArchiveView() {
  const root = document.getElementById('owner-view-root');
  root.innerHTML = `
    <div class="detail view-transition">
      <div class="archive-toolbar">
        <div class="field">
          <label for="af-category">${t('owner.archiveCategory')}</label>
          <input type="text" id="af-category" placeholder="${t('owner.archiveCategoryPh')}" value="${escapeHtml(archiveFilters.category)}">
        </div>
        <div class="field narrow">
          <label for="af-status">${t('owner.archiveStatus')}</label>
          <select id="af-status">
            <option value="">${t('owner.archiveAll')}</option>
            <option value="ok" ${archiveFilters.status === 'ok' ? 'selected' : ''}>${t('common.conform')}</option>
            <option value="fail" ${archiveFilters.status === 'fail' ? 'selected' : ''}>${t('common.exceeded')}</option>
            <option value="pending" ${archiveFilters.status === 'pending' ? 'selected' : ''}>${t('common.pending')}</option>
            <option value="in_analysis" ${archiveFilters.status === 'in_analysis' ? 'selected' : ''}>${t('common.inAnalysis')}</option>
          </select>
        </div>
        <div class="field narrow">
          <label for="af-dateFrom">${t('owner.archiveDateFrom')}</label>
          <input type="date" id="af-dateFrom" value="${archiveFilters.dateFrom}">
        </div>
        <div class="field narrow">
          <label for="af-dateTo">${t('owner.archiveDateTo')}</label>
          <input type="date" id="af-dateTo" value="${archiveFilters.dateTo}">
        </div>
        <div class="archive-actions">
          <button class="btn secondary" id="btn-archive-filter">${t('owner.archiveFilter')}</button>
          <button class="btn" id="btn-archive-export">${t('owner.archiveExport')}</button>
        </div>
      </div>
      <div class="archive-table-wrap">
        <table class="archive-table" id="archive-table">
          <thead>
            <tr>
              <th>${t('owner.archiveColCode')}</th><th>${t('owner.archiveColProduct')}</th><th>${t('owner.archiveColCategory')}</th><th>${t('owner.archiveColDate')}</th><th>${t('owner.archiveColStatus')}</th>
            </tr>
          </thead>
          <tbody id="archive-tbody">
            <tr><td colspan="5" class="archive-empty">${t('common.loading')}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="archive-count" id="archive-count"></div>
      <div class="pagination-controls" id="archive-pagination"></div>
    </div>
  `;

  document.getElementById('btn-archive-filter').addEventListener('click', () => {
    archiveFilters.category = document.getElementById('af-category').value.trim();
    archiveFilters.status = document.getElementById('af-status').value;
    archiveFilters.dateFrom = document.getElementById('af-dateFrom').value;
    archiveFilters.dateTo = document.getElementById('af-dateTo').value;
    archivePage = 1;
    loadArchive();
  });

  document.getElementById('btn-archive-export').addEventListener('click', () => {
    archiveFilters.category = document.getElementById('af-category').value.trim();
    archiveFilters.status = document.getElementById('af-status').value;
    archiveFilters.dateFrom = document.getElementById('af-dateFrom').value;
    archiveFilters.dateTo = document.getElementById('af-dateTo').value;
    exportArchiveCsv();
  });

  archivePage = 1;
  loadArchive();
}

function buildArchiveQuery() {
  const params = new URLSearchParams();
  if (archiveFilters.status) params.set('status', archiveFilters.status);
  if (archiveFilters.category) params.set('category', archiveFilters.category);
  if (archiveFilters.dateFrom) params.set('dateFrom', archiveFilters.dateFrom);
  if (archiveFilters.dateTo) params.set('dateTo', archiveFilters.dateTo);
  params.set('page', archivePage);
  return params.toString();
}

async function loadArchive() {
  const tbody = document.getElementById('archive-tbody');
  const countEl = document.getElementById('archive-count');
  const paginationEl = document.getElementById('archive-pagination');
  if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="archive-empty">${t('common.loading')}</td></tr>`;

  let pageSize = 50;
  try {
    const qs = buildArchiveQuery();
    const data = await api('/samples/archive' + (qs ? '?' + qs : ''));
    archiveSamples = data.samples;
    archiveTotal = data.total;
    archivePage = data.page;
    pageSize = data.pageSize;
  } catch (e) {
    showToast(t('owner.archiveLoadErrorOwner'));
    archiveSamples = [];
    archiveTotal = 0;
  }

  if (!tbody) return; // utilizatorul a schimbat view-ul intre timp

  if (archiveSamples.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="archive-empty">${t('owner.archiveNoResults')}</td></tr>`;
    countEl.textContent = '';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = archiveSamples.map(s => `
    <tr data-id="${s.id}">
      <td class="code-cell">${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.productName)}</td>
      <td>${s.category ? escapeHtml(categoryLabel(s.category)) : '—'}</td>
      <td>${s.sampleDate || '—'}</td>
      <td><span class="result-flag ${s.status === 'cancelled' ? 'cancelled' : s.validationStatus === 'validated' ? 'ok' : 'empty'}">${archiveWorkflowLabel(s)}</span></td>
    </tr>
  `).join('');

  const rangeStart = (archivePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(archivePage * pageSize, archiveTotal);
  countEl.textContent = `${t('owner.paginationShowing')} ${rangeStart}–${rangeEnd} ${t('owner.paginationOf')} ${archiveTotal}`;

  if (paginationEl) {
    const hasPrev = archivePage > 1;
    const hasNext = archivePage * pageSize < archiveTotal;
    paginationEl.innerHTML = `
      <button class="btn secondary small-btn" id="archive-prev" ${hasPrev ? '' : 'disabled'}>${t('owner.paginationPrev')}</button>
      <span class="pagination-page-label">${archivePage}</span>
      <button class="btn secondary small-btn" id="archive-next" ${hasNext ? '' : 'disabled'}>${t('owner.paginationNext')}</button>
    `;
    if (hasPrev) document.getElementById('archive-prev').addEventListener('click', () => { archivePage -= 1; loadArchive(); });
    if (hasNext) document.getElementById('archive-next').addEventListener('click', () => { archivePage += 1; loadArchive(); });
  }

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      ownerActiveId = parseInt(row.dataset.id, 10);
      ownerView = 'samples';
      renderOwnerViewRoot();
      updateOwnerGuideProgress(archiveSamples.find(s => s.id === ownerActiveId));
      // sincronizeaza si tab-ul activ din header fara re-render complet al aplicatiei
      document.querySelectorAll('.header-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'samples');
      });
    });
  });
}

function exportArchiveCsv() {
  const qs = buildArchiveQuery();
  window.location.href = '/api/samples/archive/export' + (qs ? '?' + qs : '');
}

// ================= SHARED DASHBOARD =================
async function renderDashboardView() {
  const root = document.getElementById('operator-view-root') || document.getElementById('admin-view-root');
  if (!root) return;
  root.innerHTML = `<div class="dashboard view-transition"><div class="dashboard-loading">${t('operator.dashboardLoading')}</div></div>`;
  try {
    const { metrics, recent } = await api('/dashboard');
    root.innerHTML = `
      <div class="dashboard view-transition">
        <div class="dashboard-head">
          <div><h2>${t('operator.dashboardTitle')}</h2><p>${t('operator.dashboardSubtitle')}</p></div>
          <button class="btn secondary" id="btn-refresh-dashboard">${t('operator.dashboardRefresh')}</button>
        </div>
        <div class="metric-grid">
          <div class="metric-card"><span>${t('operator.metricTotal')}</span><strong>${metrics.total}</strong></div>
          <div class="metric-card"><span>${t('operator.metricPending')}</span><strong>${metrics.pending}</strong></div>
          <div class="metric-card"><span>${t('operator.metricInAnalysis')}</span><strong>${metrics.inAnalysis}</strong></div>
          <div class="metric-card"><span>${t('operator.metricConform')}</span><strong>${metrics.conform}</strong></div>
          <div class="metric-card danger-metric"><span>${t('operator.metricFail')}</span><strong>${metrics.fail}</strong></div>
          <div class="metric-card"><span>${t('operator.metricCancelled')}</span><strong>${metrics.cancelled}</strong></div>
          <div class="metric-card"><span>${t('operator.metricValidated')}</span><strong>${metrics.validated}</strong></div>
          <div class="metric-card"><span>${t('operator.metricQcAccepted')}</span><strong>${metrics.qcAccepted}</strong></div>
        </div>
        ${renderAttentionPanel(metrics)}
        <div class="dashboard-card">
          <div class="dashboard-card-head"><h3>${t('operator.recentSamples')}</h3><span>${t('operator.lastEight')}</span></div>
          <div class="recent-table-wrap"><table class="archive-table"><thead><tr><th>${t('operator.colCode')}</th><th>${t('operator.colProduct')}</th><th>${t('operator.colOwner')}</th><th>${t('operator.colStatus')}</th><th>${t('operator.colQc')}</th><th>${t('operator.colValidation')}</th></tr></thead><tbody>
          ${recent.length ? recent.map(r => `<tr data-id="${r.id}"><td class="code-cell">${escapeHtml(r.code)}</td><td>${escapeHtml(r.productName)}</td><td>${escapeHtml(r.ownerName || '—')}</td><td><span class="result-flag ${r.status === 'cancelled' ? 'cancelled' : r.status === 'ok' ? 'ok' : r.status === 'fail' ? 'fail' : 'empty'}">${statusLabelUI(r.status)}</span></td><td>${r.qcStatus === 'accepted' ? t('operator.qcAccepted') : r.qcStatus === 'not_required' ? t('operator.qcNotApplicable') : t('operator.qcWaiting')}</td><td>${r.status === 'cancelled' ? t('common.cancelledStatus') : r.validationStatus === 'validated' ? t('operator.validatedShort2') : t('operator.draftShort')}</td></tr>`).join('') : `<tr><td colspan="6" class="archive-empty">${t('operator.noSamples')}</td></tr>`}
          </tbody></table></div>
        </div>
        <div class="dashboard-note"><strong>${t('common.note')}:</strong> ${t('operator.dashboardPocNote')}</div>
      </div>`;
    document.getElementById('btn-refresh-dashboard').addEventListener('click', renderDashboardView);
    root.querySelectorAll('tr[data-id]').forEach(row => row.addEventListener('click', () => {
      operatorActiveId = parseInt(row.dataset.id, 10); operatorView = 'queue';
      const openedSample = operatorQueue.find(s => s.id === operatorActiveId);
      if (openedSample && openedSample.hasUpdate) {
        openedSample.hasUpdate = false;
        api(`/results/${operatorActiveId}/mark-seen`, { method: 'POST' }).catch(() => {});
      }
      renderOperatorViewRoot();
      document.querySelectorAll('.header-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'queue'));
    }));
  } catch (e) {
    root.innerHTML = `<div class="detail-empty">${t('operator.dashboardUnavailable')}</div>`;
  }
}

// ================= OPERATOR APP =================
async function renderOperatorApp() {
  const isValidator = currentUser.role === 'validator';
  const tabs = [
    { key: 'dashboard', label: t('operator.tabDashboard'), active: operatorView === 'dashboard' },
    { key: 'queue', label: t('operator.tabQueue'), active: operatorView === 'queue' },
    { key: 'archive', label: t('operator.tabArchive'), active: operatorView === 'archive' },
  ];

  app.innerHTML = `
    ${renderHeader(isValidator ? t('operator.portalSubtitleValidator') : t('operator.portalSubtitleOperator'), isValidator ? t('common.validator') : t('common.operator'), isValidator ? 'validator' : 'operator', tabs)}
    <div class="page-shell">${renderRoleGuide(isValidator ? 'validator' : 'operator')}<div id="operator-view-root"></div></div>
  `;
  attachLogout();

  document.querySelectorAll('.header-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      operatorView = tab.dataset.tab;
      document.querySelectorAll('.header-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === operatorView));
      renderOperatorViewRoot();
    });
  });

  renderOperatorViewRoot();
}

function renderOperatorViewRoot() {
  if (operatorView === 'dashboard') {
    renderDashboardView();
  } else if (operatorView === 'archive') {
    renderOperatorArchiveView();
  } else {
    renderOperatorQueueView();
  }
}

function renderOperatorQueueView() {
  const root = document.getElementById('operator-view-root');
  root.innerHTML = `
    <div class="workload-strip" id="operator-workload-strip" aria-label="${t('operator.workloadAriaLabel')}"></div>
    <div class="layout view-transition operator-layout">
      <aside class="registry">
        <div class="registry-head">
          <div class="queue-title-row"><div><h2>${t('operator.registryTitle')}</h2><div class="registry-subtitle">${t('operator.registrySubtitle')}</div></div><span class="queue-count" id="queue-count">0</span></div>
          <button class="btn secondary small-btn" id="btn-new-control-sample" style="margin-top:8px;">${t('operator.newControlSampleBtn')}</button>
        </div>
        <div class="search-row">
          <input type="text" id="search-input" placeholder="${t('operator.searchPlaceholder')}" aria-label="${t('operator.searchPlaceholder')}">
        </div>
        <div class="queue-filters" role="tablist" aria-label="${t('operator.filterQueueAria')}">
          <button class="queue-filter active" data-filter="all">${t('operator.filterAll')}</button>
          <button class="queue-filter" data-filter="pending">${t('operator.filterPending')}</button>
          <button class="queue-filter" data-filter="in_analysis">${t('operator.filterInAnalysis')}</button>
          <button class="queue-filter" data-filter="validated">${t('operator.filterValidated')}</button>
          <button class="queue-filter" data-filter="cancelled">${t('operator.filterCancelled')}</button>
        </div>
        <div class="sample-list" id="sample-list"><div class="empty-list">${t('common.loading')}</div></div>
      </aside>
      <main class="detail" id="detail-panel">
        <div class="detail-empty">${t('operator.detailEmpty')}</div>
      </main>
    </div>
  `;

  document.getElementById('search-input').addEventListener('input', (e) => {
    operatorSearchTerm = e.target.value;
    renderOperatorList();
  });
  document.querySelectorAll('.queue-filter').forEach(btn => btn.addEventListener('click', () => {
    operatorQueueFilter = btn.dataset.filter;
    document.querySelectorAll('.queue-filter').forEach(b => b.classList.toggle('active', b === btn));
    renderOperatorList();
  }));
  document.getElementById('btn-new-control-sample').addEventListener('click', () => {
    operatorActiveId = null;
    document.querySelectorAll('.sample-row').forEach(r => r.classList.remove('active'));
    renderControlSampleForm();
  });

  loadOperatorQueue();
}

function renderControlSampleForm() {
  const panel = document.getElementById('detail-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="new-sample-form">
      <div class="form-kicker">${t('operator.controlFormKicker')}</div><h2>${t('operator.controlFormTitle')}</h2>
      <p class="section-hint">${t('operator.controlFormHint')}</p>
      <div id="control-sample-error"></div>
      <form id="control-sample-form">
        <div class="field">
          <label for="cs-productName">${t('operator.controlNameLabel')}</label>
          <input type="text" id="cs-productName" required placeholder="${t('operator.controlNamePlaceholder')}">
        </div>
        <div class="field">
          <label for="cs-category">${t('operator.controlCategoryLabel')}</label>
          <input type="text" id="cs-category" placeholder="${t('operator.controlCategoryPlaceholder')}">
        </div>
        <div class="section-label">${t('operator.controlTargetsLabel')}</div>
        ${TEST_GROUP_DEFS.map(g => `
          <div class="field">
            <label for="cs-target-${g.key}">${t(g.labelKey)}</label>
            <input type="number" step="0.001" min="0" id="cs-target-${g.key}" placeholder="${t('operator.controlTargetPlaceholder')}">
          </div>
        `).join('')}
        <div class="form-actions">
          <button type="submit" class="btn">${t('operator.controlRegisterBtn')}</button>
          <button type="button" class="btn secondary" id="cs-cancel">${t('operator.controlCancelBtn')}</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cs-cancel').addEventListener('click', () => {
    panel.innerHTML = `<div class="detail-empty">${t('operator.detailEmpty')}</div>`;
  });

  document.getElementById('control-sample-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('control-sample-error');
    errorEl.innerHTML = '';
    const targets = {};
    // "aflaSum" e cheia folosita de backend pentru limita sumei aflatoxinelor -
    // grupul "aflatoxins" din formular seteaza direct aceasta tinta unica
    // (nu AFB1/AFB2/AFG1/AFG2 individual, ca la probele de client).
    const val = document.getElementById('cs-target-aflatoxins').value;
    if (val !== '') targets.aflaSum = val;
    ['ota', 'm1', 'don', 'zea', 'fum'].forEach(key => {
      const v = document.getElementById(`cs-target-${key}`).value;
      if (v !== '') targets[key] = v;
    });
    try {
      const { code } = await api('/samples/control', {
        method: 'POST',
        body: JSON.stringify({
          productName: document.getElementById('cs-productName').value.trim(),
          category: document.getElementById('cs-category').value.trim(),
          targets,
        }),
      });
      showToast(`${t('operator.controlRegisteredToast')} ${code} ${t('operator.controlRegisteredSuffix')}`);
      operatorQueueFilter = 'control';
      await loadOperatorQueue();
    } catch (err) {
      errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
    }
  });
}
async function loadOperatorQueue() {
  try {
    const { samples } = await api('/results/queue');
    operatorQueue = samples;
  } catch (e) {
    showToast(t('operator.queueLoadError'));
  }
  renderOperatorWorkload();
  renderOperatorList();
  renderOperatorDetail();
}

function renderOperatorWorkload() {
  const strip = document.getElementById('operator-workload-strip');
  if (!strip) return;
  const clientQueue = operatorQueue.filter(s => !s.isControlSample);
  // "De procesat" e o lucrare in curs, nu un inventar total - o proba
  // validata sau anulata nu mai are nimic de procesat, deci nu mai conteaza
  // aici, oricat de multe probe au trecut vreodata prin coada.
  const isFinished = (s) => s.validationStatus === 'validated' || s.status === 'cancelled';
  const activeClientQueue = clientQueue.filter(s => !isFinished(s));
  const validatedCount = clientQueue.filter(s => s.validationStatus === 'validated').length;
  const cancelledCount = clientQueue.filter(s => s.status === 'cancelled').length;
  const activeControlCount = operatorQueue.filter(s => s.isControlSample && !isFinished(s)).length;
  // "Asteapta"/"In analiza" au granite diferite pe rol - la operator, decizia
  // de la poarta de intrare (intakeCheckedAt); la validator, aprobarea
  // colegiala (reviewStatus). Fosta caseta separata "De validat" e acum
  // inclusa in "In analiza", la fel ca in filtrele din coada, ca cele doua
  // zone ale interfetei sa spuna aceeasi poveste.
  const isValidatorRole = currentUser && currentUser.role === 'validator';
  const pendingCount = isValidatorRole
    ? activeClientQueue.filter(s => s.reviewStatus !== 'approved').length
    : activeClientQueue.filter(s => !s.intakeCheckedAt).length;
  const inAnalysisCount = isValidatorRole
    ? activeClientQueue.filter(s => s.reviewStatus === 'approved').length
    : activeClientQueue.filter(s => s.intakeCheckedAt).length;
  strip.innerHTML = `
    <div class="workload-primary"><span class="eyebrow">${t('operator.workloadNow')}</span><strong>${activeClientQueue.length} ${t('operator.workloadInFlow')}</strong></div>
    <button class="workload-item ${operatorQueueFilter === 'pending' ? 'selected' : ''}" data-workload="pending"><span class="workload-number">${pendingCount}</span><span>${isValidatorRole ? t('operator.workloadAwaitingApproval') : t('operator.workloadAwaitingResults')}</span></button>
    <button class="workload-item ${operatorQueueFilter === 'in_analysis' ? 'selected' : ''}" data-workload="in_analysis"><span class="workload-number">${inAnalysisCount}</span><span>${t('operator.workloadInAnalysis')}</span></button>
    <button class="workload-item ${operatorQueueFilter === 'validated' ? 'selected' : ''}" data-workload="validated"><span class="workload-number">${validatedCount}</span><span>${t('operator.workloadValidated')}</span></button>
    <button class="workload-item ${operatorQueueFilter === 'cancelled' ? 'selected' : ''}" data-workload="cancelled"><span class="workload-number">${cancelledCount}</span><span>${t('operator.workloadCancelled')}</span></button>
    <button class="workload-item ${operatorQueueFilter === 'control' ? 'selected' : ''}" data-workload="control"><span class="workload-number">${activeControlCount}</span><span>${t('operator.workloadControlSamples')}</span></button>`;
  strip.querySelectorAll('[data-workload]').forEach(btn => btn.addEventListener('click', () => {
    operatorQueueFilter = btn.dataset.workload;
    document.querySelectorAll('.queue-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === operatorQueueFilter));
    renderOperatorWorkload();
    renderOperatorList();
  }));
}

function nextActionForSample(s, mode = 'operator') {
  if (s.status === 'cancelled') return mode === 'owner' ? t('owner.nextActionViewReason') : t('operator.nextActionViewReason');
  if (mode === 'owner') {
    if (s.validationStatus === 'validated') return t('owner.nextActionBulletinIssued');
    if (s.status === 'pending') return t('owner.nextActionEnterResults');
    if (s.qcStatus !== 'accepted' && s.qcStatus !== 'not_required') return t('owner.nextActionCheckQc');
    return t('owner.nextActionReadyValidation');
  }
  if (s.validationStatus === 'validated') return t('operator.nextActionBulletinIssued');
  if (s.status === 'pending') return t('operator.nextActionEnterResults');
  if (s.qcStatus !== 'accepted' && s.qcStatus !== 'not_required') return t('operator.nextActionCheckQc');
  return t('operator.nextActionReadyValidation');
}

function actionClassForSample(s) {
  if (s.validationStatus === 'validated') return 'complete';
  // Etapa de "analiza" incepe la decizia de acceptare de la poarta de
  // intrare, nu la introducerea primei valori - aceeasi granita folosita
  // acum peste tot in aplicatie (filtre, casete de rezumat).
  if (!s.intakeCheckedAt) return 'analysis';
  if (s.qcStatus !== 'accepted' && s.qcStatus !== 'not_required') return 'qc';
  return 'validation';
}

// Eticheta de pe randul probei (nu bara de flux detaliata) - trebuie sa
// distinga intre "proba tocmai primita, inca netratata" si "proba deja
// acceptata, in lucru", nu sa arate generic "In asteptare" pentru
// amandoua, cum se intampla inainte. Rolosim exact vocabularul deja
// stabilit la chipsurile de sus, ca sa nu introducem un al treilea set
// de denumiri pentru aceeasi stare.
function queueRowStatusLabel(sample) {
  if (sample.status === 'cancelled') return t('common.cancelledStatus');
  if (sample.validationStatus === 'validated') return t('operator.validatedShort');
  if (currentUser && currentUser.role === 'validator') {
    if (sample.reviewStatus === 'approved') return t('operator.guideValidatorStep2');
    if (sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required') return t('operator.guideValidatorStep1');
    return t('operator.guideValidatorStep0');
  }
  if (!sample.intakeCheckedAt) return t('operator.guideOperatorStep1');
  if (sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required') return t('operator.guideOperatorStep3');
  return t('operator.guideOperatorStep2');
}

function renderNextActionCard(sample, mode = 'operator') {
  const isOwner = mode === 'owner';
  const action = nextActionForSample(sample, mode);
  const cls = actionClassForSample(sample);
  const detail = isOwner ? {
    analysis: t('owner.nextActionDetailAnalysis'),
    qc: t('owner.nextActionDetailQc'),
    validation: t('owner.nextActionDetailValidation'),
    complete: t('owner.nextActionDetailComplete')
  }[cls] : {
    analysis: t('operator.nextActionDetailAnalysis'),
    qc: t('operator.nextActionDetailQc'),
    validation: t('operator.nextActionDetailValidation'),
    complete: t('operator.nextActionDetailComplete')
  }[cls];
  const actionButton = mode === 'operator' && cls !== 'complete'
    ? `<button type="button" class="btn secondary next-action-button" id="btn-next-action">${cls === 'analysis' ? t('operator.nextActionButtonAnalysis') : cls === 'qc' ? t('operator.nextActionButtonQc') : t('operator.nextActionButtonValidation')}</button>`
    : '';
  const kicker = isOwner ? t('owner.nextActionKicker') : t('operator.nextActionKicker');
  return `<div class="next-action-card ${cls}" aria-label="${escapeHtml(action)}"><div class="next-action-copy"><div class="next-action-kicker">${kicker}</div><strong>${escapeHtml(action)}</strong><p>${escapeHtml(detail)}</p></div>${actionButton}<span class="next-action-marker" aria-hidden="true">${cls==='complete'?'✓':'→'}</span></div>`;
}

function focusNextAction(sample) {
  const cls = actionClassForSample(sample);
  const targets = {
    analysis: 'f-analysisDate',
    qc: 'f-qcStatus',
    validation: 'btn-validate-results'
  };
  const target = document.getElementById(targets[cls]);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target.focus(), 260);
}

function renderOperatorList() {
  const listEl = document.getElementById('sample-list');
  if (!listEl) return;
  const f = operatorSearchTerm.trim().toLowerCase();
  let filtered = operatorQueue.filter(s =>
    s.code.toLowerCase().includes(f) || (s.productName || '').toLowerCase().includes(f)
  );
  if (operatorQueueFilter === 'control') {
    filtered = filtered.filter(s => s.isControlSample);
  } else {
    filtered = filtered.filter(s => !s.isControlSample);
    // "Asteapta" si "In analiza" au sens diferit la operator fata de
    // validator - la operator, granita e decizia de la poarta de intrare
    // (intakeCheckedAt); la validator, granita e aprobarea colegiala
    // (reviewStatus). "Validat" e identic la amandoi: buletin emis.
    const isValidatorRole = currentUser && currentUser.role === 'validator';
    if (operatorQueueFilter === 'pending') {
      filtered = isValidatorRole
        ? filtered.filter(s => s.reviewStatus !== 'approved' && s.status !== 'cancelled')
        : filtered.filter(s => !s.intakeCheckedAt && s.status !== 'cancelled');
    } else if (operatorQueueFilter === 'in_analysis') {
      filtered = isValidatorRole
        ? filtered.filter(s => s.reviewStatus === 'approved' && s.validationStatus !== 'validated' && s.status !== 'cancelled')
        : filtered.filter(s => s.intakeCheckedAt && s.validationStatus !== 'validated' && s.status !== 'cancelled');
    } else if (operatorQueueFilter === 'validated') {
      filtered = filtered.filter(s => s.validationStatus === 'validated');
    } else if (operatorQueueFilter !== 'all') {
      filtered = filtered.filter(s => s.status === operatorQueueFilter);
    }
  }

  // Aceeasi logica ca la beneficiar: probele finalizate (validate sau
  // anulate) nu mai cer nicio actiune - le mutam la finalul listei, ordonate
  // dupa momentul in care au ajuns in starea finala.
  {
    const isFinished = (s) => s.validationStatus === 'validated' || s.status === 'cancelled';
    const finishedAt = (s) => new Date(s.validatedAt || s.createdAt).getTime();
    // Coada de LUCRU prioritizeaza dupa urgenta (termenul cerut de
    // beneficiar), nu dupa ordinea de primire - exact cum functioneaza o
    // lista de lucru reala de laborator. Ordinea de primire ramane intacta
    // acolo unde chiar conteaza: codul unic al probei (accesionare), atribuit
    // strict secvential la inregistrare, neschimbat de aceasta sortare.
    const priorityRank = { overdue: 0, soon: 1, ok: 2, none: 3 };
    const active = filtered.filter(s => !isFinished(s)).sort((a, b) => {
      const ra = priorityRank[dueDateStatus(a.dueDate, a.validationStatus, a.status)] ?? 3;
      const rb = priorityRank[dueDateStatus(b.dueDate, b.validationStatus, b.status)] ?? 3;
      if (ra !== rb) return ra - rb;
      // In interiorul aceleiasi urgente: probele cu termen se ordoneaza dupa
      // termen (cel mai apropiat intai); cele fara termen, dupa ordinea de
      // primire (cele mai vechi intai) - FIFO clasic, ca fallback rezonabil.
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    const finished = filtered.filter(isFinished).sort((a, b) => finishedAt(b) - finishedAt(a));
    filtered = [...active, ...finished];
  }

  // Insigna de langa "De procesat" arata mereu volumul de lucru activ
  // total, nu numarul din tab-ul curent - altfel se schimba confuz la
  // fiecare click intre tab-uri, desi labelul de langa ea e static.
  const countEl = document.getElementById('queue-count');
  if (countEl) countEl.textContent = operatorQueue.filter(s => s.validationStatus !== 'validated' && s.status !== 'cancelled').length;

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-list">${operatorQueue.length ? t('operator.noSampleForFilter') : t('operator.noSampleInQueue')}</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(s => {
    const isActive = s.id === operatorActiveId ? 'active' : '';
    const dueStatus = dueDateStatus(s.dueDate, s.validationStatus, s.status);
    const dueLine = s.dueDate && dueStatus !== 'done'
      ? `<div class="queue-due-date ${dueStatus}">${dueStatus === 'overdue' ? '⚠ ' : ''}${t('operator.dueDatePrefix')} ${escapeHtml(s.dueDate)}</div>`
      : '';
    const retestLine = s.retestOfCode ? `<div class="queue-retest-tag">↻ ${t('operator.retestOfPrefix')} ${escapeHtml(s.retestOfCode)}</div>` : '';
    const controlLine = s.isControlSample ? `<div class="queue-control-tag">⚙ ${t('operator.controlSampleTag')}</div>` : '';
    return `
      <div class="sample-row ${isActive}" data-id="${s.id}" role="button" tabindex="0" aria-current="${isActive ? 'true' : 'false'}" aria-label="Deschide proba ${escapeHtml(s.code)}">
        <div class="sample-main">
          <div class="sample-code-line"><span class="id mono">${escapeHtml(s.code)}${s.hasUpdate ? `<span class="update-badge">${t('owner.newBadge')}</span>` : ''}</span><span class="mini-state ${s.status}">${queueRowStatusLabel(s)}</span></div>
          <span class="label">${escapeHtml(s.productName)}</span>
          <div class="date">${s.sampleDate ? t('operator.sampledOnPrefix') + ' ' + s.sampleDate : t('operator.dateNotSet')}</div>
          ${dueLine}
          ${retestLine}
          ${controlLine}
          <div class="next-action">${escapeHtml(nextActionForSample(s))}</div>
        </div>
        <div class="sample-status"><span class="status-dot ${s.status}" aria-hidden="true"></span><span class="status-text">${queueRowStatusLabel(s)}</span></div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.sample-row').forEach(row => {
    const openRow = () => {
      operatorActiveId = parseInt(row.dataset.id, 10);
      const openedSample = operatorQueue.find(s => s.id === operatorActiveId);
      if (openedSample && openedSample.hasUpdate) {
        openedSample.hasUpdate = false;
        api(`/results/${operatorActiveId}/mark-seen`, { method: 'POST' }).catch(() => {});
      }
      renderOperatorList();
      renderOperatorDetail();
      if (window.matchMedia('(max-width: 880px)').matches) document.getElementById('detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    row.addEventListener('click', openRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openRow();
      }
    });
  });
}
function getOperatorFormState(sample) {
  const fields = [
    { id: 'f-analysisDate', label: t('operator.fieldAnalysisDate'), valid: !!sample.analysisDate },
    { id: 'f-method', label: t('operator.fieldMethod'), valid: !!(sample.method && sample.method.trim()) },
    { id: 'f-equipment', label: t('operator.fieldEquipment'), valid: !!(sample.equipment && sample.equipment.trim()) },
    { id: 'f-qcStatus', label: t('operator.fieldQc'), valid: !!sample.qcStatus && sample.qcStatus !== 'pending' },
  ];
  // Analizele comandate la inregistrare (requestedTests, persistate pe
  // proba) sunt sursa de adevar pentru ce rezultate sunt obligatorii - NU
  // mai depindem de un flag local de sesiune (daca operatorul a atins
  // manual dropdown-ul de profil in aceasta vizualizare). Limitele sunt
  // deja corect stabilite la inregistrarea probei (vezi routes/samples.js),
  // deci nu mai trebuie verificate separat aici ca "campuri" needitate.
  const requested = sample.requestedTests;
  const hasTest = (group) => !requested || requested.includes(group);

  const requiredResultKeys = [];
  if (hasTest('aflatoxins')) requiredResultKeys.push('afb1', 'afb2', 'afg1', 'afg2');
  if (hasTest('ota')) requiredResultKeys.push('ota');
  if (hasTest('m1')) requiredResultKeys.push('m1');
  if (hasTest('don')) requiredResultKeys.push('don');
  if (hasTest('zea')) requiredResultKeys.push('zea');
  if (hasTest('fum')) requiredResultKeys.push('fum');
  const uniqueRequired = [...new Set(requiredResultKeys)];
  // Fallback: daca nu exista deloc lista de analize comandate (proba foarte
  // veche, dinainte de aceasta functionalitate) si niciun grup nu a iesit
  // relevant, pastram comportamentul vechi exploratoriu.
  const effectiveRequired = uniqueRequired.length ? uniqueRequired : ['afb1', 'afb2', 'afg1', 'afg2', 'ota'];
  const results = effectiveRequired.map(k => sample[k] !== null && sample[k] !== undefined && sample[k] !== '');
  const allResults = results.every(Boolean);
  const reviewApproved = sample.reviewStatus === 'approved';
  // Ce trebuie sa fie complet inainte ca "Trimite spre validare" sa poata
  // fi apasat - valorile analitice, dar si metoda, echipamentul si data
  // analizei, care fac parte din dosarul de trasabilitate al rezultatului,
  // nu doar cifrele. NU include reviewApproved (irelevant aici - e starea
  // ulterioara a validatorului, nu o conditie pentru trimiterea initiala).
  const canSubmitToValidator = allResults && !!sample.analysisDate && !!(sample.method && sample.method.trim()) && !!(sample.equipment && sample.equipment.trim());
  // Lista EXACTA a motivelor pentru care butonul e dezactivat - inainte,
  // tooltipul spunea mereu "Completează mai întâi toate rezultatele
  // analitice", indiferent de motivul real. Un operator care a introdus deja
  // toate valorile, dar a omis metoda sau echipamentul, primea un mesaj fals
  // (rezultatele ERAU complete) si nu avea niciun indiciu concret despre ce
  // ii lipsea de fapt. Cardul de pregatire de mai sus lista deja campurile
  // lipsa, dar mesajul de pe buton insusi trebuie sa fie la fel de precis.
  const submitBlockers = [];
  if (!allResults) submitBlockers.push(t('operator.requestedResultsMissing'));
  if (!sample.analysisDate) submitBlockers.push(t('operator.fieldAnalysisDate'));
  if (!(sample.method && sample.method.trim())) submitBlockers.push(t('operator.fieldMethod'));
  if (!(sample.equipment && sample.equipment.trim())) submitBlockers.push(t('operator.fieldEquipment'));
  return { fields, allResults, canSubmitToValidator, submitBlockers, reviewApproved, ready: fields.every(f => f.valid) && allResults && reviewApproved };
}

function renderReviewSection(sample) {
  const state = getOperatorFormState(sample);
  if (sample.reviewStatus === 'approved') {
    return `<div class="review-card approved"><strong>✓ ${t('operator.reviewApprovedLabel')}</strong>${sample.reviewedByName ? ` ${t('operator.reviewedByPrefix')} ${escapeHtml(sample.reviewedByName)}` : ''}${sample.reviewedAt ? ` · ${escapeHtml(sample.reviewedAt)}` : ''}${sample.reviewNote ? `<p>${escapeHtml(sample.reviewNote)}</p>` : ''}</div>`;
  }
  if (sample.reviewStatus === 'rejected') {
    return `<div class="review-card rejected"><strong>✕ ${t('operator.reviewRejectedLabel')}</strong>${sample.reviewedByName ? ` ${t('operator.reviewedByPrefix')} ${escapeHtml(sample.reviewedByName)}` : ''}${sample.reviewNote ? `<p>${escapeHtml(sample.reviewNote)}</p>` : ''}<p class="section-hint">${t('operator.reviewFixAndResave')}</p></div>`;
  }
  // Fara trimitere oficiala (QC nedecis), validatorul nu are ce revizui -
  // proba inca e in lucru la operator. Fara aceasta verificare, s-ar putea
  // aproba o proba pe care operatorul n-a apucat sa o trimita, inchizand-o
  // fara nicio validare posibila si fara ca beneficiarul sa primeasca vreun
  // buletin.
  const wasSubmitted = sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required';
  if (!wasSubmitted) {
    return `<div class="review-card pending"><strong>${t('operator.reviewTitle')}</strong><p class="section-hint">${t('operator.reviewNotSubmittedYet')}</p></div>`;
  }
  if (currentUser.role === 'operator') {
    return `<div class="review-card pending"><strong>${t('operator.reviewTitle')}</strong><p class="section-hint">${t('operator.reviewOperatorCannot')}</p></div>`;
  }
  if (sample.operatorId && sample.operatorId === currentUser.id) {
    return `<div class="review-card pending"><strong>${t('operator.reviewTitle')}</strong><p class="section-hint">${t('operator.reviewSelfEntered')}</p></div>`;
  }
  // Rezultate incomplete, dar totusi trimise (posibil dintr-o proba blocata
  // inainte de verificarea la sursa) - respingerea trebuie sa ramana mereu
  // posibila, ca mecanism de recuperare; doar aprobarea cere completitudine.
  if (!state.allResults) {
    return `
      <div class="review-card pending">
        <strong>${t('operator.reviewTitle')}</strong>
        <p class="section-hint">${t('operator.reviewIncompleteRejectOnly')}</p>
        <div class="review-actions">
          <button type="button" class="btn danger-outline" id="btn-review-reject">${t('operator.reviewRejectBtn')}</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="review-card pending">
      <strong>${t('operator.reviewTitle')}</strong>
      <p class="section-hint">${t('operator.reviewReadyToReview')}</p>
      <div class="review-actions">
        <button type="button" class="btn secondary" id="btn-review-approve">${t('operator.reviewApproveBtn')}</button>
        <button type="button" class="btn danger-outline" id="btn-review-reject">${t('operator.reviewRejectBtn')}</button>
      </div>
    </div>
  `;
}

function renderOperatorReadiness(sample) {
  const state = getOperatorFormState(sample);
  const missing = state.fields.filter(f => !f.valid).map(f => f.label);
  if (!state.allResults) missing.push(t('operator.requestedResultsMissing'));
  if (!state.reviewApproved) missing.push(t('operator.peerApprovalMissing'));
  const items = [
    [t('operator.readinessItemSampleId'), true],
    [t('operator.fieldAnalysisDate'), state.fields[0].valid],
    [t('operator.fieldMethod'), state.fields[1].valid],
    [t('operator.fieldEquipment'), state.fields[2].valid],
    [t('operator.readinessItemResults'), state.allResults],
    [t('operator.readinessItemQc'), state.fields[3].valid],
    [t('operator.readinessItemApproval'), state.reviewApproved],
  ];
  return `
    <div class="readiness-card ${state.ready ? 'ready' : ''}" id="operator-readiness">
      <div class="readiness-head">
        <div><div class="eyebrow">${t('operator.readinessEyebrow')}</div><strong>${state.ready ? t('operator.readinessReady') : t('operator.readinessNotReady')}</strong></div>
        <span class="readiness-count">${items.filter(i => i[1]).length}/${items.length}</span>
      </div>
      <div class="readiness-list">${items.map(([label, ok]) => `<div class="readiness-item ${ok ? 'done' : 'missing'}"><span class="readiness-icon">${ok ? '✓' : '!'}</span><span>${label}</span></div>`).join('')}</div>
      ${missing.length ? `<div class="readiness-missing"><span>${t('operator.readinessNextStep')}</span> ${escapeHtml(missing[0])}</div>` : `<div class="readiness-ok">${t('operator.readinessOk')}</div>`}
    </div>`;
}

function updateOperatorReadiness(sample) {
  const card = document.getElementById('operator-readiness');
  if (!card) return;
  const state = getOperatorFormState({
    ...sample,
    analysisDate: document.getElementById('f-analysisDate')?.value,
    method: document.getElementById('f-method')?.value.trim(),
    equipment: document.getElementById('f-equipment')?.value.trim(),
    qcStatus: document.getElementById('f-qcStatus')?.value,
    limitAfb1: document.getElementById('f-limitAfb1')?.value,
    limitAflaSum: document.getElementById('f-limitAflaSum')?.value,
    limitOta: document.getElementById('f-limitOta')?.value,
    limitM1: document.getElementById('f-limitM1')?.value,
    limitDon: document.getElementById('f-limitDon')?.value,
    limitZea: document.getElementById('f-limitZea')?.value,
    limitFum: document.getElementById('f-limitFum')?.value,
    ...Object.fromEntries([...document.querySelectorAll('.result-input')].map(i => [i.dataset.key, i.value]))
  });
  const items = [
    [t('operator.readinessItemSampleId'), true], [t('operator.fieldAnalysisDate'), state.fields[0].valid], [t('operator.fieldMethod'), state.fields[1].valid],
    [t('operator.fieldEquipment'), state.fields[2].valid],
    [t('operator.readinessItemResults'), state.allResults], [t('operator.readinessItemQc'), state.fields[3].valid], [t('operator.readinessItemApproval'), state.reviewApproved]
  ];
  const missing = state.fields.filter(f => !f.valid).map(f => f.label);
  if (!state.allResults) missing.push(t('operator.requestedResultsMissing'));
  if (!state.reviewApproved) missing.push(t('operator.peerApprovalMissing'));
  card.classList.toggle('ready', state.ready);
  const strong = card.querySelector('.readiness-head strong');
  if (strong) strong.textContent = state.ready ? t('operator.readinessReady') : t('operator.readinessNotReady');
  const count = card.querySelector('.readiness-count'); if (count) count.textContent = `${items.filter(i => i[1]).length}/${items.length}`;
  const list = card.querySelector('.readiness-list'); if (list) list.innerHTML = items.map(([label, ok]) => `<div class="readiness-item ${ok ? 'done' : 'missing'}"><span class="readiness-icon">${ok ? '✓' : '!'}</span><span>${label}</span></div>`).join('');
  const hint = card.querySelector('.readiness-missing, .readiness-ok');
  if (hint) hint.outerHTML = missing.length ? `<div class="readiness-missing"><span>${t('operator.readinessNextStep')}</span> ${escapeHtml(missing[0])}</div>` : `<div class="readiness-ok">${t('operator.readinessOk')}</div>`;
  const validate = document.getElementById('btn-validate-results');
  if (validate) {
    const canValidateRole = currentUser.role !== 'operator';
    validate.disabled = !state.ready || !canValidateRole;
    validate.classList.toggle('primary-action', state.ready && canValidateRole);
    validate.classList.toggle('secondary', !state.ready || !canValidateRole);
  }
  // Nota: butonul "Salvează rezultatele" NU mai este controlat aici - starea
  // lui vizuala (activ/inactiv, evidentiat) este gestionata exclusiv de
  // markDirty()/clearDirty(), pe baza existentei unor modificari nesalvate,
  // nu pe baza gradului de completare a dosarului (asta ramane rolul
  // butonului de validare).
}

function readLiveOperatorValues() {
  const vals = {};
  document.querySelectorAll('.result-input').forEach(i => {
    vals[i.dataset.key] = i.value === '' ? null : Number(i.value);
  });
  const af = ['afb1','afb2','afg1','afg2'].map(k => vals[k]);
  const complete = af.every(v => Number.isFinite(v));
  return {
    afb1: vals.afb1, ota: vals.ota, m1: vals.m1, don: vals.don, zea: vals.zea, fum: vals.fum,
    sum: complete ? af.reduce((a,b) => a+b, 0) : null,
    limitAfb1: Number(document.getElementById('f-limitAfb1')?.value),
    limitSum: Number(document.getElementById('f-limitAflaSum')?.value),
    limitOta: Number(document.getElementById('f-limitOta')?.value),
    limitM1: document.getElementById('f-limitM1')?.value === '' ? null : Number(document.getElementById('f-limitM1')?.value),
    limitDon: document.getElementById('f-limitDon')?.value === '' ? null : Number(document.getElementById('f-limitDon')?.value),
    limitZea: document.getElementById('f-limitZea')?.value === '' ? null : Number(document.getElementById('f-limitZea')?.value),
    limitFum: document.getElementById('f-limitFum')?.value === '' ? null : Number(document.getElementById('f-limitFum')?.value)
  };
}

function updateLiveAssessment() {
  const box = document.getElementById('live-assessment');
  if (!box) return;
  const v = readLiveOperatorValues();
  const checks = [
    Number.isFinite(v.afb1) && Number.isFinite(v.limitAfb1) && v.afb1 > v.limitAfb1,
    Number.isFinite(v.sum) && Number.isFinite(v.limitSum) && v.sum > v.limitSum,
    Number.isFinite(v.ota) && Number.isFinite(v.limitOta) && v.ota > v.limitOta,
    Number.isFinite(v.m1) && Number.isFinite(v.limitM1) && v.m1 > v.limitM1,
    Number.isFinite(v.don) && Number.isFinite(v.limitDon) && v.don > v.limitDon,
    Number.isFinite(v.zea) && Number.isFinite(v.limitZea) && v.zea > v.limitZea,
    Number.isFinite(v.fum) && Number.isFinite(v.limitFum) && v.fum > v.limitFum
  ];
  const hasAny = [v.afb1, v.sum, v.ota, v.m1, v.don, v.zea, v.fum].some(Number.isFinite);
  const fail = checks.some(Boolean);
  box.className = `live-assessment ${fail ? 'fail' : hasAny ? 'review' : 'empty'}`;
  box.innerHTML = fail
    ? `<div><span class="eyebrow">${t('operator.autoCheckEyebrow')}</span><strong>${t('operator.autoCheckFailTitle')}</strong><p>${t('operator.autoCheckFailText')}</p></div><span class="live-assessment-icon">!</span>`
    : hasAny
      ? `<div><span class="eyebrow">${t('operator.autoCheckEyebrow')}</span><strong>${t('operator.autoCheckOkTitle')}</strong><p>${t('operator.autoCheckOkText')}</p></div><span class="live-assessment-icon">✓</span>`
      : `<div><span class="eyebrow">${t('operator.autoCheckEyebrow')}</span><strong>${t('operator.autoCheckEmptyTitle')}</strong><p>${t('operator.autoCheckEmptyText')}</p></div><span class="live-assessment-icon">→</span>`;

  // Actualizeaza si tabelul de contaminanti (suma si verdictele individuale),
  // care altfel ramanea inghetat la valorile de la incarcarea probei.
  const sumCell = document.getElementById('live-af-sum');
  if (sumCell) sumCell.textContent = Number.isFinite(v.sum) ? v.sum.toFixed(2) : '—';

  const sumFlagCell = document.getElementById('live-af-sum-flag');
  if (sumFlagCell) {
    if (!Number.isFinite(v.sum)) {
      sumFlagCell.innerHTML = '<span class="result-flag empty">—</span>';
    } else if (Number.isFinite(v.limitSum) && v.sum > v.limitSum) {
      sumFlagCell.innerHTML = `<span class="result-flag fail">${t('operator.flagExceeded')}</span>`;
    } else {
      sumFlagCell.innerHTML = `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
    }
  }

  const renderRowFlag = (key, value, limit, emptyLimitLabel) => {
    const cell = document.getElementById(`flag-${key}`);
    if (!cell) return;
    const input = document.querySelector(`.result-input[data-key="${key}"]`);
    const isOver = Number.isFinite(value) && Number.isFinite(limit) && value > limit;
    if (input) input.classList.toggle('over-limit', isOver);
    if (!Number.isFinite(value)) {
      cell.innerHTML = '<span class="result-flag empty">—</span>';
    } else if (!Number.isFinite(limit)) {
      cell.innerHTML = `<span class="result-flag empty">${emptyLimitLabel || t('operator.flagSeeSumTable')}</span>`;
    } else {
      cell.innerHTML = isOver ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
    }
  };
  renderRowFlag('afb1', v.afb1, v.limitAfb1);
  renderRowFlag('ota', v.ota, v.limitOta);
  renderRowFlag('m1', v.m1, v.limitM1, t('operator.noLimitFlag'));
  renderRowFlag('don', v.don, v.limitDon, t('operator.noLimitFlag'));
  renderRowFlag('zea', v.zea, v.limitZea, t('operator.noLimitFlag'));
  renderRowFlag('fum', v.fum, v.limitFum, t('operator.noLimitFlag'));
  // AFB2/AFG1/AFG2 nu au limita individuala (doar suma conteaza), dar tot
  // trebuie sa arate "v. sumă" cand au o valoare introdusa.
  ['afb2', 'afg1', 'afg2'].forEach(key => {
    const el = document.querySelector(`.result-input[data-key="${key}"]`);
    const val = el && el.value !== '' ? Number(el.value) : null;
    renderRowFlag(key, val, null);
  });
}

async function renderNonconformingPanel(sampleId) {
  const slot = document.getElementById('nonconforming-slot');
  if (!slot) return;
  const dispositionLabel = (d) => ({open: t('operator.ncStatusOpen'), accepted: t('operator.ncStatusAccepted'), retest: t('operator.ncStatusRetest'), closed: t('operator.ncStatusClosed')}[d] || d);
  const riskLabel = (r) => ({low: t('operator.ncRiskLow'), medium: t('operator.ncRiskMedium'), high: t('operator.ncRiskHigh')}[r] || r);
  try {
    const { cases } = await api(`/results/${sampleId}/nonconforming`);
    const open = cases.filter(c => c.disposition === 'open');
    slot.innerHTML = `
      <div class="quality-work-card ${open.length ? 'has-open' : ''}">
        <div class="dashboard-card-head"><div><span class="eyebrow">${t('operator.qualityEyebrow')}</span><h3>${t('operator.nonconformingWorkTitle')}</h3></div><span class="quality-badge ${open.length ? 'partial' : 'covered'}">${open.length ? `${open.length} ${open.length === 1 ? t('operator.ncOpenSingular') : t('operator.ncOpenPlural')}` : t('operator.ncNoneOpen')}</span></div>
        <p class="quality-help">${t('operator.ncHelpText')}</p>
        <div class="nonconforming-actions"><button class="btn secondary" id="btn-open-nc">${t('operator.ncRegisterBtn')}</button></div>
        ${cases.length ? `<div class="nonconforming-list">${cases.map(c => `<article class="nc-item"><div class="nc-item-head"><strong>${escapeHtml(c.reason)}</strong><span class="quality-badge ${c.disposition === 'open' ? 'partial' : 'covered'}">${escapeHtml(dispositionLabel(c.disposition))}</span></div><div class="nc-meta">${t('operator.ncRiskPrefix')} ${escapeHtml(riskLabel(c.riskLevel))} · ${escapeHtml(c.openedAt)} · ${escapeHtml(c.openedByName || t('operator.userFallbackShort'))}</div><p><strong>${t('operator.ncActionLabel')}</strong> ${escapeHtml(c.action)}</p>${c.impactAssessment ? `<p><strong>${t('operator.ncImpactLabel')}</strong> ${escapeHtml(c.impactAssessment)}</p>` : ''}${c.customerNotification ? `<p><strong>${t('operator.ncCustomerLabel')}</strong> ${escapeHtml(c.customerNotification)}</p>` : ''}${c.disposition === 'open' ? `<div class="nc-close-row"><select id="nc-close-${c.id}"><option value="closed">${t('operator.ncCloseOption')}</option><option value="accepted">${t('operator.ncStatusAccepted')}</option><option value="retest">${t('operator.ncStatusRetest')}</option></select><button class="btn secondary small-btn" data-close-nc="${c.id}">${t('operator.ncApplyDecisionBtn')}</button></div>` : ''}</article>`).join('')}</div>` : `<div class="empty-list">${t('operator.ncNoneRegistered')}</div>`}
      </div>`;
    document.getElementById('btn-open-nc').addEventListener('click', () => openNonconformingDialog(sampleId));
    slot.querySelectorAll('[data-close-nc]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.dataset.closeNc;
      const disposition = document.getElementById(`nc-close-${id}`).value;
      try { await api(`/results/${sampleId}/nonconforming/${id}/close`, {method:'POST', body:JSON.stringify({disposition})}); showToast(t('operator.ncDecisionRecorded')); renderNonconformingPanel(sampleId); } catch(e) { showToast(t('operator.ncUpdateError')); }
    }));
  } catch (e) { slot.innerHTML = ''; }
}

function openNonconformingDialog(sampleId) {
  const old = document.getElementById('nc-dialog'); old?.remove();
  const wrap = document.createElement('div'); wrap.id='nc-dialog'; wrap.className='modal-backdrop';
  wrap.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="nc-title"><div class="modal-head"><div><span class="eyebrow">${t('operator.ncDialogEyebrow')}</span><h2 id="nc-title">${t('operator.ncDialogTitle')}</h2></div><button class="icon-button" id="nc-cancel" aria-label="${t('operator.ncCloseAria')}">×</button></div><div class="field-grid"><div class="field"><label for="nc-reason">${t('operator.ncReasonLabel')}</label><textarea id="nc-reason" placeholder="${t('operator.ncReasonPlaceholder')}"></textarea></div><div class="field"><label for="nc-risk">${t('operator.ncRiskLevelLabel')}</label><select id="nc-risk"><option value="low">${t('operator.ncRiskLow')}</option><option value="medium" selected>${t('operator.ncRiskMedium')}</option><option value="high">${t('operator.ncRiskHigh')}</option></select></div><div class="field"><label for="nc-action">${t('operator.ncImmediateActionLabel')}</label><textarea id="nc-action" placeholder="${t('operator.ncImmediateActionPlaceholder')}"></textarea></div><div class="field"><label for="nc-impact">${t('operator.ncImpactAssessmentLabel')}</label><textarea id="nc-impact" placeholder="${t('operator.ncImpactAssessmentPlaceholder')}"></textarea></div><div class="field"><label for="nc-customer">${t('operator.ncCustomerNotificationLabel')}</label><input id="nc-customer" type="text" placeholder="${t('operator.ncCustomerNotificationPlaceholder')}"></div></div><div class="modal-actions"><button class="btn secondary" id="nc-cancel-2">${t('operator.ncCancelBtn')}</button><button class="btn" id="nc-save">${t('operator.ncSaveBtn')}</button></div></div>`;
  document.body.appendChild(wrap);
  const close=()=>wrap.remove(); document.getElementById('nc-cancel').onclick=close; document.getElementById('nc-cancel-2').onclick=close;
  document.getElementById('nc-save').onclick=async()=>{ const reason=document.getElementById('nc-reason').value.trim(), action=document.getElementById('nc-action').value.trim(); if(!reason||!action){showToast(t('operator.ncReasonActionRequired'));return;} try{await api(`/results/${sampleId}/nonconforming`,{method:'POST',body:JSON.stringify({reason,action,riskLevel:document.getElementById('nc-risk').value,impactAssessment:document.getElementById('nc-impact').value,customerNotification:document.getElementById('nc-customer').value})}); close(); showToast(t('operator.ncRegisteredToast')); renderNonconformingPanel(sampleId);}catch(e){showToast(t('operator.ncRegisterError'));}};
}

function renderDataLineage(sample) {
  const calculated = [t('operator.lineageCalculatedFields')];
  const manual = [t('operator.lineageManualFields')];
  const reported = [t('operator.lineageReportedFields')];
  return `
    <div class="data-lineage-card" id="data-lineage">
      <div class="dashboard-card-head"><div><span class="eyebrow">${t('operator.dataIntegrityEyebrow')}</span><h3>${t('operator.dataLineageTitle')}</h3></div><span class="quality-badge covered">${t('operator.traceableBadge')}</span></div>
      <p class="quality-help">${t('operator.lineageHelp')}</p>
      <div class="lineage-grid">
        <div><span class="lineage-kicker">${t('operator.lineageEnteredKicker')}</span><strong>${t('operator.lineageEnteredBy')}</strong><p>${manual.join(' · ')}</p></div>
        <div><span class="lineage-kicker">${t('operator.lineageCalculatedKicker')}</span><strong>${t('operator.lineageCalculatedBy')}</strong><p>${calculated.join(' · ')}</p></div>
        <div><span class="lineage-kicker">${t('operator.lineageReportedKicker')}</span><strong>${t('operator.lineageReportedBy')}</strong><p>${reported.join(' · ')}</p></div>
      </div>
      <div class="lineage-note">${t('operator.lineageNotePrefix')} ${sample.validationStatus === 'validated' ? t('operator.lineageValidated') : t('operator.lineageDraft')}. ${t('operator.lineageNoteSuffix')}</div>
    </div>`;
}

function formatVersionChanges(changes) {
  if (!changes || !changes.length) return `<div class="version-nochange">${t('owner.noChangeVsNext')}</div>`;
  return `<ul class="version-changes">${changes.map(c => {
    const from = c.from === null || c.from === undefined || c.from === '' ? '—' : escapeHtml(String(c.from));
    const to = c.to === null || c.to === undefined || c.to === '' ? '—' : escapeHtml(String(c.to));
    const label = translateVersionLabel(c.label);
    return `<li><strong>${escapeHtml(label)}:</strong> ${from} → ${to}</li>`;
  }).join('')}</ul>`;
}

async function renderOperatorDetail() {
  const panel = document.getElementById('detail-panel');
  const sample = operatorQueue.find(s => s.id === operatorActiveId);

  if (!sample) {
    panel.innerHTML = `<div class="detail-empty">${t('operator.chooseSampleFromQueue')}</div>`;
    updateStaffGuideProgress(null, currentUser.role);
    return;
  }
  updateStaffGuideProgress(sample, currentUser.role);

  await ensureRuleProfilesCache();

  // Selectia de profil e legata de proba curenta - daca s-a schimbat proba
  // fata de ultima selectie, resetam (fiecare proba isi porneste propria
  // alegere de categorie, nu o mosteneste de la proba anterior deschisa).
  if (operatorSelectedProfileSampleId !== sample.id) {
    operatorSelectedProfileId = '';
    operatorSelectedProfileSampleId = sample.id;
  }
  if (operatorQcSelectionSampleId !== sample.id) {
    operatorQcSelection = null;
    operatorQcSelectionSampleId = sample.id;
  }

  // Validatorul nu are nicio actiune posibila pe o proba pe care operatorul
  // inca o lucreaza (QC nedecis) - deja blocam aprobarea la server (vezi
  // rutele de review), dar pana acum validatorul tot vedea formularul
  // complet, needitabil, ceea ce parea o proba "deschisa" fara sa fie
  // momentul lui. O proba anulata ramane vizibila (poate fi consultata ca
  // referinta), dat fiind ca nu va ajunge niciodata la validare oricum.
  if (currentUser.role === 'validator' && sample.status !== 'cancelled' && sample.qcStatus !== 'accepted' && sample.qcStatus !== 'not_required') {
    panel.innerHTML = `
      ${renderWorkflowRail(sample, 'operator')}
      <div class="detail-empty">
        <strong>${t('operator.notYourTurnTitle')}</strong>
        <p>${t('operator.notYourTurnBody')}</p>
      </div>
    `;
    return;
  }

  // O proba validata nu se mai poate modifica (blocat si server-side) - in
  // loc sa aratam formularul de introducere date needitabil, aratam direct
  // documentul de buletin, identic cu ce vede proprietarul, cu buton de
  // printare/PDF. Astfel operatorul are si el un document prezentabil la
  // un audit, nu doar campuri needitabile intr-un formular.
  if (sample.validationStatus === 'validated') {
    await ensureLabBranding();
    panel.innerHTML = `
      ${renderWorkflowRail(sample, 'operator')}
      ${renderBulletinReadOnly(sample)}
    `;
    const printBtn = document.getElementById('btn-print');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    const historyBtn = document.getElementById('btn-history');
    if (historyBtn) historyBtn.addEventListener('click', () => loadUnifiedHistory(sample.id, 'owner-versions-slot'));
    const retestBtn = document.getElementById('btn-request-retest');
    if (retestBtn) retestBtn.addEventListener('click', async () => {
      const reason = window.prompt(t('owner.retestReasonPrompt'), '');
      if (reason === null) return;
      try {
        await api(`/samples/${sample.id}/retest`, { method: 'POST', body: JSON.stringify({ reason }) });
        showToast(t('owner.retestCreated'));
        await loadOperatorQueue();
        renderOperatorList();
      } catch (err) {
        showToast(t('owner.retestError') + ' ' + err.message);
      }
    });
    if (sample.bulletinNo) loadBulletinQr(sample.id);
    return;
  }

  // Proba anulata la poarta de intrare (QC respins) - nu mai aratam
  // formularul complet de introducere date, doar identificarea si motivul.
  // Fara asta, o proba anulata "sus" parea totusi editabila "jos", exact
  // confuzia semnalata direct de beneficiar.
  if (sample.qcStatus === 'rejected') {
    panel.innerHTML = `
      ${renderHumanStatus(sample, 'operator')}
      ${renderWorkflowRail(sample, 'operator')}
    `;
    document.getElementById('btn-print-rejection-cert')?.addEventListener('click', () => printRejectionCertificate(sample.id));
    return;
  }

  // Poarta de intrare: inainte sa se introduca vreo valoare analitica,
  // operatorul trebuie sa confirme explicit ca proba e in stare
  // corespunzatoare pentru analiza. Aratata DOAR pentru o proba complet
  // netratata inca (nimic introdus) - o proba deja in lucru nu e intrerupta
  // retroactiv de aceasta poarta, chiar daca intake_checked_at e gol dintr-o
  // etapa anterioara a proiectului.
  const needsIntakeGate = !sample.intakeCheckedAt && !sample.analysisDate && !sample.method;
  if (needsIntakeGate) {
    panel.innerHTML = `
      ${renderWorkflowRail(sample, 'operator')}
      <div class="intake-gate-card">
        <div class="intake-gate-eyebrow">${t('operator.intakeGateEyebrow')}</div>
        <h3>${t('operator.intakeGateTitle')}</h3>
        <p>${t('operator.intakeGateBody')}</p>
        <div class="intake-gate-actions">
          <button class="btn" id="intake-gate-yes">${t('operator.intakeGateYes')}</button>
          <button class="btn secondary" id="intake-gate-no">${t('operator.intakeGateNo')}</button>
          <button class="btn secondary" id="btn-print-label">${t('operator.printLabelBtn')}</button>
        </div>
        <div id="intake-gate-reason-block" style="display:none;">
          <label for="intake-gate-reason">${t('operator.fieldQcRejectionReason')}</label>
          <textarea id="intake-gate-reason" rows="2" placeholder="${t('operator.qcRejectionReasonPlaceholder')}"></textarea>
          <div class="section-hint">${t('operator.qcRejectionWarning')}</div>
          <button class="btn danger" id="intake-gate-confirm-reject">${t('operator.intakeGateConfirmReject')}</button>
        </div>
      </div>
    `;
    document.getElementById('btn-print-label').addEventListener('click', () => printSampleLabel(sample.id));
    document.getElementById('intake-gate-yes').addEventListener('click', async () => {
      try {
        await api(`/results/${sample.id}`, { method: 'PUT', body: JSON.stringify({ intakeConfirmed: true }) });
        await loadOperatorQueue();
        renderOperatorDetail();
      } catch (err) { showToast(t('operator.saveError') + ' ' + err.message); }
    });
    document.getElementById('intake-gate-no').addEventListener('click', () => {
      document.getElementById('intake-gate-reason-block').style.display = 'block';
    });
    document.getElementById('intake-gate-confirm-reject').addEventListener('click', async () => {
      const reason = document.getElementById('intake-gate-reason').value.trim();
      if (!reason) { showToast(t('operator.qcRejectionReasonRequired')); return; }
      try {
        await api(`/results/${sample.id}`, { method: 'PUT', body: JSON.stringify({ qcStatus: 'rejected', qcRejectionReason: reason, intakeConfirmed: true }) });
        await loadOperatorQueue();
        renderOperatorDetail();
      } catch (err) { showToast(t('operator.saveError') + ' ' + err.message); }
    });
    return;
  }

  // O proba trimisa deja spre validare (QC decis, neintoarsa de validator)
  // se blocheaza pentru operator - singura cale de redeschidere e respingerea
  // explicita a validatorului la revizuire.
  const isSubmittedToValidator = (sample.qcStatus === 'accepted' || sample.qcStatus === 'not_required') && sample.reviewStatus !== 'rejected';
  if (isSubmittedToValidator && currentUser.role === 'operator') {
    panel.innerHTML = `
      ${renderWorkflowRail(sample, 'operator')}
      <div class="intake-gate-card">
        <div class="intake-gate-eyebrow">${t('operator.workloadToValidate')}</div>
        <h3>${t('operator.submittedLockedTitle')}</h3>
        <p>${t('operator.submittedLockedText')}</p>
      </div>
      <div class="actions-row"><div class="actions-left"><button class="btn secondary" id="btn-history">${t('common.historyTitle')}</button><button class="btn secondary" id="btn-print-label">${t('operator.printLabelBtn')}</button></div></div>
      <div id="audit-slot"></div>
    `;
    document.getElementById('btn-history').addEventListener('click', () => loadUnifiedHistory(sample.id, 'audit-slot'));
    document.getElementById('btn-print-label').addEventListener('click', () => printSampleLabel(sample.id));
    return;
  }

  const afVals = ['afb1', 'afb2', 'afg1', 'afg2'].map(k => sample[k]);
  const afAllEntered = afVals.every(v => v !== null && v !== undefined);
  const afSum = afAllEntered ? afVals.reduce((a, b) => a + b, 0) : null;

  panel.innerHTML = `
    ${renderWorkflowRail(sample, 'operator')}
    ${renderNextActionCard(sample, 'operator')}
    ${renderOperatorReadiness(sample)}
    ${renderDataLineage(sample)}
    ${sample.isControlSample ? `<div class="control-sample-banner">⚙ ${t('operator.controlSampleBanner')}</div>` : ''}
    <div class="bulletin${currentUser.role === 'validator' ? ' validator-review-mode' : ''}">
      <div class="bulletin-head">
        <div>
          <div class="detail-title-line"><div><span class="eyebrow">${t('operator.dossierEyebrow')}</span><h1>${t('operator.formTitlePrefix')} ${escapeHtml(sample.code)}</h1>
          <div class="institution">${escapeHtml(sample.productName)} ${sample.category ? '· ' + escapeHtml(categoryLabel(sample.category)) : ''}</div></div><span class="task-context">${escapeHtml(nextActionForSample(sample))}</span></div>
        </div>
        <div class="verdict ${sample.status}">${statusLabelUI(sample.status)}</div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="f-analysisDate">${t('operator.fieldAnalysisDate')}</label>
          <input type="date" id="f-analysisDate" value="${sample.analysisDate || ''}">
        </div>
        <div class="field">
          <label for="f-dueDate">${t('operator.fieldDueDate')}</label>
          <div class="due-date-edit-row">
            <input type="date" id="f-dueDate" value="${sample.dueDate || ''}">
            <button type="button" class="btn secondary small-btn" id="btn-save-due-date">${t('operator.saveDueDateBtn')}</button>
          </div>
          ${(() => {
            // Aceeasi logica folosita si la beneficiar si in coada - fara ea,
            // campul "Termen" era complet inert aici: nimic nu spunea daca
            // analiza e in termen, aproape de termen, sau deja depasita.
            const st = dueDateStatus(sample.dueDate, sample.validationStatus, sample.status);
            if (st === 'none' || st === 'done') return '';
            const label = st === 'overdue' ? t('owner.dueDateOverdue') : st === 'soon' ? t('owner.dueDateSoon') : t('operator.dueDateOnTrack');
            return `<div class="due-date-chip ${st}" style="margin-top:6px;">${label}</div>`;
          })()}
        </div>
        <div class="field">
          <label for="f-method">${t('operator.fieldMethod')}</label>
          <input type="text" id="f-method" value="${escapeHtml(sample.method || '')}" placeholder="${t('operator.methodPlaceholder')}">
        </div>
        <div class="field">
          <label for="f-equipment">${t('operator.fieldEquipment')}</label>
          <input type="text" id="f-equipment" value="${escapeHtml(sample.equipment || '')}" placeholder="${t('operator.equipmentPlaceholder')}">
        </div>
        <div class="field rule-field">
          <label for="f-rule-select">${t('operator.fieldCategoryType')}</label>
          <div class="rule-inline">
            <select id="f-rule-select" class="rule-select">
              <option value="">${t('operator.exploratoryOption')}</option>
              ${RULE_PROFILES_CACHE.map(p => `<option value="${p.id}">${escapeHtml(categoryLabel(p.label))}</option>`).join('')}
            </select>
            <button type="button" class="btn secondary small-btn" id="btn-suggest-rule" title="${t('operator.suggestByProductTitle')}">${t('operator.suggestByProductBtn')}</button>
          </div>
          <span id="rule-suggestion" class="rule-suggestion"></span>
        </div>
        <div class="field">
          <label>${t('operator.fieldResultValidation')}</label>
          <div class="field-static"><span class="validation-badge ${sample.validationStatus === 'validated' ? 'validated' : ''}">${sample.validationStatus === 'validated' ? t('operator.validatedShort') : t('operator.draftShort')}</span>${sample.validatedByName ? ` · ${escapeHtml(sample.validatedByName)}` : ''}</div>
        </div>
        <div class="field">
          <label for="f-limitAfb1">${t('operator.limitAfb1Label')}</label>
          <input type="number" step="0.1" id="f-limitAfb1" value="${sample.limitAfb1 ?? ''}">
        </div>
        <div class="field">
          <label for="f-limitAflaSum">${t('operator.limitAflaSumLabel')}</label>
          <input type="number" step="0.1" id="f-limitAflaSum" value="${sample.limitAflaSum ?? ''}">
        </div>
        <div class="field">
          <label for="f-limitReason">${t('operator.limitReasonLabel')}</label>
          <input type="text" id="f-limitReason" maxlength="300" placeholder="${t('operator.limitReasonHint')}" value="">
          <div class="section-hint">${limitProvenanceText(sample)}</div>
        </div>
        <div class="field">
          <label for="f-limitOta">${t('operator.limitOtaLabel')}</label>
          <input type="number" step="0.1" id="f-limitOta" value="${sample.limitOta ?? ''}">
        </div>
      </div>

      <div class="section-label"><span>${t('operator.contaminantResultsTitle')} <span class="unit">(µg/kg)</span></span><span class="section-hint">${t('operator.contaminantResultsHint')}</span></div>
      <div id="live-assessment" class="live-assessment empty" aria-live="polite"></div>
      <table class="contaminants">
        <thead>
          <tr><th style="padding-left:28px;">${t('operator.colContaminant')}</th><th>${t('operator.colResult')}</th><th>${t('operator.colMaxLimit')}</th><th>${t('operator.colVerdict')}</th></tr>
        </thead>
        <tbody>
          ${(() => {
            // Sursa de adevar pentru ce randuri se arata este lista de
            // analize comandate de proprietar la inregistrare. Fara lista
            // salvata (probe mai vechi), pastram comportamentul vechi -
            // toate randurile raman vizibile (mod exploratoriu).
            const requested = sample.requestedTests;
            const hasTest = (group) => !requested || requested.includes(group);
            let rows = '';

            if (hasTest('aflatoxins')) {
              rows += AFLATOXIN_ROWS.map(row => {
                const val = sample[row.key];
                const limitKey = row.key === 'afb1' ? 'limitAfb1' : null;
                const limit = limitKey ? sample[limitKey] : null;
                const isOver = limit !== null && val !== null && val !== undefined && val > limit;
                let flag = '<span class="result-flag empty">—</span>';
                if (val !== null && val !== undefined) {
                  if (limit === null) flag = `<span class="result-flag empty">${t('operator.flagSeeSumTable')}</span>`;
                  else flag = isOver ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
                }
                return `
                  <tr>
                    <td class="name-cell" style="padding-left:28px;">${row.label}</td>
                    <td><input type="number" step="0.01" min="0" class="mono result-input ${isOver ? 'over-limit' : ''}" data-key="${row.key}" value="${val !== null && val !== undefined ? val : ''}" placeholder="0.00"></td>
                    <td class="limit-cell mono">${limit !== null && limit !== undefined ? limit : '—'}</td>
                    <td id="flag-${row.key}">${flag}</td>
                  </tr>
                `;
              }).join('');
              rows += `
                <tr class="sum-row">
                  <td class="name-cell">${t('operator.aflatoxinSumRowLabel')}</td>
                  <td class="mono" id="live-af-sum">${afSum !== null ? afSum.toFixed(2) : '—'}</td>
                  <td class="limit-cell mono">${sample.limitAflaSum ?? '—'}</td>
                  <td id="live-af-sum-flag">${afSum !== null && sample.limitAflaSum !== null && afSum > sample.limitAflaSum ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : afSum !== null ? `<span class="result-flag ok">${t('operator.flagConform')}</span>` : '<span class="result-flag empty">—</span>'}</td>
                </tr>
              `;
            }

            if (hasTest('ota')) {
              const val = sample.ota;
              const limit = sample.limitOta;
              const isOver = limit !== null && val !== null && val !== undefined && val > limit;
              let flag = '<span class="result-flag empty">—</span>';
              if (val !== null && val !== undefined) {
                flag = isOver ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
              }
              rows += `
                <tr class="ota-row">
                  <td class="name-cell" style="padding-left:28px;">${OTA_ROW.label}</td>
                  <td><input type="number" step="0.01" min="0" class="mono result-input ${isOver ? 'over-limit' : ''}" data-key="ota" value="${val !== null && val !== undefined ? val : ''}" placeholder="0.00"></td>
                  <td class="limit-cell mono">${limit !== null && limit !== undefined ? limit : '—'}</td>
                  <td id="flag-ota">${flag}</td>
                </tr>
              `;
            }

            if (hasTest('m1')) {
              rows += `
                <tr class="m1-row">
                  <td class="name-cell" style="padding-left:28px;">${bt('bulletin.aflatoxinM1Name')} <span class="section-hint">${bt('bulletin.milkOnly')}</span></td>
                  <td><input type="number" step="0.001" min="0" class="mono result-input ${(sample.limitM1 !== null && sample.limitM1 !== undefined && sample.m1 !== null && sample.m1 !== undefined && sample.m1 > sample.limitM1) ? 'over-limit' : ''}" data-key="m1" value="${sample.m1 !== null && sample.m1 !== undefined ? sample.m1 : ''}" placeholder="0.000"></td>
                  <td class="limit-cell mono"><input type="number" step="0.001" min="0" id="f-limitM1" class="mono" value="${sample.limitM1 ?? ''}" placeholder="${t('operator.m1LimitPlaceholder')}" style="width:90px;"></td>
                  <td id="flag-m1">${(() => {
                    if (sample.m1 === null || sample.m1 === undefined) return '<span class="result-flag empty">—</span>';
                    if (sample.limitM1 === null || sample.limitM1 === undefined) return `<span class="result-flag empty">${t('operator.noLimitFlag')}</span>`;
                    return sample.m1 > sample.limitM1 ? `<span class="result-flag fail">${t('operator.flagExceeded')}</span>` : `<span class="result-flag ok">${t('operator.flagConform')}</span>`;
                  })()}</td>
                </tr>
              `;
            }

            if (hasTest('don')) rows += renderEditableExtraToxinRow(sample, 'don', bt('bulletin.donName'), bt('bulletin.fusariumToxins'), 1);
            if (hasTest('zea')) rows += renderEditableExtraToxinRow(sample, 'zea', bt('bulletin.zeaName'), bt('bulletin.fusariumToxins'), 0.1);
            if (hasTest('fum')) rows += renderEditableExtraToxinRow(sample, 'fum', bt('bulletin.fumName'), bt('bulletin.fusariumMaize'), 1);

            return rows;
          })()}
        </tbody>

      </table>

      <div id="nonconforming-slot"></div>

      <div class="section-label">${t('operator.notesLabel')}</div>
      <div class="notes-area">
        <textarea id="f-notes" placeholder="${t('operator.notesPlaceholder')}">${escapeHtml(sample.notes || '')}</textarea>
      </div>

      <div class="final-qc-card">
        <div class="section-label">${t('operator.finalQcTitle')}</div>
        <p class="section-hint">${t('operator.finalQcHint')}</p>
        <div class="field">
          <label for="f-qcStatus">${t('operator.fieldQc')}</label>
          <select id="f-qcStatus">
            <option value="pending" ${(operatorQcSelection || sample.qcStatus || 'pending') === 'pending' ? 'selected' : ''}>${t('operator.qcPending')}</option>
            <option value="accepted" ${(operatorQcSelection || sample.qcStatus) === 'accepted' ? 'selected' : ''}>${t('operator.qcAcceptedOption')}</option>
            <option value="not_required" ${(operatorQcSelection || sample.qcStatus) === 'not_required' ? 'selected' : ''}>${t('operator.qcNotApplicableOption')}</option>
          </select>
          <div class="section-hint">${t('operator.qcAnalyticalHint')}</div>
        </div>
        ${(() => {
          const st = getOperatorFormState(sample);
          const blockersText = st.submitBlockers.join(', ');
          const btnTitle = st.canSubmitToValidator ? '' : `disabled title="${escapeAttr(`${t('operator.submitToValidatorIncompleteTitle')} ${blockersText}`)}"`;
          return `<button class="btn primary-action" id="btn-submit-to-validator" ${btnTitle}>${t('operator.submitToValidatorBtn')}</button>
        ${!st.canSubmitToValidator ? `<p class="section-hint submit-blockers-hint"><strong>${t('operator.submitBlockersPrefix')}</strong> ${escapeHtml(blockersText)}</p>` : ''}`;
        })()}
        <p class="section-hint">${t('operator.submitToValidatorWarning')}</p>
      </div>

      ${renderReviewSection(sample)}

      <div class="actions-row">
        <div class="save-state" id="save-state">${t('operator.allSavedOperator')}</div>
        <div class="actions-left">
          <button class="btn secondary" id="btn-save-results" disabled>${t('operator.saveResultsBtn')}</button>
          <button class="btn ${getOperatorFormState(sample).ready && currentUser.role !== 'operator' ? 'primary-action' : 'secondary'}" id="btn-validate-results" ${currentUser.role === 'operator' ? `disabled title="${escapeAttr(t('operator.validateOnlyValidatorTitle'))}"` : 'disabled'}>${t('operator.validateResultBtn')}</button>
          <button class="btn secondary" id="btn-history">${t('common.historyTitle')}</button>
          <button class="btn secondary" id="btn-print-label">${t('operator.printLabelBtn')}</button>
        </div>
      </div>
      <div id="audit-slot"></div>
    </div>
  `;

  // Validatorul poate vedea toate datele (pentru revizuire), dar nu mai are
  // voie sa le editeze sau sa trimita proba - actiunile astea sunt acum
  // blocate si la backend. Dezactivam efectiv campurile, nu doar vizual,
  // si ascundem butoanele care oricum ar esua cu 403 daca le-ar apasa.
  if (currentUser.role === 'validator') {
    const reviewRoot = panel.querySelector('.validator-review-mode');
    if (reviewRoot) {
      reviewRoot.querySelectorAll('input, select, textarea').forEach(el => { el.disabled = true; });
      const finalQcCard = reviewRoot.querySelector('.final-qc-card');
      if (finalQcCard) finalQcCard.style.display = 'none';
      const saveBtn = reviewRoot.querySelector('#btn-save-results');
      if (saveBtn) saveBtn.style.display = 'none';
      // "Propune după produs" e un <button>, nu unul din input/select/textarea
      // dezactivate mai sus - ramanea singurul control inca activ din tot
      // formularul, permitand validatorului sa schimbe efectiv categoria (si
      // implicit limitele legale aplicate) pe o proba pe care nu are voie sa
      // o mai editeze. Dezactivat explicit, la fel ca restul campurilor.
      const suggestBtn = reviewRoot.querySelector('#btn-suggest-rule');
      if (suggestBtn) suggestBtn.disabled = true;
    }
    const ncSlot = document.getElementById('nonconforming-slot');
    if (ncSlot) ncSlot.style.display = 'none';
  }

  const applyRuleProfile = (profile, options = {}) => {
    const info = document.getElementById('rule-info');
    if (!profile) {
      // Fara profil selectat = modul "analiza exploratorie": toate campurile
      // raman active, nicio estompare.
      setFieldRelevance(null);
      if (info && !options.silent) info.textContent = t('operator.noCategorySelected');
      return;
    }
    const m1Part = profile.limit_m1 !== null && profile.limit_m1 !== undefined ? ` · M1 ${profile.limit_m1}` : '';
    const donPart = profile.limit_don !== null && profile.limit_don !== undefined ? ` · DON ${profile.limit_don}` : '';
    const zeaPart = profile.limit_zea !== null && profile.limit_zea !== undefined ? ` · ZEA ${profile.limit_zea}` : '';
    const fumPart = profile.limit_fum !== null && profile.limit_fum !== undefined ? ` · Fumonizine ${profile.limit_fum}` : '';
    if (info) info.innerHTML = `${escapeHtml(profile.label)} · AFB1 ${profile.limit_afb1 ?? '—'} · ${t('operator.aflatoxinSumInline')} ${profile.limit_afla_sum ?? '—'} · OTA ${profile.limit_ota ?? '—'}${m1Part}${donPart}${zeaPart}${fumPart} µg/kg. ${ruleSourceLabel(profile.source)}`;
    document.getElementById('f-limitAfb1').value = profile.limit_afb1 ?? '';
    document.getElementById('f-limitAflaSum').value = profile.limit_afla_sum ?? '';
    document.getElementById('f-limitOta').value = profile.limit_ota ?? '';
    const limitM1Field = document.getElementById('f-limitM1');
    if (limitM1Field) limitM1Field.value = profile.limit_m1 ?? '';
    const limitDonField = document.getElementById('f-limitDon');
    if (limitDonField) limitDonField.value = profile.limit_don ?? '';
    const limitZeaField = document.getElementById('f-limitZea');
    if (limitZeaField) limitZeaField.value = profile.limit_zea ?? '';
    const limitFumField = document.getElementById('f-limitFum');
    if (limitFumField) limitFumField.value = profile.limit_fum ?? '';
    setFieldRelevance(profile);
    updateLiveAssessment();
  };

  // Estompeaza vizual (fara sa ascunda) campurile care nu au limita in
  // profilul curent - raman completabile manual daca operatorul are motiv.
  const setFieldRelevance = (profile) => {
    const relevance = {
      afb1: !profile || (profile.limit_afb1 !== null && profile.limit_afb1 !== undefined) || (profile.limit_afla_sum !== null && profile.limit_afla_sum !== undefined),
      afb2: !profile || (profile.limit_afla_sum !== null && profile.limit_afla_sum !== undefined),
      afg1: !profile || (profile.limit_afla_sum !== null && profile.limit_afla_sum !== undefined),
      afg2: !profile || (profile.limit_afla_sum !== null && profile.limit_afla_sum !== undefined),
      ota: !profile || (profile.limit_ota !== null && profile.limit_ota !== undefined),
      m1: !profile || (profile.limit_m1 !== null && profile.limit_m1 !== undefined),
      don: !profile || (profile.limit_don !== null && profile.limit_don !== undefined),
      zea: !profile || (profile.limit_zea !== null && profile.limit_zea !== undefined),
      fum: !profile || (profile.limit_fum !== null && profile.limit_fum !== undefined),
    };
    Object.entries(relevance).forEach(([key, isRelevant]) => {
      const row = document.querySelector(`.result-input[data-key="${key}"]`)?.closest('tr');
      if (row) row.classList.toggle('field-not-relevant', !isRelevant);
    });
  };

  document.getElementById('f-rule-select').addEventListener('change', (e) => {
    operatorSelectedProfileId = e.target.value;
    const profile = RULE_PROFILES_CACHE.find(p => p.id === operatorSelectedProfileId) || null;
    applyRuleProfile(profile);
    if (profile) showToast(t('operator.fieldsNotRelevantToast'));
  });

  document.getElementById('btn-save-due-date').addEventListener('click', async () => {
    const dueDate = document.getElementById('f-dueDate').value;
    try {
      await api(`/samples/${sample.id}/due-date`, { method: 'PUT', body: JSON.stringify({ dueDate: dueDate || null }) });
      sample.dueDate = dueDate || null;
      showToast('Termenul de livrare a fost salvat.');
      renderOperatorList();
    } catch (err) {
      showToast(t('operator.dueDateSaveError') + ' ' + err.message);
    }
  });

  const reviewApprove = async () => {
    const note = window.prompt(t('operator.approveNotePrompt'), '');
    if (note === null) return;
    try {
      await api(`/results/${sample.id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'approved', note }) });
      showToast(t('operator.resultsApprovedToast'));
      await loadOperatorQueue();
      renderOperatorList();
      renderOperatorDetail();
    } catch (err) {
      showToast(t('operator.approveErrorPrefix') + ' ' + err.message);
    }
  };
  const reviewReject = async () => {
    const note = window.prompt(t('operator.rejectReasonPrompt'), '');
    if (note === null) return;
    try {
      await api(`/results/${sample.id}/review`, { method: 'POST', body: JSON.stringify({ decision: 'rejected', note }) });
      showToast(t('operator.resultsRejectedToast'));
      await loadOperatorQueue();
      renderOperatorList();
      renderOperatorDetail();
    } catch (err) {
      showToast(t('operator.rejectErrorPrefix') + ' ' + err.message);
    }
  };
  document.getElementById('btn-review-approve')?.addEventListener('click', reviewApprove);
  document.getElementById('btn-review-reject')?.addEventListener('click', reviewReject);

  // La deschiderea probei, daca operatorul selectase deja un profil pentru
  // ea in aceasta sesiune, il reaplicam (estomparea vizuala nu e persistata
  // in baza de date - e doar un mod de lucru al operatorului).
  if (operatorSelectedProfileId) {
    const preselected = RULE_PROFILES_CACHE.find(p => p.id === operatorSelectedProfileId) || null;
    document.getElementById('f-rule-select').value = operatorSelectedProfileId;
    applyRuleProfile(preselected, { silent: true });
  } else if (sample.category) {
    // Proba are deja categoria declarată la înregistrare: o preluăm ca implicit,
    // ca analistul să nu re-alegă ce a declarat clientul. Fără asta, formularul
    // pornea pe „fără categorie" și limirile afișate erau cele generice.
    const buton = document.getElementById('btn-suggest-rule');
    if (buton) buton.click();
  }

  document.getElementById('btn-suggest-rule').addEventListener('click', async () => {
    try {
      const category = sample.category || '';
      const productName = sample.productName || '';
      const data = await api(`/results/rules?category=${encodeURIComponent(category)}&productName=${encodeURIComponent(productName)}`);
      operatorRuleProfiles = data.profiles || [];
      operatorSuggestedRule = data.suggested || null;
      const suggestion = document.getElementById('rule-suggestion');
      if (!operatorSuggestedRule) {
        suggestion.textContent = t('operator.noAutoMatch');
        return;
      }
      suggestion.innerHTML = `${escapeHtml(categoryLabel(operatorSuggestedRule.label))} · ${ruleSourceLabel(operatorSuggestedRule.source)}`;
      operatorSelectedProfileId = operatorSuggestedRule.id;
      document.getElementById('f-rule-select').value = operatorSuggestedRule.id;
      applyRuleProfile(operatorSuggestedRule);
      showToast(t('operator.profileSuggestedApplied'));
    } catch (err) {
      showToast(t('operator.rulesLoadError'));
    }
  });

  // Nota: probele validate au fost deja tratate mai sus (return timpuriu,
  // afiseaza documentul de buletin in loc de acest formular) - la acest
  // punct din functie, proba e mereu needitabila garantat FALSA pentru
  // validare, deci isLocked ramane doar pentru compatibilitate cu restul
  // codului de mai jos (nu mai reprezinta o stare posibila aici).
  const isLocked = false;

  let formDirty = false;
  const markDirty = () => {
    formDirty = true;
    activeFormDirty = true;
    const state = document.getElementById('save-state');
    if (state) { state.textContent = t('operator.unsavedChanges'); state.classList.add('dirty'); }
    const saveBtn = document.getElementById('btn-save-results');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.classList.add('primary-action'); saveBtn.classList.remove('secondary'); }
  };
  if (!isLocked) {
    panel.querySelectorAll('input, select, textarea').forEach(el => el.addEventListener('input', () => { markDirty(); el.closest('.field')?.classList.remove('has-error'); el.closest('.field')?.querySelector('.field-error')?.remove(); el.removeAttribute('aria-invalid'); updateOperatorReadiness(sample); updateLiveAssessment(); }));
  }
  const clearDirty = () => {
    formDirty = false;
    activeFormDirty = false;
    const state = document.getElementById('save-state');
    if (state) { state.textContent = t('operator.allSavedOperator'); state.classList.remove('dirty'); }
    const saveBtn = document.getElementById('btn-save-results');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.classList.remove('primary-action'); saveBtn.classList.add('secondary'); }
  };
  document.getElementById('f-qcStatus')?.addEventListener('change', (e) => { operatorQcSelection = e.target.value; });
  document.getElementById('btn-save-results').addEventListener('click', async () => {
    if (sample.validationStatus === 'validated') {
      showToast(t('operator.validatedCannotModify'));
      return;
    }
    // qcStatus si qcRejectionReason NU se trimit aici, intentionat - o
    // salvare obisnuita nu trebuie sa poata "trimite" proba spre validare
    // ca efect secundar al faptului ca meniul de QC avea deja "Acceptat"
    // selectat dintr-o interactiune anterioara. Doar butonul explicit
    // "Trimite spre validare" seteaza aceste campuri, deliberat.
    const payload = {
      analysisDate: document.getElementById('f-analysisDate').value,
      notes: document.getElementById('f-notes').value,
      method: document.getElementById('f-method').value.trim(),
      equipment: document.getElementById('f-equipment')?.value.trim() || '',
      limitAfb1: document.getElementById('f-limitAfb1').value,
      limitAflaSum: document.getElementById('f-limitAflaSum').value,
      limitOta: document.getElementById('f-limitOta').value,
      limitM1: document.getElementById('f-limitM1')?.value ?? '',
      limitDon: document.getElementById('f-limitDon')?.value ?? '',
      limitZea: document.getElementById('f-limitZea')?.value ?? '',
      limitFum: document.getElementById('f-limitFum')?.value ?? '',
      limitChangeReason: document.getElementById('f-limitReason')?.value.trim() || '',
    };
    document.querySelectorAll('.result-input').forEach(input => {
      payload[input.dataset.key] = input.value;
    });

    try {
      await api(`/results/${sample.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      clearDirty();
      showToast(t('operator.resultsSavedToast'));
      await loadOperatorQueue();
      operatorActiveId = sample.id;
      renderOperatorList();
      renderOperatorDetail();
    } catch (err) {
      showToast(t('operator.errorPrefix') + ' ' + err.message);
    }
  });

  document.getElementById('btn-submit-to-validator').addEventListener('click', async () => {
    // Plasa de siguranta, pe langa dezactivarea vizuala a butonului - o
    // proba cu rezultate incomplete nu trebuie sa poata pleca spre
    // validare sub nicio forma, indiferent cum a fost declansat click-ul.
    if (!getOperatorFormState(sample).canSubmitToValidator) {
      showToast(t('operator.submitToValidatorIncompleteTitle'));
      return;
    }
    const qcVal = document.getElementById('f-qcStatus').value;
    if (qcVal !== 'accepted' && qcVal !== 'not_required') {
      showToast(t('operator.submitToValidatorError'));
      return;
    }
    const payload = {
      analysisDate: document.getElementById('f-analysisDate').value,
      notes: document.getElementById('f-notes').value,
      method: document.getElementById('f-method').value.trim(),
      equipment: document.getElementById('f-equipment')?.value.trim() || '',
      qcStatus: qcVal,
      limitAfb1: document.getElementById('f-limitAfb1').value,
      limitAflaSum: document.getElementById('f-limitAflaSum').value,
      limitOta: document.getElementById('f-limitOta').value,
      limitM1: document.getElementById('f-limitM1')?.value ?? '',
      limitDon: document.getElementById('f-limitDon')?.value ?? '',
      limitZea: document.getElementById('f-limitZea')?.value ?? '',
      limitFum: document.getElementById('f-limitFum')?.value ?? '',
      limitChangeReason: document.getElementById('f-limitReason')?.value.trim() || '',
    };
    document.querySelectorAll('.result-input').forEach(input => {
      payload[input.dataset.key] = input.value;
    });
    try {
      await api(`/results/${sample.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      clearDirty();
      operatorQcSelection = null;
      showToast(t('operator.submitToValidatorBtn') + ' ✓');
      await loadOperatorQueue();
      operatorActiveId = sample.id;
      renderOperatorList();
      renderOperatorDetail();
    } catch (err) {
      showToast(t('operator.errorPrefix') + ' ' + err.message);
    }
  });

  document.getElementById('btn-validate-results').addEventListener('click', async () => {
    if (formDirty) { showToast(t('operator.saveChangesFirst')); return; }
    const readiness = getOperatorFormState({
      ...sample,
      analysisDate: document.getElementById('f-analysisDate')?.value, method: document.getElementById('f-method')?.value.trim(),
      qcStatus: document.getElementById('f-qcStatus')?.value, limitAfb1: document.getElementById('f-limitAfb1')?.value,
      limitAflaSum: document.getElementById('f-limitAflaSum')?.value, limitOta: document.getElementById('f-limitOta')?.value,
      ...Object.fromEntries([...document.querySelectorAll('.result-input')].map(i => [i.dataset.key, i.value]))
    });
    if (!readiness.ready) {
      const first = readiness.fields.find(f => !f.valid);
      const targetId = first?.id || document.querySelector('.result-input:not([value])')?.id;
      const message = first?.label ? `${first.label} ${t('operator.fieldRequiredForValidation')}` : t('operator.completeAllRequiredResults');
      showToast(message);
      if (targetId) focusAndExplain(targetId, message);
      return;
    }
    const live = readLiveOperatorValues();
    const hasFailure = [
      Number.isFinite(live.afb1) && Number.isFinite(live.limitAfb1) && live.afb1 > live.limitAfb1,
      Number.isFinite(live.sum) && Number.isFinite(live.limitSum) && live.sum > live.limitSum,
      Number.isFinite(live.ota) && Number.isFinite(live.limitOta) && live.ota > live.limitOta
    ].some(Boolean);
    const confirmation = hasFailure
      ? t('operator.confirmValidateNonconform')
      : t('operator.confirmValidateBulletin');
    if (!window.confirm(confirmation)) return;
    try {
      await api(`/results/${sample.id}/validate`, { method: 'POST', body: JSON.stringify({}) });
      showToast(t('operator.resultValidatedToast'));
      await loadOperatorQueue();
      renderOperatorDetail();
    } catch (err) { showToast(t('operator.validationErrorPrefix') + ' ' + err.message); }
  });

  document.getElementById('btn-history').addEventListener('click', () => loadUnifiedHistory(sample.id, 'audit-slot'));
  document.getElementById('btn-print-label').addEventListener('click', () => printSampleLabel(sample.id));
  panel.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      document.getElementById('btn-save-results')?.click();
    }
  });


  document.getElementById('btn-next-action')?.addEventListener('click', () => focusNextAction(sample));
  if (!isLocked) {
    updateOperatorReadiness(sample);
    updateLiveAssessment();
  }
  renderNonconformingPanel(sample.id);

  // v1.13: task-first keyboard navigation. Shortcuts are intentionally limited
  // to the active operator dossier so they do not interfere with normal typing.
  panel.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = (event.target?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (event.key === '1') document.getElementById('f-analysisDate')?.focus();
    if (event.key === '2') document.getElementById('f-method')?.focus();
    if (event.key === '3') document.getElementById('f-qcStatus')?.focus();
    if (event.key === '4') document.getElementById('btn-validate-results')?.focus();
  });

}

// ================= OPERATOR ARCHIVE VIEW =================
function renderOperatorArchiveView() {
  const root = document.getElementById('operator-view-root');
  root.innerHTML = `
    <div class="detail view-transition">
      <div class="archive-toolbar">
        <div class="field">
          <label for="oaf-search">${t('operator.archiveSearchLabel')}</label>
          <input type="text" id="oaf-search" placeholder="${t('operator.archiveSearchPlaceholder')}" value="${escapeHtml(operatorArchiveFilters.search)}">
        </div>
        <div class="field">
          <label for="oaf-category">${t('operator.archiveCategoryLabel')}</label>
          <input type="text" id="oaf-category" placeholder="${t('operator.archiveCategoryPlaceholder')}" value="${escapeHtml(operatorArchiveFilters.category)}">
        </div>
        <div class="field narrow">
          <label for="oaf-status">${t('operator.archiveStatusLabel')}</label>
          <select id="oaf-status">
            <option value="">${t('operator.archiveStatusAll')}</option>
            <option value="ok" ${operatorArchiveFilters.status === 'ok' ? 'selected' : ''}>${t('operator.archiveStatusConform')}</option>
            <option value="fail" ${operatorArchiveFilters.status === 'fail' ? 'selected' : ''}>${t('operator.archiveStatusExceeded')}</option>
            <option value="pending" ${operatorArchiveFilters.status === 'pending' ? 'selected' : ''}>${t('operator.archiveStatusPending')}</option>
            <option value="in_analysis" ${operatorArchiveFilters.status === 'in_analysis' ? 'selected' : ''}>${t('operator.archiveStatusInAnalysis')}</option>
          </select>
        </div>
        <div class="field narrow">
          <label for="oaf-dateFrom">${t('operator.archiveDateFromLabel')}</label>
          <input type="date" id="oaf-dateFrom" value="${operatorArchiveFilters.dateFrom}">
        </div>
        <div class="field narrow">
          <label for="oaf-dateTo">${t('operator.archiveDateToLabel')}</label>
          <input type="date" id="oaf-dateTo" value="${operatorArchiveFilters.dateTo}">
        </div>
        <div class="archive-actions">
          <button class="btn secondary" id="btn-op-archive-filter">${t('operator.archiveFilterBtn')}</button>
          <button class="btn" id="btn-op-archive-export">${t('operator.archiveExportBtn')}</button>
        </div>
      </div>
      <div class="archive-table-wrap">
        <table class="archive-table" id="op-archive-table">
          <thead>
            <tr>
              <th>${t('operator.archiveColCode')}</th><th>${t('operator.archiveColProduct')}</th><th>${t('operator.archiveColCategory')}</th><th>${t('operator.archiveColOwner')}</th><th>${t('operator.archiveColSampleDate')}</th><th>${t('operator.archiveColStatus')}</th>
            </tr>
          </thead>
          <tbody id="op-archive-tbody">
            <tr><td colspan="6" class="archive-empty">${t('operator.archiveLoading')}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="archive-count" id="op-archive-count"></div>
      <div class="pagination-controls" id="op-archive-pagination"></div>
    </div>
  `;

  const readFilters = () => {
    operatorArchiveFilters.search = document.getElementById('oaf-search').value.trim();
    operatorArchiveFilters.category = document.getElementById('oaf-category').value.trim();
    operatorArchiveFilters.status = document.getElementById('oaf-status').value;
    operatorArchiveFilters.dateFrom = document.getElementById('oaf-dateFrom').value;
    operatorArchiveFilters.dateTo = document.getElementById('oaf-dateTo').value;
  };

  document.getElementById('btn-op-archive-filter').addEventListener('click', () => {
    readFilters();
    operatorArchivePage = 1;
    loadOperatorArchive();
  });

  document.getElementById('btn-op-archive-export').addEventListener('click', () => {
    readFilters();
    exportOperatorArchiveCsv();
  });

  operatorArchivePage = 1;
  loadOperatorArchive();
}

let operatorArchivePage = 1;
let operatorArchiveTotal = 0;
function buildOperatorArchiveQuery() {
  const params = new URLSearchParams();
  if (operatorArchiveFilters.status) params.set('status', operatorArchiveFilters.status);
  if (operatorArchiveFilters.category) params.set('category', operatorArchiveFilters.category);
  if (operatorArchiveFilters.dateFrom) params.set('dateFrom', operatorArchiveFilters.dateFrom);
  if (operatorArchiveFilters.dateTo) params.set('dateTo', operatorArchiveFilters.dateTo);
  if (operatorArchiveFilters.search) params.set('search', operatorArchiveFilters.search);
  params.set('page', operatorArchivePage);
  return params.toString();
}

async function loadOperatorArchive() {
  const tbody = document.getElementById('op-archive-tbody');
  const countEl = document.getElementById('op-archive-count');
  const paginationEl = document.getElementById('op-archive-pagination');
  if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="archive-empty">${t('operator.archiveLoading')}</td></tr>`;

  let pageSize = 50;
  try {
    const qs = buildOperatorArchiveQuery();
    const data = await api('/results/archive' + (qs ? '?' + qs : ''));
    operatorArchiveSamples = data.samples;
    operatorArchiveTotal = data.total;
    operatorArchivePage = data.page;
    pageSize = data.pageSize;
  } catch (e) {
    showToast(t('operator.archiveLoadError'));
    operatorArchiveSamples = [];
    operatorArchiveTotal = 0;
  }

  if (!tbody) return;

  if (operatorArchiveSamples.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="archive-empty">${t('operator.archiveNoResults')}</td></tr>`;
    countEl.textContent = '';
    if (paginationEl) paginationEl.innerHTML = '';
    return;
  }

  tbody.innerHTML = operatorArchiveSamples.map(s => `
    <tr data-id="${s.id}">
      <td class="code-cell">${escapeHtml(s.code)}</td>
      <td>${escapeHtml(s.productName)}</td>
      <td>${s.category ? escapeHtml(categoryLabel(s.category)) : '—'}</td>
      <td>${escapeHtml(s.ownerName || '—')}</td>
      <td>${s.sampleDate || '—'}</td>
      <td><span class="result-flag ${s.status === 'cancelled' ? 'cancelled' : s.validationStatus === 'validated' ? 'ok' : 'empty'}">${archiveWorkflowLabel(s)}</span></td>
    </tr>
  `).join('');

  const rangeStart = (operatorArchivePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(operatorArchivePage * pageSize, operatorArchiveTotal);
  countEl.textContent = `${t('owner.paginationShowing')} ${rangeStart}–${rangeEnd} ${t('owner.paginationOf')} ${operatorArchiveTotal}`;

  if (paginationEl) {
    const hasPrev = operatorArchivePage > 1;
    const hasNext = operatorArchivePage * pageSize < operatorArchiveTotal;
    paginationEl.innerHTML = `
      <button class="btn secondary small-btn" id="op-archive-prev" ${hasPrev ? '' : 'disabled'}>${t('owner.paginationPrev')}</button>
      <span class="pagination-page-label">${operatorArchivePage}</span>
      <button class="btn secondary small-btn" id="op-archive-next" ${hasNext ? '' : 'disabled'}>${t('owner.paginationNext')}</button>
    `;
    if (hasPrev) document.getElementById('op-archive-prev').addEventListener('click', () => { operatorArchivePage -= 1; loadOperatorArchive(); });
    if (hasNext) document.getElementById('op-archive-next').addEventListener('click', () => { operatorArchivePage += 1; loadOperatorArchive(); });
  }

  tbody.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      operatorActiveId = parseInt(row.dataset.id, 10);
      operatorView = 'queue';
      const openedSample = operatorQueue.find(s => s.id === operatorActiveId);
      if (openedSample && openedSample.hasUpdate) {
        openedSample.hasUpdate = false;
        api(`/results/${operatorActiveId}/mark-seen`, { method: 'POST' }).catch(() => {});
      }
      renderOperatorViewRoot();
      document.querySelectorAll('.header-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === 'queue');
      });
    });
  });
}

function exportOperatorArchiveCsv() {
  const qs = buildOperatorArchiveQuery();
  window.location.href = '/api/results/archive/export' + (qs ? '?' + qs : '');
}

// ================= QUALITY / ISO 17025 READINESS =================
async function loadValidationTests() {
  try {
    const data = await api('/validation');
    validationTests = data.tests || [];
    validationSummary = data.summary || { total: 0, passed: 0, failed: 0, notRun: 0 };
  } catch (e) {
    showToast(t('admin.valTestsLoadError'));
  }
}

async function updateValidationTest(id, result) {
  const test = validationTests.find(t => t.id === id);
  const note = prompt(t('admin.valTestNotePrompt'), test?.note || '');
  if (note === null) return;
  try {
    await api(`/validation/${id}`, { method: 'POST', body: JSON.stringify({ result, note }) });
    await loadValidationTests();
    renderQualityView();
    showToast(t('admin.valTestResultRecorded'));
  } catch (e) { showToast(e.message); }
}

async function renderValidationPanel() {
  await loadValidationTests();
  const root = document.getElementById('validation-panel');
  if (!root) return;
  const labels = { passed: t('admin.valPassed'), failed: t('admin.valFailed'), not_run: t('admin.valNotRun') };
  root.innerHTML = `
    <div class="validation-head">
      <div><div class="eyebrow">${t('admin.valEvidenceEyebrow')}</div><h3>${t('admin.valFunctionalTestsTitle')}</h3><p>${t('admin.valFunctionalTestsIntro')}</p></div>
      <div class="validation-summary"><div><strong>${validationSummary.passed}</strong><span>${t('admin.valPassedSummary')}</span></div><div><strong>${validationSummary.failed}</strong><span>${t('admin.valFailedSummary')}</span></div><div><strong>${validationSummary.notRun}</strong><span>${t('admin.valNotRunSummary')}</span></div></div>
    </div>
    <div class="validation-list">
      ${validationTests.map(t2 => `<article class="validation-test ${escapeHtml(t2.result || 'not_run')}">
        <div class="validation-test-code">${escapeHtml(t2.code)}</div>
        <div class="validation-test-body"><div class="validation-test-title"><h4>${escapeHtml(t2.title)}</h4><span class="quality-badge ${t2.result === 'passed' ? 'covered' : t2.result === 'failed' ? 'outside' : 'partial'}">${labels[t2.result] || t('admin.valNotRun')}</span></div><div class="validation-area">${escapeHtml(t2.area)}</div><p><strong>${t('admin.valExpectedResult')}</strong> ${escapeHtml(t2.expected)}</p>${t2.note ? `<p class="validation-note"><strong>${t('admin.valNotePrefix')}</strong> ${escapeHtml(t2.note)}</p>` : ''}${t2.executedAt ? `<small>${t('admin.valExecutedAtPrefix')} ${escapeHtml(t2.executedAt)} ${t('admin.valExecutedByPrefix')} ${escapeHtml(t2.executedByName || t('admin.valUserFallback'))}</small>` : ''}</div>
        <div class="validation-actions"><button class="btn secondary small-btn" data-val-id="${t2.id}" data-val-result="passed">${t('admin.valPassBtn')}</button><button class="btn secondary small-btn" data-val-id="${t2.id}" data-val-result="failed">${t('admin.valFailBtn')}</button><button class="btn secondary small-btn" data-val-id="${t2.id}" data-val-result="not_run">${t('admin.valResetBtn')}</button></div>
      </article>`).join('')}
    </div>`;
  root.querySelectorAll('[data-val-id]').forEach(btn => btn.addEventListener('click', () => updateValidationTest(Number(btn.dataset.valId), btn.dataset.valResult)));
}

async function loadSystemIncidents(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k,v]) => { if (v) params.set(k,v); });
  try { return await api('/incidents' + (params.toString() ? '?' + params.toString() : '')); }
  catch(e) { showToast(e.message || t('admin.incidentsLoadError')); return {incidents:[],summary:{}}; }
}
function incidentLabel(v){return ({availability:t('admin.incidentTypeAvailability'),application_error:t('admin.incidentTypeAppError'),data_error:t('admin.incidentTypeDataError'),calculation_error:t('admin.incidentTypeCalcError'),unauthorized_access:t('admin.incidentTypeUnauthorized'),transfer_error:t('admin.incidentTypeTransferError'),other:t('admin.incidentTypeOther')})[v]||v;}
function incidentSeverityLabel(v){return ({low:t('admin.severityLow'),medium:t('admin.severityMedium'),high:t('admin.severityHigh'),critical:t('admin.severityCritical')})[v]||v;}
function incidentStatusLabel(v){return ({open:t('admin.incidentStatusOpen'),investigating:t('admin.incidentStatusInvestigating'),resolved:t('admin.incidentStatusResolved'),closed:t('admin.incidentStatusClosed')})[v]||v;}

// Functie, nu obiect static - textele trebuie sa reflecte limba curent
// selectata de fiecare data cand panoul se randeaza, nu doar la incarcarea
// initiala a paginii (cand limba ar putea fi inca nesetata explicit).
function getHumanFlowScenarios() {
  return {
    owner: {
      title: t('admin.flowOwnerTitle'),
      goal: t('admin.flowOwnerGoal'),
      steps: [t('admin.flowOwnerStep1'), t('admin.flowOwnerStep2'), t('admin.flowOwnerStep3'), t('admin.flowOwnerStep4'), t('admin.flowOwnerStep5')],
      risk: t('admin.flowOwnerRisk')
    },
    operator: {
      title: t('admin.flowOperatorTitle'),
      goal: t('admin.flowOperatorGoal'),
      steps: [t('admin.flowOperatorStep1'), t('admin.flowOperatorStep2'), t('admin.flowOperatorStep3'), t('admin.flowOperatorStep4'), t('admin.flowOperatorStep5'), t('admin.flowOperatorStep6'), t('admin.flowOperatorStep7')],
      risk: t('admin.flowOperatorRisk')
    },
    admin: {
      title: t('admin.flowAdminTitle'),
      goal: t('admin.flowAdminGoal'),
      steps: [t('admin.flowAdminStep1'), t('admin.flowAdminStep2'), t('admin.flowAdminStep3'), t('admin.flowAdminStep4'), t('admin.flowAdminStep5'), t('admin.flowAdminStep6')],
      risk: t('admin.flowAdminRisk')
    }
  };
}

let humanFlow = { role: 'operator', step: 0, startedAt: 0, completed: false };

function renderHumanFlowPanel() {
  const root = document.getElementById('human-flow-panel');
  if (!root) return;
  const scenarios = getHumanFlowScenarios();
  const sc = scenarios[humanFlow.role] || scenarios.operator;
  const elapsed = humanFlow.startedAt ? Math.max(0, Math.round((performance.now() - humanFlow.startedAt) / 1000)) : 0;
  const progress = Math.round((humanFlow.step / sc.steps.length) * 100);
  const current = sc.steps[Math.min(humanFlow.step, sc.steps.length - 1)];
  const done = humanFlow.completed || humanFlow.step >= sc.steps.length;
  root.innerHTML = `
    <section class="quality-evidence human-flow-panel">
      <div class="quality-evidence-head">
        <div><div class="eyebrow">${t('admin.flowSimEyebrow')}</div><h3>${t('admin.flowSimTitle')}</h3>
        <p>${t('admin.flowSimIntro')}</p></div>
        <span class="quality-badge ${done ? 'covered' : 'partial'}">${done ? t('admin.flowDoneBadge') : t('admin.flowInProgressBadge')}</span>
      </div>
      <div class="flow-role-tabs">
        ${Object.entries(scenarios).map(([key,v]) => `<button class="flow-role ${humanFlow.role===key?'active':''}" data-flow-role="${key}">${escapeHtml(v.title)}</button>`).join('')}
      </div>
      <div class="human-flow-goal"><strong>${escapeHtml(sc.goal)}</strong><span>${elapsed}s · ${progress}%</span></div>
      <div class="flow-progress"><span style="width:${progress}%"></span></div>
      <div class="flow-steps">
        ${sc.steps.map((step,i)=>`<div class="flow-step ${i < humanFlow.step ? 'done' : i === humanFlow.step && !done ? 'current' : ''}"><span>${i+1}</span><div><strong>${escapeHtml(step)}</strong>${i===humanFlow.step&&!done?`<small>${t('admin.flowCurrentAction')}</small>`:''}</div></div>`).join('')}
      </div>
      <div class="human-flow-actions">
        <button class="btn secondary small-btn" id="flow-reset">${t('admin.flowRestartBtn')}</button>
        ${done ? `<span class="flow-complete">${t('admin.flowCompleteText')}</span>` : `<button class="btn small-btn" id="flow-next">${t('admin.flowFinishStepPrefix')} ${escapeHtml(current)}</button>`}
      </div>
      <div class="human-flow-risk"><strong>${t('admin.flowCheckpointPrefix')}</strong> ${escapeHtml(sc.risk)}</div>
    </section>`;
  root.querySelectorAll('[data-flow-role]').forEach(btn => btn.onclick = () => {
    humanFlow = { role: btn.dataset.flowRole, step: 0, startedAt: performance.now(), completed: false };
    renderHumanFlowPanel();
  });
  root.querySelector('#flow-reset')?.addEventListener('click', () => {
    humanFlow = { ...humanFlow, step: 0, startedAt: performance.now(), completed: false };
    renderHumanFlowPanel();
  });
  root.querySelector('#flow-next')?.addEventListener('click', () => {
    humanFlow.step += 1;
    if (humanFlow.step >= sc.steps.length) humanFlow.completed = true;
    renderHumanFlowPanel();
  });
}

async function renderIncidentPanel(){
 const slot=document.getElementById('system-incidents-panel'); if(!slot)return;
 const data=await loadSystemIncidents(); const incidents=data.incidents||[], sm=data.summary||{};
 slot.innerHTML=`<section class="incident-panel"><div class="quality-evidence-head"><div><div class="eyebrow">${t('admin.continuityEyebrow')}</div><h3>${t('admin.systemIncidentsTitle')}</h3><p>${t('admin.systemIncidentsIntro')}</p></div><button class="btn" id="btn-new-incident">${t('admin.newIncidentBtn')}</button></div><div class="incident-summary"><div><span>${t('admin.incidentActive')}</span><strong>${sm.active||0}</strong></div><div><span>${t('admin.incidentHighCritical')}</span><strong>${sm.highActive||0}</strong></div><div><span>${t('admin.incidentResolvedSummary')}</span><strong>${sm.resolved||0}</strong></div><div><span>${t('admin.incidentClosedSummary')}</span><strong>${sm.closed||0}</strong></div></div><div class="incident-filters"><select id="inc-status"><option value="">${t('admin.allStatuses')}</option><option value="open">${t('admin.incidentStatusOpenFilter')}</option><option value="investigating">${t('admin.incidentStatusInvestigatingFilter')}</option><option value="resolved">${t('admin.incidentStatusResolvedFilter')}</option><option value="closed">${t('admin.incidentStatusClosedFilter')}</option></select><select id="inc-severity"><option value="">${t('admin.allSeverities')}</option><option value="low">${t('admin.severityLow')}</option><option value="medium">${t('admin.severityMedium')}</option><option value="high">${t('admin.severityHigh')}</option><option value="critical">${t('admin.severityCritical')}</option></select><select id="inc-type"><option value="">${t('admin.allTypes')}</option>${['availability','application_error','data_error','calculation_error','unauthorized_access','transfer_error','other'].map(x=>`<option value="${x}">${incidentLabel(x)}</option>`).join('')}</select><button class="btn secondary small-btn" id="inc-refresh">${t('admin.reloadBtn')}</button></div><div class="incident-list">${incidents.length?incidents.map(i=>`<article class="incident-item ${i.severity} ${i.status}"><div class="incident-item-head"><div><strong>${escapeHtml(i.code)}</strong><span class="incident-type">${escapeHtml(incidentLabel(i.type))}</span></div><div><span class="quality-badge ${i.status==='closed'||i.status==='resolved'?'covered':'partial'}">${escapeHtml(incidentStatusLabel(i.status))}</span><span class="incident-severity">${escapeHtml(incidentSeverityLabel(i.severity))}</span></div></div><p>${escapeHtml(i.description)}</p><div class="incident-meta">${t('admin.reportedByPrefix')} ${escapeHtml(i.reportedByName||t('admin.valUserFallback'))} · ${escapeHtml(i.openedAt)}${i.sampleCode?` · ${t('admin.samplePrefix')} ${escapeHtml(i.sampleCode)}`:''}</div>${i.impact?`<p><strong>${t('admin.impactLabel')}</strong> ${escapeHtml(i.impact)}</p>`:''}${i.immediateAction?`<p><strong>${t('admin.immediateActionLabel')}</strong> ${escapeHtml(i.immediateAction)}</p>`:''}${i.resolution?`<p><strong>${t('admin.resolutionLabel')}</strong> ${escapeHtml(i.resolution)}</p>`:''}${i.verification?`<p><strong>${t('admin.verificationLabel')}</strong> ${escapeHtml(i.verification)}</p>`:''}${i.status!=='closed'?`<div class="incident-admin-actions"><select data-inc-status="${i.id}"><option value="open">${t('admin.incidentStatusOpen')}</option><option value="investigating">${t('admin.incidentStatusInvestigating')}</option><option value="resolved">${t('admin.incidentStatusResolved')}</option><option value="closed">${t('admin.incidentStatusClosed')}</option></select><input data-inc-resolution="${i.id}" placeholder="${t('admin.resolutionNotePlaceholder')}" value="${escapeHtml(i.resolution||'')}"/><input data-inc-verification="${i.id}" placeholder="${t('admin.verificationAfterPlaceholder')}" value="${escapeHtml(i.verification||'')}"/><button class="btn secondary small-btn" data-inc-save="${i.id}">${t('admin.updateBtn')}</button></div>`:''}</article>`).join(''):`<div class="empty-list">${t('admin.noIncidentsRecorded')}</div>`}</div></section>`;
 document.getElementById('btn-new-incident').onclick=openIncidentDialog;
 document.getElementById('inc-refresh').onclick=()=>renderIncidentPanel();
 slot.querySelectorAll('[data-inc-save]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.incSave,status=slot.querySelector(`[data-inc-status="${id}"]`).value,resolution=slot.querySelector(`[data-inc-resolution="${id}"]`).value,verification=slot.querySelector(`[data-inc-verification="${id}"]`).value;try{await api(`/incidents/${id}/update`,{method:'POST',body:JSON.stringify({status,resolution,verification})});showToast(t('admin.incidentUpdatedToast'));renderIncidentPanel();}catch(e){showToast(e.message);}});
}
function openIncidentDialog(){const old=document.getElementById('incident-dialog');old?.remove();const wrap=document.createElement('div');wrap.id='incident-dialog';wrap.className='modal-backdrop';wrap.innerHTML=`<div class="modal-card" role="dialog" aria-modal="true"><div class="modal-head"><div><span class="eyebrow">${t('admin.continuityDialogEyebrow')}</span><h2>${t('admin.reportIncidentTitle')}</h2></div><button class="icon-button" id="inc-cancel">×</button></div><div class="field-grid"><div class="field"><label for="inc-new-type">${t('admin.typeLabel')}</label><select id="inc-new-type">${['availability','application_error','data_error','calculation_error','unauthorized_access','transfer_error','other'].map(x=>`<option value="${x}">${incidentLabel(x)}</option>`).join('')}</select></div><div class="field"><label for="inc-new-severity">${t('admin.severityLabel')}</label><select id="inc-new-severity"><option value="low">${t('admin.severityLow')}</option><option value="medium" selected>${t('admin.severityMedium')}</option><option value="high">${t('admin.severityHigh')}</option><option value="critical">${t('admin.severityCritical')}</option></select></div><div class="field"><label for="inc-new-sample">${t('admin.affectedSampleLabel')}</label><input id="inc-new-sample" type="number" min="1" placeholder="${t('admin.sampleIdPlaceholder')}"></div><div class="field"><label for="inc-new-desc">${t('admin.descriptionLabel')}</label><textarea id="inc-new-desc" placeholder="${t('admin.whatHappenedPlaceholder')}"></textarea></div><div class="field"><label for="inc-new-impact">${t('admin.impactFieldLabel')}</label><textarea id="inc-new-impact" placeholder="${t('admin.impactPlaceholder')}"></textarea></div><div class="field"><label for="inc-new-action">${t('admin.immediateActionFieldLabel')}</label><textarea id="inc-new-action" placeholder="${t('admin.immediateActionIncidentPlaceholder')}"></textarea></div></div><div class="modal-actions"><button class="btn secondary" id="inc-cancel-2">${t('admin.cancelBtn')}</button><button class="btn" id="inc-save-new">${t('admin.registerBtnGeneric')}</button></div></div>`;document.body.appendChild(wrap);const close=()=>wrap.remove();document.getElementById('inc-cancel').onclick=close;document.getElementById('inc-cancel-2').onclick=close;document.getElementById('inc-save-new').onclick=async()=>{const description=document.getElementById('inc-new-desc').value.trim();if(!description){showToast(t('admin.descriptionRequired'));return;}const sid=document.getElementById('inc-new-sample').value;try{await api('/incidents',{method:'POST',body:JSON.stringify({type:document.getElementById('inc-new-type').value,severity:document.getElementById('inc-new-severity').value,affectedSampleId:sid||null,description,impact:document.getElementById('inc-new-impact').value,immediateAction:document.getElementById('inc-new-action').value})});close();showToast(t('admin.incidentRegisteredToast'));renderIncidentPanel();}catch(e){showToast(e.message);}};}

function renderQualityView() {
  const root = document.getElementById('admin-view-root');
  if (!root) return;
  const items = [
    [t('admin.qItem1Name'), 'partial', t('admin.qItem1Desc')],
    [t('admin.qItem2Name'), 'partial', t('admin.qItem2Desc')],
    [t('admin.qItem3Name'), 'outside', t('admin.qItem3Desc')],
    [t('admin.qItem4Name'), 'outside', t('admin.qItem4Desc')],
    [t('admin.qItem5Name'), 'outside', t('admin.qItem5Desc')],
    [t('admin.qItem6Name'), 'partial', t('admin.qItem6Desc')],
    [t('admin.qItem7Name'), 'covered', t('admin.qItem7Desc')],
    [t('admin.qItem8Name'), 'partial', t('admin.qItem8Desc')],
    [t('admin.qItem9Name'), 'partial', t('admin.qItem9Desc')],
    [t('admin.qItem10Name'), 'outside', t('admin.qItem10Desc')],
    [t('admin.qItem11Name'), 'partial', t('admin.qItem11Desc')],
    [t('admin.qItem12Name'), 'outside', t('admin.qItem12Desc')],
  ];
  const labels = {covered: t('admin.qCovered'), partial: t('admin.qPartial'), outside: t('admin.qOutside')};
  const mapRows = ['qMap1','qMap2','qMap3','qMap4','qMap5','qMap6','qMap7','qMap8','qMap9','qMap10','qMap11','qMap12','qMap13','qMap14','qMap15'].map(k => t(`admin.${k}`).split('|'));
  const isoRows = ['qIso1','qIso2','qIso3','qIso4','qIso5','qIso6'].map(k => t(`admin.${k}`).split('|'));
  const isoStateClass = (s) => s === t('admin.qYes') ? 'yes' : s === t('admin.qPartialShort') ? 'partial' : 'no';
  root.innerHTML = `
    <div class="quality-panel view-transition">
      <div class="admin-section-head"><div><div class="eyebrow">${t('admin.qLabEyebrow')}</div><h2>${t('admin.qReadinessTitle')}</h2><p>${t('admin.qReadinessIntro')}</p></div></div>
      <div class="quality-notice"><strong>${t('admin.qNoticeStrong')}</strong><span>${t('admin.qNoticeText')}</span></div>
      <div class="quality-summary">
        <div><span>${t('admin.qSummaryCovered')}</span><strong>${items.filter(x=>x[1]==='covered').length}</strong></div>
        <div><span>${t('admin.qSummaryPartial')}</span><strong>${items.filter(x=>x[1]==='partial').length}</strong></div>
        <div><span>${t('admin.qSummaryOutside')}</span><strong>${items.filter(x=>x[1]==='outside').length}</strong></div>
      </div>
      <section class="sample-reset-panel" id="sample-reset-panel">
        <div class="quality-evidence-head"><div><div class="eyebrow">${t('admin.resetEyebrow')}</div><h3>${t('admin.resetTitle')}</h3><p>${t('admin.resetIntro')}</p></div></div>
        <div class="incident-filters">
          <input id="reset-search-input" placeholder="${t('admin.resetSearchPlaceholder')}" style="flex:1;">
          <button class="btn secondary small-btn" id="reset-search-btn">${t('admin.resetSearchBtn')}</button>
        </div>
        <div id="reset-results-list"></div>
      </section>
      <section id="intake-time-panel"><div class="loading-state">${t('admin.loadingIntakeStats')}</div></section>
      <div class="quality-list">
        ${items.map(([name,state,desc])=>`<article class="quality-item ${state}"><div class="quality-item-head"><h3>${escapeHtml(name)}</h3><span class="quality-badge ${state}">${labels[state]}</span></div><p>${escapeHtml(desc)}</p></article>`).join('')}
      </div>
      <section class="quality-evidence product-mapping">
        <div class="quality-evidence-head"><div><div class="eyebrow">${t('admin.qMappingEyebrow')}</div><h3>${t('admin.qMappingTitle')}</h3><p>${t('admin.qMappingIntro')}</p></div></div>
        <div class="quality-evidence-table">
          <div class="q-row q-head"><span>${t('admin.qColRequirement')}</span><span>${t('admin.qColFunction')}</span><span>${t('admin.qColEvidence')}</span></div>
          ${mapRows.map(r=>`<div class="q-row"><span>${escapeHtml(r[0])}</span><span>${escapeHtml(r[1])}</span><span>${escapeHtml(r[2])}</span></div>`).join('')}
        </div>
      </section>
      <section class="quality-evidence">
        <div class="quality-evidence-head"><div><div class="eyebrow">${t('admin.qTraceEyebrow')}</div><h3>${t('admin.qTraceTitle')}</h3><p>${t('admin.qTraceIntro')}</p></div></div>
        <div class="quality-evidence-table">
          <div class="q-row q-head"><span>${t('admin.qColIso')}</span><span>${t('admin.qColInPoc')}</span><span>${t('admin.qColEvidence')}</span></div>
          ${isoRows.map(r=>`<div class="q-row"><span class="mono">${escapeHtml(r[0])}</span><span><b class="q-state q-${isoStateClass(r[1])}">${escapeHtml(r[1])}</b></span><span>${escapeHtml(r[2])}</span></div>`).join('')}
        </div>
      </section>
      <div class="quality-scope"><strong>${t('admin.qScopeLimitStrong')}</strong> ${t('admin.qScopeLimitText')}</div>
      <section id="human-flow-panel"><div class="loading-state">${t('admin.preparingFlowSim')}</div></section>
      <section id="system-incidents-panel"><div class="loading-state">${t('admin.loadingIncidents')}</div></section>
      <section class="validation-panel" id="validation-panel"><div class="loading-state">${t('admin.loadingValidationTests')}</div></section>
    </div>`;
  attachResetPanel();
  loadIntakeTimeStats();
}

function sampleStatusBadgeLabel(qcStatus, reviewStatus, validationStatus) {
  if (validationStatus === 'validated') return t('admin.resetStateValidated');
  if (reviewStatus === 'rejected') return t('admin.resetStateRejected');
  if (reviewStatus === 'approved') return t('admin.resetStateApproved');
  if (qcStatus === 'accepted' || qcStatus === 'not_required') return t('admin.resetStateSubmitted');
  return t('admin.resetStateInProgress');
}

// Indicator "timp pana la receptie" - recomandarea 2 din auditul logic.
// Pur informativ: nu blocheaza nimic, doar arata daca probele stau prea
// mult intre inregistrare si decizia efectiva de la poarta de intrare.
async function loadIntakeTimeStats() {
  const el = document.getElementById('intake-time-panel');
  if (!el) return;
  try {
    const data = await api('/results/stats/intake-time');
    const fmtHours = (h) => {
      if (h === null || h === undefined) return '—';
      if (h < 1) return `${Math.round(h * 60)} ${t('admin.intakeTimeMinutes')}`;
      if (h < 48) return `${Math.round(h * 10) / 10} ${t('admin.intakeTimeHours')}`;
      return `${Math.round(h / 24 * 10) / 10} ${t('admin.intakeTimeDays')}`;
    };
    el.innerHTML = `
      <div class="quality-evidence-head"><div><div class="eyebrow">${t('admin.intakeTimeEyebrow')}</div><h3>${t('admin.intakeTimeTitle')}</h3><p>${t('admin.intakeTimeIntro')}</p></div></div>
      <div class="quality-summary">
        <div><span>${t('admin.intakeTimeAvg')}</span><strong>${fmtHours(data.avgHours)}</strong></div>
        <div><span>${t('admin.intakeTimeMax')}</span><strong>${fmtHours(data.maxHours)}</strong></div>
        <div><span>${t('admin.intakeTimePending')}</span><strong>${data.pendingCount}</strong></div>
      </div>
      ${data.receivedCount === 0 ? `<p class="section-hint">${t('admin.intakeTimeNoData')}</p>` : ''}
    `;
  } catch (err) {
    el.innerHTML = `<div class="empty-list">${escapeHtml(err.message)}</div>`;
  }
}

function attachResetPanel() {
  const btn = document.getElementById('reset-search-btn');
  const input = document.getElementById('reset-search-input');
  if (!btn || !input) return;
  const runSearch = async () => {
    const term = input.value.trim();
    const list = document.getElementById('reset-results-list');
    if (!term) { list.innerHTML = ''; return; }
    list.innerHTML = `<div class="loading-state">${t('common.loading')}</div>`;
    try {
      const data = await api(`/results/archive?search=${encodeURIComponent(term)}`);
      const rows = (data.samples || []).slice(0, 8);
      if (!rows.length) { list.innerHTML = `<div class="empty-list">${t('admin.resetNoMatch')}</div>`; return; }
      list.innerHTML = rows.map(r => `
        <div class="reset-result-row" data-reset-id="${r.id}">
          <div><strong>${escapeHtml(r.code)}</strong> · ${escapeHtml(r.productName || '')}<div class="incident-meta">${escapeHtml(sampleStatusBadgeLabel(r.qcStatus, r.reviewStatus, r.validationStatus))}</div></div>
          ${r.validationStatus === 'validated' ? `<span class="section-hint">${t('admin.resetAlreadyValidated')}</span>` : `<button class="btn danger-outline small-btn" data-reset-open="${r.id}" data-reset-code="${escapeAttr(r.code)}">${t('admin.resetActionBtn')}</button>`}
        </div>`).join('');
      list.querySelectorAll('[data-reset-open]').forEach(b => b.addEventListener('click', () => openResetDialog(b.dataset.resetOpen, b.dataset.resetCode)));
    } catch (e) {
      list.innerHTML = `<div class="empty-list">${escapeHtml(e.message)}</div>`;
    }
  };
  btn.onclick = runSearch;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
}

async function openCompanyDialog() {
  let current = {};
  try {
    current = await api('/auth/company');
  } catch (e) {
    showToast(e.message);
    return;
  }
  const old = document.getElementById('company-dialog');
  old?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'company-dialog';
  wrap.className = 'modal-backdrop';
  const type = current.companyType || 'firma';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="eyebrow">${t('owner.companyEyebrow')}</span><h2>${t('owner.companyDialogTitle')}</h2></div><button class="icon-button" id="company-cancel">×</button></div>
      <p class="section-hint">${t('owner.companyDialogIntro')}</p>
      <div class="field">
        <label for="company-type">${t('owner.companyTypeLabel')}</label>
        <select id="company-type">
          <option value="firma" ${type === 'firma' ? 'selected' : ''}>${t('owner.companyTypeFirma')}</option>
          <option value="pfa" ${type === 'pfa' ? 'selected' : ''}>${t('owner.companyTypePfa')}</option>
          <option value="persoana_fizica" ${type === 'persoana_fizica' ? 'selected' : ''}>${t('owner.companyTypePersoanaFizica')}</option>
        </select>
      </div>
      <div class="field"><label id="company-name-label" for="company-name">${t('owner.companyNameLabel')}</label><input type="text" id="company-name" value="${escapeAttr(current.companyName || '')}" placeholder="${t('owner.companyNamePlaceholder')}"></div>
      <div class="field" id="company-reg-no-field"><label id="company-reg-no-label" for="company-reg-no">${t('owner.companyRegNoLabel')}</label><input type="text" id="company-reg-no" value="${escapeAttr(current.companyRegNo || '')}" placeholder="${t('owner.companyRegNoPlaceholder')}"></div>
      <div class="field"><label id="company-address-label" for="company-address">${t('owner.companyAddressLabel')}</label><input type="text" id="company-address" value="${escapeAttr(current.companyAddress || '')}" placeholder="${t('owner.companyAddressPlaceholder')}"></div>
      <div class="field"><label for="company-contact">${t('owner.companyContactLabel')}</label><input type="text" id="company-contact" value="${escapeAttr(current.companyContact || '')}" placeholder="${t('owner.companyContactPlaceholder')}"></div>
      <div class="modal-actions"><button class="btn secondary" id="company-cancel-2">${t('admin.cancelBtn')}</button><button class="btn primary-action" id="company-save">${t('owner.companySaveBtn')}</button></div>
    </div>`;
  document.body.appendChild(wrap);

  // Etichetele si campul de cod fiscal se adapteaza dupa tipul ales - o
  // persoana fizica, spre deosebire de firma/PFA, nu are un cod fiscal/CUI
  // de introdus, deci campul se ascunde in loc sa ramana gol si confuz.
  const applyTypeLabels = () => {
    const t2 = document.getElementById('company-type').value;
    const nameLabel = document.getElementById('company-name-label');
    const regField = document.getElementById('company-reg-no-field');
    const addrLabel = document.getElementById('company-address-label');
    if (t2 === 'persoana_fizica') {
      nameLabel.textContent = t('owner.companyNameLabelPerson');
      regField.style.display = 'none';
      addrLabel.textContent = t('owner.companyAddressLabelPerson');
    } else {
      nameLabel.textContent = t2 === 'pfa' ? t('owner.companyNameLabelPfa') : t('owner.companyNameLabel');
      regField.style.display = '';
      addrLabel.textContent = t('owner.companyAddressLabel');
    }
  };
  applyTypeLabels();
  document.getElementById('company-type').addEventListener('change', applyTypeLabels);

  const close = () => wrap.remove();
  document.getElementById('company-cancel').onclick = close;
  document.getElementById('company-cancel-2').onclick = close;
  document.getElementById('company-save').onclick = async () => {
    const payload = {
      companyType: document.getElementById('company-type').value,
      companyName: document.getElementById('company-name').value.trim(),
      companyRegNo: document.getElementById('company-reg-no').value.trim(),
      companyAddress: document.getElementById('company-address').value.trim(),
      companyContact: document.getElementById('company-contact').value.trim(),
    };
    try {
      await api('/auth/company', { method: 'PUT', body: JSON.stringify(payload) });
      close();
      showToast(t('owner.companySavedToast'));
      if (typeof renderOwnerApp === 'function' && currentUser?.role === 'owner') renderOwnerApp();
    } catch (e) {
      showToast(e.message);
    }
  };
}

function openResetDialog(sampleId, code) {
  const old = document.getElementById('reset-dialog');
  old?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'reset-dialog';
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true">
      <div class="modal-head"><div><span class="eyebrow">${t('admin.resetEyebrow')}</span><h2>${t('admin.resetDialogTitle')} ${escapeHtml(code)}</h2></div><button class="icon-button" id="reset-cancel">×</button></div>
      <p class="section-hint">${t('admin.resetDialogWarning')}</p>
      <div class="field"><label for="reset-reason">${t('admin.resetReasonLabel')}</label><textarea id="reset-reason" placeholder="${t('admin.resetReasonPlaceholder')}"></textarea></div>
      <div class="modal-actions"><button class="btn secondary" id="reset-cancel-2">${t('admin.cancelBtn')}</button><button class="btn danger-outline" id="reset-confirm">${t('admin.resetConfirmBtn')}</button></div>
    </div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  document.getElementById('reset-cancel').onclick = close;
  document.getElementById('reset-cancel-2').onclick = close;
  document.getElementById('reset-confirm').onclick = async () => {
    const reason = document.getElementById('reset-reason').value.trim();
    if (!reason) { showToast(t('admin.resetReasonRequired')); return; }
    try {
      await api(`/results/${sampleId}/reset`, { method: 'POST', body: JSON.stringify({ reason }) });
      close();
      showToast(t('admin.resetDoneToast'));
      attachResetPanel();
      document.getElementById('reset-search-btn')?.click();
    } catch (e) {
      showToast(e.message);
    }
  };
}

// ================= ADMIN APP =================
async function renderAdminApp() {
  const tabs = [
    { key: 'dashboard', label: t('operator.tabDashboard'), active: adminView === 'dashboard' },
    { key: 'operators', label: t('admin.tabOperators'), active: adminView === 'operators' },
    { key: 'quality', label: t('admin.tabQuality'), active: adminView === 'quality' },
    { key: 'branding', label: t('admin.tabBranding'), active: adminView === 'branding' }
  ];
  app.innerHTML = `
    ${renderHeader(t('admin.portalSubtitle'), t('common.admin'), 'admin', tabs)}
    <div class="page-shell admin-shell">${renderRoleGuide('admin')}<div class="detail" id="admin-view-root"></div></div>
  `;
  attachLogout();
  document.querySelectorAll('.header-tab').forEach(tab => tab.addEventListener('click', async () => {
    adminView = tab.dataset.tab;
    document.querySelectorAll('.header-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === adminView));
    await renderAdminViewRoot();
  }));
  await renderAdminViewRoot();
}

async function renderAdminViewRoot() {
  const root = document.getElementById('admin-view-root');
  if (!root) return;
  if (adminView === 'dashboard') {
    await renderDashboardView();
    return;
  }
  if (adminView === 'quality') {
    renderQualityView();
    await renderValidationPanel();
    await renderIncidentPanel();
    return;
  }
  if (adminView === 'branding') {
    await renderBrandingView();
    return;
  }
  root.innerHTML = `
    <div class="admin-panel view-transition">
      <div class="admin-section-head"><div><div class="eyebrow">${t('admin.accessRolesEyebrow')}</div><h2>${t('admin.operatorsValidatorsTitle')}</h2><p>${t('admin.operatorsValidatorsIntro')}</p></div></div>
      <div class="admin-control-strip"><div><span class="eyebrow">${t('admin.controlStripEyebrow')}</span><strong>${t('admin.controlStripTitle')}</strong></div><span>${t('admin.controlStripText')}</span></div>
      <div class="admin-grid">
        <div class="new-sample-form">
          <h3>${t('admin.newOperatorTitle')}</h3>
          <p class="section-hint">${t('admin.newOperatorHint')}</p>
          <div id="admin-error"></div>
          <form id="admin-form">
            <div class="field"><label for="op-fullName">${t('admin.fullNameLabel')}</label><input type="text" id="op-fullName" required autocomplete="name"></div>
            <div class="field"><label for="op-email">${t('admin.emailLabel')}</label><input type="email" id="op-email" required autocomplete="username"></div>
            <div class="field"><label for="op-password">${t('admin.tempPasswordLabel')}</label><input type="password" id="op-password" required minlength="8" autocomplete="new-password"></div>
            <button type="submit" class="btn">${t('admin.createOperatorBtn')}</button>
          </form>
        </div>
        <div class="admin-list-card"><div class="dashboard-card-head"><h3>${t('admin.activeOperatorsTitle')}</h3><span id="operator-count">${adminOperators.length}</span></div><div class="admin-list" id="operator-list"></div></div>
        <div class="new-sample-form validator-form">
          <h3>${t('admin.newValidatorTitle')}</h3>
          <p class="section-hint">${t('admin.newValidatorHint')}</p>
          <div id="validator-error"></div>
          <form id="validator-form">
            <div class="field"><label for="val-fullName">${t('admin.fullNameLabel')}</label><input type="text" id="val-fullName" required autocomplete="name"></div>
            <div class="field"><label for="val-email">${t('admin.emailLabel')}</label><input type="email" id="val-email" required autocomplete="username"></div>
            <div class="field"><label for="val-password">${t('admin.tempPasswordLabel')}</label><input type="password" id="val-password" required minlength="8" autocomplete="new-password"></div>
            <button type="submit" class="btn">${t('admin.createValidatorBtn')}</button>
          </form>
        </div>
        <div class="admin-list-card"><div class="dashboard-card-head"><h3>${t('admin.activeValidatorsTitle')}</h3><span id="validator-count">${adminValidators.length}</span></div><div class="admin-list" id="validator-list"></div></div>
      </div>
    </div>
  `;
  document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('admin-error');
    errorEl.innerHTML = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    try {
      await api('/admin/operators', { method: 'POST', body: JSON.stringify({
        fullName: document.getElementById('op-fullName').value.trim(),
        email: document.getElementById('op-email').value.trim(),
        password: document.getElementById('op-password').value,
      }) });
      document.getElementById('admin-form').reset();
      showToast(t('admin.operatorCreatedToast'));
      await loadOperators();
      if (submitBtn) {
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.classList.add('secondary');
        submitBtn.textContent = `✓ ${t('admin.createdBadge')}`;
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.classList.remove('secondary');
          submitBtn.textContent = originalText;
        }, 1600);
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
    }
  });
  document.getElementById('validator-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('validator-error');
    errorEl.innerHTML = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    try {
      await api('/admin/validators', { method: 'POST', body: JSON.stringify({
        fullName: document.getElementById('val-fullName').value.trim(),
        email: document.getElementById('val-email').value.trim(),
        password: document.getElementById('val-password').value,
      }) });
      document.getElementById('validator-form').reset();
      showToast(t('admin.validatorCreatedToast'));
      await loadValidators();
      if (submitBtn) {
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.classList.add('secondary');
        submitBtn.textContent = `✓ ${t('admin.createdBadge')}`;
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.classList.remove('secondary');
          submitBtn.textContent = originalText;
        }, 1600);
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
    }
  });
  await loadOperators();
  await loadValidators();
}
async function loadOperators() {
  try {
    const { operators } = await api('/admin/operators');
    adminOperators = operators;
  } catch (e) {
    showToast(t('admin.operatorsLoadError'));
  }
  const countEl = document.getElementById('operator-count');
  if (countEl) countEl.textContent = adminOperators.length;
  const listEl = document.getElementById('operator-list');
  if (adminOperators.length === 0) {
    listEl.innerHTML = `<div class="empty-list">${t('admin.noOperatorsYet')}</div>`;
    return;
  }
  listEl.innerHTML = adminOperators.map(o => `
    <div class="admin-list-row">
      <span>${escapeHtml(o.fullName)}</span>
      <span class="email">${escapeHtml(o.email)}</span>
    </div>
  `).join('');
}

async function loadValidators() {
  try {
    const { validators } = await api('/admin/validators');
    adminValidators = validators;
  } catch (e) {
    showToast(t('admin.validatorsLoadError'));
  }
  const countEl = document.getElementById('validator-count');
  if (countEl) countEl.textContent = adminValidators.length;
  const listEl = document.getElementById('validator-list');
  if (!listEl) return;
  if (adminValidators.length === 0) {
    listEl.innerHTML = `<div class="empty-list">${t('admin.noValidatorsYet')}</div>`;
    return;
  }
  listEl.innerHTML = adminValidators.map(v => `
    <div class="admin-list-row">
      <span>${escapeHtml(v.fullName)}</span>
      <span class="email">${escapeHtml(v.email)}</span>
    </div>
  `).join('');
}

window.addEventListener('beforeunload', (event) => {
  if (!activeFormDirty) return;
  event.preventDefault();
  event.returnValue = '';
});

// ================= ADMIN: PERSONALIZARE BULETIN =================
let brandingSettings = {};

async function renderBrandingView() {
  const root = document.getElementById('admin-view-root');
  if (!root) return;

  try {
    const { settings } = await api('/admin/lab-settings');
    brandingSettings = settings || {};
  } catch (e) {
    showToast(t('admin.brandingLoadError'));
    brandingSettings = {};
  }

  const s = brandingSettings;
  root.innerHTML = `
    <div class="admin-panel view-transition">
      <div class="admin-section-head"><div><div class="eyebrow">${t('admin.visualIdentityEyebrow')}</div><h2>${t('admin.bulletinCustomizationTitle')}</h2><p>${t('admin.bulletinCustomizationIntro')}</p></div></div>
      <div class="admin-grid">
        <div class="new-sample-form">
          <h3>${t('admin.institutionalHeaderTitle')}</h3>
          <div id="branding-error"></div>
          <form id="branding-form">
            <div class="field">
              <label for="br-institutionName">${t('admin.institutionNameLabel')}</label>
              <input type="text" id="br-institutionName" value="${escapeAttr(s.institutionName || '')}" placeholder="${t('admin.institutionNamePlaceholder')}">
            </div>
            <div class="field">
              <label for="br-institutionAddress">${t('admin.institutionAddressLabel')}</label>
              <input type="text" id="br-institutionAddress" value="${escapeAttr(s.institutionAddress || '')}" placeholder="${t('admin.institutionAddressPlaceholder')}">
            </div>
            <div class="field">
              <label for="br-institutionEmail">${t('admin.institutionEmailLabel')}</label>
              <input type="email" id="br-institutionEmail" value="${escapeAttr(s.institutionEmail || '')}" placeholder="${t('admin.institutionEmailPlaceholder')}">
            </div>
            <div class="field">
              <label for="br-institutionPhone">${t('admin.institutionPhoneLabel')}</label>
              <input type="tel" id="br-institutionPhone" value="${escapeAttr(s.institutionPhone || '')}" placeholder="${t('admin.institutionPhonePlaceholder')}">
              <div class="section-hint">${t('admin.institutionPhoneHint')}</div>
            </div>

            <div class="field">
              <label for="br-logo">${t('admin.logoLabel')}</label>
              <input type="file" id="br-logo" accept="image/png,image/jpeg">
              <div class="branding-preview" id="preview-logo">${s.logoDataUrl ? `<img src="${s.logoDataUrl}" alt="Logo">` : `<span class="empty-hint">${t('admin.noLogoUploaded')}</span>`}</div>
            </div>

            <div class="field">
              <label for="br-signatureName">${t('admin.signatureNameLabel')}</label>
              <input type="text" id="br-signatureName" value="${escapeAttr(s.signatureName || '')}" placeholder="${t('admin.signatureNamePlaceholder')}">
            </div>
            <div class="field">
              <label for="br-signatureRole">${t('admin.signatureRoleLabel')}</label>
              <input type="text" id="br-signatureRole" value="${escapeAttr(s.signatureRole || '')}" placeholder="${t('admin.signatureRolePlaceholder')}">
            </div>
            <div class="field">
              <label for="br-signature">${t('admin.signatureImageLabel')}</label>
              <input type="file" id="br-signature" accept="image/png,image/jpeg">
              <div class="branding-preview" id="preview-signature">${s.signatureDataUrl ? `<img src="${s.signatureDataUrl}" alt="Signature">` : `<span class="empty-hint">${t('admin.noSignatureUploaded')}</span>`}</div>
            </div>

            <div class="field">
              <label for="br-stamp">${t('admin.stampLabel')}</label>
              <input type="file" id="br-stamp" accept="image/png,image/jpeg">
              <div class="branding-preview" id="preview-stamp">${s.stampDataUrl ? `<img src="${s.stampDataUrl}" alt="Stamp">` : `<span class="empty-hint">${t('admin.noStampUploaded')}</span>`}</div>
            </div>

            <button type="submit" class="btn">${t('admin.saveCustomizationBtn')}</button>
          </form>
          <p class="section-hint" style="margin-top:10px;">${t('admin.legalValueNote')}</p>
        </div>
        <div class="admin-list-card">
          <div class="dashboard-card-head"><h3>${t('admin.headerPreviewTitle')}</h3></div>
          <div class="bulletin-preview-box" id="bulletin-preview-box"></div>
        </div>
      </div>
    </div>
  `;

  renderBulletinHeaderPreview();

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const wireImageInput = (inputId, previewId, stateKey) => {
    document.getElementById(inputId).addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 700 * 1024) {
        showToast(t('admin.imageTooLarge'));
        e.target.value = '';
        return;
      }
      const dataUrl = await readAsDataUrl(file);
      brandingSettings[stateKey] = dataUrl;
      document.getElementById(previewId).innerHTML = `<img src="${dataUrl}" alt="${t('admin.previewAlt')}">`;
      renderBulletinHeaderPreview();
    });
  };
  wireImageInput('br-logo', 'preview-logo', 'logoDataUrl');
  wireImageInput('br-signature', 'preview-signature', 'signatureDataUrl');
  wireImageInput('br-stamp', 'preview-stamp', 'stampDataUrl');

  ['br-institutionName', 'br-institutionAddress', 'br-institutionEmail', 'br-signatureName', 'br-signatureRole'].forEach(id => {
    document.getElementById(id).addEventListener('input', renderBulletinHeaderPreview);
  });

  document.getElementById('branding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('branding-error');
    errorEl.innerHTML = '';
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const payload = {
      institutionName: document.getElementById('br-institutionName').value,
      institutionAddress: document.getElementById('br-institutionAddress').value,
      institutionEmail: document.getElementById('br-institutionEmail').value,
      institutionPhone: document.getElementById('br-institutionPhone').value,
      signatureName: document.getElementById('br-signatureName').value,
      signatureRole: document.getElementById('br-signatureRole').value,
      logoDataUrl: brandingSettings.logoDataUrl || null,
      signatureDataUrl: brandingSettings.signatureDataUrl || null,
      stampDataUrl: brandingSettings.stampDataUrl || null,
    };
    try {
      await api('/admin/lab-settings', { method: 'PUT', body: JSON.stringify(payload) });
      showToast(t('admin.customizationSavedToast'));
      if (submitBtn) {
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.classList.add('secondary');
        submitBtn.textContent = `✓ ${t('admin.savedBadge')}`;
        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.classList.remove('secondary');
          submitBtn.textContent = originalText;
        }, 1600);
      }
    } catch (err) {
      errorEl.innerHTML = `<div class="auth-error">${escapeHtml(err.message)}</div>`;
    }
  });
}

function renderBulletinHeaderPreview() {
  const box = document.getElementById('bulletin-preview-box');
  if (!box) return;
  const name = document.getElementById('br-institutionName')?.value || brandingSettings.institutionName || 'USAMV București · Facultatea de Biotehnologii';
  const address = document.getElementById('br-institutionAddress')?.value || brandingSettings.institutionAddress || '';
  const email = document.getElementById('br-institutionEmail')?.value || brandingSettings.institutionEmail || '';
  const sigName = document.getElementById('br-signatureName')?.value || brandingSettings.signatureName || '';
  const sigRole = document.getElementById('br-signatureRole')?.value || brandingSettings.signatureRole || '';
  box.innerHTML = `
    <div class="bulletin-head-preview">
      ${brandingSettings.logoDataUrl ? `<img class="preview-logo-img" src="${brandingSettings.logoDataUrl}" alt="Logo">` : ''}
      <div>
        <strong>${bt('bulletin.title')} — MYC-2026-XXXX</strong>
        <div class="institution">${escapeHtml(name)}</div>
        ${address ? `<div class="institution">${escapeHtml(address)}</div>` : ''}
        ${email ? `<div class="institution">${escapeHtml(email)}</div>` : ''}
      </div>
    </div>
    <div class="preview-signature-block">
      ${brandingSettings.signatureDataUrl ? `<img class="preview-sig-img" src="${brandingSettings.signatureDataUrl}" alt="${t('admin.signatureAlt')}">` : ''}
      ${brandingSettings.stampDataUrl ? `<img class="preview-stamp-img" src="${brandingSettings.stampDataUrl}" alt="${t('admin.stampAlt')}">` : ''}
      ${sigName ? `<div class="preview-sig-name">${escapeHtml(sigName)}${sigRole ? ` · ${escapeHtml(sigRole)}` : ''}</div>` : ''}
    </div>
  `;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

boot();
