const express = require('express');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { DEFAULT_LIMITS, LIMIT_REGULATION_REF, evaluateResult, evaluateArchiveRow, getRuleProfile, availableGroupsForProfile, TEST_GROUP_KEYS } = require('../db/evaluation');
const { detectIncreasingTrend } = require('../db/trend-analysis');

const HAZARD_LEVELS = new Set(['low', 'medium', 'high']);
const CCP_RELEVANCE = new Set(['not_assessed', 'prp', 'ccp_candidate']);

function normalizeHaccp(body = {}) {
  const likelihood = body.haccpLikelihood === '' || body.haccpLikelihood == null ? null : Number(body.haccpLikelihood);
  const severity = body.haccpSeverity === '' || body.haccpSeverity == null ? null : Number(body.haccpSeverity);
  const riskScore = Number.isInteger(likelihood) && Number.isInteger(severity) ? likelihood * severity : null;
  return {
    intendedUse: body.haccpIntendedUse || null,
    hazard: body.haccpHazard || null,
    likelihood: Number.isInteger(likelihood) && likelihood >= 1 && likelihood <= 5 ? likelihood : null,
    severity: Number.isInteger(severity) && severity >= 1 && severity <= 5 ? severity : null,
    riskScore: riskScore !== null && riskScore >= 1 && riskScore <= 25 ? riskScore : null,
    controlMeasure: body.haccpControlMeasure || null,
    ccpRelevance: CCP_RELEVANCE.has(body.haccpCcpRelevance) ? body.haccpCcpRelevance : 'not_assessed',
    correctiveAction: body.haccpCorrectiveAction || null
  };
}

const router = express.Router();

function genCode() {
  const year = new Date().getFullYear();
  const row = db.prepare(`
    SELECT code FROM samples WHERE code LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`MYC-${year}-%`);
  let next = 1;
  if (row) {
    const match = row.code.match(/MYC-\d{4}-(\d+)/);
    if (match) next = parseInt(match[1], 10) + 1;
  }
  return `MYC-${year}-${String(next).padStart(4, '0')}`;
}

// Proprietarul creeaza o proba noua (inregistrare initiala).
router.post('/', requireRole('owner'), (req, res) => {
  const { productName, category, sampleDate, sampledBy, requestedDueDate, samplingAttested } = req.body;
  const h = normalizeHaccp(req.body);

  if (!productName) {
    return res.status(400).json({ error: 'Denumirea probei este obligatorie.' });
  }

  // Data prelevarii e o data de identificare esentiala, nu opționala -
  // determina daca proba mai e reprezentativa la momentul analizei (Reg.
  // (UE) 2023/2782, distributie eterogena in timp) si e parte din
  // trasabilitatea ceruta de ISO/IEC 17025 §7.4.1. Verificarea din
  // interfata (atribut HTML "required") e doar UX; regula reala e aici,
  // server-side, ca sa nu poata fi ocolita printr-o cerere directa.
  // Comparam datele ca siruri "AAAA-LL-ZZ" (nu obiecte Date), ca sa evitam
  // exact capcana clasica JS: new Date('AAAA-LL-ZZ') se interpreteaza
  // intotdeauna ca miezul noptii UTC, in timp ce new Date() + setHours(0)
  // foloseste fusul orar local al serverului (Europe/Bucharest, setat in
  // server.js) - diferenta de 2-3 ore intre cele doua poate face ca "azi"
  // sa para gresit "in viitor" sau invers, langa granita zilei.
  const todayLocal = new Date().toLocaleDateString('en-CA');

  if (!sampleDate) {
    return res.status(400).json({ error: 'Data prelevării probei este obligatorie.' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sampleDate) || isNaN(new Date(sampleDate).getTime())) {
    return res.status(400).json({ error: 'Data prelevării nu este validă.' });
  }
  if (sampleDate > todayLocal) {
    return res.status(400).json({ error: 'Data prelevării nu poate fi în viitor.' });
  }

  // Asumarea corectitudinii prelevarii e obligatorie - verificarea din
  // interfata (bifa) e doar UX; validarea reala e aici, server-side, ca sa
  // nu poata fi ocolita printr-o cerere directa catre API.
  if (samplingAttested !== true) {
    return res.status(400).json({ error: 'Trebuie să confirmi corectitudinea prelevării înainte de a înregistra proba.' });
  }

  // Data de livrare ceruta de client e optionala si informativa - operatorul
  // o poate ajusta/confirma dupa ce evalueaza volumul de lucru real.
  let dueDate = null;
  if (requestedDueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDueDate) || isNaN(new Date(requestedDueDate).getTime())) {
      return res.status(400).json({ error: 'Data de livrare cerută nu este validă.' });
    }
    if (requestedDueDate < todayLocal) {
      return res.status(400).json({ error: 'Data de livrare cerută nu poate fi în trecut.' });
    }
    dueDate = requestedDueDate;
  }

  // Determinam ce analize sunt disponibile pentru categoria aleasa, si
  // validam lista comandata de client fata de acestea - nu poate comanda o
  // analiza care nu exista pentru categoria lui. Daca nu trimite nimic
  // valid, implicit se comanda toate analizele disponibile pentru categorie
  // (comportament sigur, echivalent cu "pachetul complet" din trecut).
  const profile = getRuleProfile(category || '', productName.trim());
  const availableGroups = availableGroupsForProfile(profile);
  let requestedTests = Array.isArray(req.body.requestedTests)
    ? req.body.requestedTests.filter(k => TEST_GROUP_KEYS.includes(k) && availableGroups.includes(k))
    : [];
  if (!requestedTests.length) requestedTests = availableGroups;

  const code = genCode();
  const info = db.prepare(`
    INSERT INTO samples (code, owner_id, product_name, category, sample_date, sampled_by, requested_tests, owner_seen_state, operator_seen_state, due_date, haccp_intended_use, haccp_hazard, haccp_likelihood, haccp_severity, haccp_risk_score, haccp_control_measure, haccp_ccp_relevance, haccp_corrective_action, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(code, req.session.user.id, productName.trim(), category || null, sampleDate || null, sampledBy || null, JSON.stringify(requestedTests), 'pending|draft', 'pending|pending|draft', dueDate, h.intendedUse, h.hazard, h.likelihood, h.severity, h.riskScore, h.controlMeasure, h.ccpRelevance, h.correctiveAction);

  // Limitele initiale reflecta DE LA INCEPUT categoria si analizele comandate
  // - nu mai pornim implicit cu limite de cereale pentru orice produs. Un
  // grup necomandat sau fara profil potrivit ramane cu limita null.
  const limitFor = (groupRequested, profileLimit, fallbackLimit) => {
    if (!groupRequested) return null;
    if (profile) return profileLimit ?? null;
    return fallbackLimit ?? null;
  };
  const limitAfb1 = limitFor(requestedTests.includes('aflatoxins'), profile?.limit_afb1, DEFAULT_LIMITS.limit_afb1);
  const limitAflaSum = limitFor(requestedTests.includes('aflatoxins'), profile?.limit_afla_sum, DEFAULT_LIMITS.limit_afla_sum);
  const limitOta = limitFor(requestedTests.includes('ota'), profile?.limit_ota, DEFAULT_LIMITS.limit_ota);
  const limitM1 = limitFor(requestedTests.includes('m1'), profile?.limit_m1, null);
  const limitDon = limitFor(requestedTests.includes('don'), profile?.limit_don, null);
  const limitZea = limitFor(requestedTests.includes('zea'), profile?.limit_zea, null);
  const limitFum = limitFor(requestedTests.includes('fum'), profile?.limit_fum, null);

  // Provenienta limitelor (L5): 'profile' = profil recunoscut; 'fallback' =
  // niciun profil recunoscut, s-au aplicat limitele implicite de cereale
  // (AFB1/suma/OTA) - trebuie verificate de operator; 'none' = fara limite.
  const limitBasis = profile ? 'profile' : (limitAfb1 !== null || limitAflaSum !== null || limitOta !== null ? 'fallback' : 'none');
  db.prepare(`
    INSERT INTO results (sample_id, limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum,
                         limit_profile_id, limit_source, limit_regulation_ref, limit_basis)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(info.lastInsertRowid, limitAfb1, limitAflaSum, limitOta, limitM1, limitDon, limitZea, limitFum,
    profile ? profile.id : null, profile ? profile.source : null, profile ? LIMIT_REGULATION_REF : null, limitBasis);
  if (limitBasis === 'fallback') {
    db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
      .run(info.lastInsertRowid, req.session.user.id, 'limits_fallback_applied', JSON.stringify({ productName: productName.trim(), category: category || null, note: 'Niciun profil de limite recunoscut; s-au aplicat limitele implicite. Operatorul trebuie să le verifice.' }));
  }

  // Pastram in audit_log momentul si utilizatorul care a facut asumarea
  // prelevarii corecte - un simplu gate la trimitere s-ar pierde imediat
  // dupa raspuns, fara nicio urma verificabila ulterior.
  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(info.lastInsertRowid, req.session.user.id, 'sampling_attested', JSON.stringify({ attestedAt: new Date().toISOString() }));

  res.json({ id: info.lastInsertRowid, code, requestedTests });
});

// Proba de control/etalon (material de referinta certificat) - creata de
// operator/admin, fara client real, pentru verificarea periodica a
// corectitudinii metodei. Reutilizeaza exact aceeasi infrastructura de
// "limita" (limit_afb1 etc.) ca "valoare tinta acceptabila" - evaluateResult
// semnaleaza automat "fail" daca masurat > tinta, fara logica noua de calcul.
router.post('/control', requireRole('operator', 'admin'), (req, res) => {
  const { productName, category, targets } = req.body;
  if (!productName || !productName.trim()) {
    return res.status(400).json({ error: 'Denumirea probei de control este obligatorie.' });
  }
  const t = targets && typeof targets === 'object' ? targets : {};
  const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const limitAfb1 = toNum(t.afb1), limitAflaSum = toNum(t.aflaSum), limitOta = toNum(t.ota),
        limitM1 = toNum(t.m1), limitDon = toNum(t.don), limitZea = toNum(t.zea), limitFum = toNum(t.fum);

  const requestedTests = [];
  if (limitAfb1 !== null || limitAflaSum !== null) requestedTests.push('aflatoxins');
  if (limitOta !== null) requestedTests.push('ota');
  if (limitM1 !== null) requestedTests.push('m1');
  if (limitDon !== null) requestedTests.push('don');
  if (limitZea !== null) requestedTests.push('zea');
  if (limitFum !== null) requestedTests.push('fum');
  if (!requestedTests.length) {
    return res.status(400).json({ error: 'Introdu cel puțin o valoare țintă pentru un contaminant.' });
  }

  const code = genCode();
  const info = db.prepare(`
    INSERT INTO samples (code, owner_id, product_name, category, requested_tests, owner_seen_state, operator_seen_state, is_control_sample, control_expected_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, 'pending')
  `).run(code, req.session.user.id, productName.trim(), category || null, JSON.stringify(requestedTests), 'pending|draft', 'pending|pending|draft', JSON.stringify(t));

  db.prepare(`
    INSERT INTO results (sample_id, limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(info.lastInsertRowid, limitAfb1, limitAflaSum, limitOta, limitM1, limitDon, limitZea, limitFum);

  res.json({ id: info.lastInsertRowid, code });
});

// Proprietarul vede DOAR probele proprii. Filtrarea e pe server, nu pe client.
router.get('/mine', requireRole('owner'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.sampled_by AS sampledBy, s.requested_tests AS requestedTestsJson, s.owner_seen_state AS ownerSeenState, s.due_date AS dueDate, s.retest_of_sample_id AS retestOfSampleId, orig.code AS retestOfCode, s.haccp_intended_use AS haccpIntendedUse, s.haccp_hazard AS haccpHazard, s.haccp_likelihood AS haccpLikelihood, s.haccp_severity AS haccpSeverity, s.haccp_risk_score AS haccpRiskScore, s.haccp_control_measure AS haccpControlMeasure, s.haccp_ccp_relevance AS haccpCcpRelevance, s.haccp_corrective_action AS haccpCorrectiveAction, s.status, s.created_at AS createdAt, ow.company_name AS companyName,
           r.afb1, r.afg1, r.afg2, r.afb2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_profile_id AS limitProfileId, r.limit_source AS limitSource, r.limit_regulation_ref AS limitRegulationRef, r.limit_basis AS limitBasis, r.limit_override_reason AS limitOverrideReason,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta, r.limit_m1 AS limitM1, r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt, r.review_status AS reviewStatus,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt, r.bulletin_no AS bulletinNo, r.bulletin_issued_at AS bulletinIssuedAt, vu.full_name AS validatedByName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users vu ON vu.id = r.validated_by
    LEFT JOIN users ow ON ow.id = s.owner_id
    LEFT JOIN samples orig ON orig.id = s.retest_of_sample_id
    WHERE s.owner_id = ? AND s.is_control_sample = 0
    ORDER BY s.created_at DESC
  `).all(req.session.user.id);

  const withStatus = rows.map(r => {
    let requestedTests = null;
    try { requestedTests = r.requestedTestsJson ? JSON.parse(r.requestedTestsJson) : null; } catch (_) { requestedTests = null; }
    const { requestedTestsJson, ownerSeenState, ...rest } = r;
    const computedStatus = evaluateResult({
      afb1: r.afb1, afb2: r.afb2, afg1: r.afg1, afg2: r.afg2, ota: r.ota, m1: r.m1, don: r.don, zea: r.zea, fum: r.fum,
      limit_afb1: r.limitAfb1, limit_afla_sum: r.limitAflaSum, limit_ota: r.limitOta, limit_m1: r.limitM1, limit_don: r.limitDon, limit_zea: r.limitZea, limit_fum: r.limitFum, qc_status: r.qcStatus
    });
    // Notificare in-app: proba e marcata "actualizata" daca starea curenta
    // (status calculat + status validare) difera de ultima stare vazuta de
    // proprietar - fara nevoie de server de email.
    const currentSignature = `${computedStatus}|${r.validationStatus}`;
    const hasUpdate = ownerSeenState !== null && ownerSeenState !== currentSignature;
    return { ...rest, requestedTests, status: computedStatus, hasUpdate };
  });

  res.json({ samples: withStatus });
});

// Arhiva proprietarului: aceleasi probe ca /mine, dar cu filtre de cautare.
// Ramane strict izolata pe owner_id - un proprietar nu vede niciodata probele altcuiva.
router.get('/archive', requireRole('owner'), (req, res) => {
  const { status, category, dateFrom, dateTo } = req.query;

  let query = `
    SELECT s.id, s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.sampled_by AS sampledBy, s.created_at AS createdAt, ow.company_name AS companyName,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_profile_id AS limitProfileId, r.limit_source AS limitSource, r.limit_regulation_ref AS limitRegulationRef, r.limit_basis AS limitBasis, r.limit_override_reason AS limitOverrideReason,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta,
           r.limit_m1 AS limitM1, r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt, r.bulletin_no AS bulletinNo, r.bulletin_issued_at AS bulletinIssuedAt, vu.full_name AS validatedByName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users ow ON ow.id = s.owner_id
    LEFT JOIN users vu ON vu.id = r.validated_by
    WHERE s.owner_id = ?
  `;
  const params = [req.session.user.id];

  if (category) {
    query += ' AND s.category LIKE ?';
    params.push(`%${category}%`);
  }
  if (dateFrom) {
    query += ' AND s.sample_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    query += ' AND s.sample_date <= ?';
    params.push(dateTo);
  }

  query += ' ORDER BY s.created_at DESC';

  let rows = db.prepare(query).all(...params);

  let withStatus = rows.map(r => ({ ...r, status: evaluateArchiveRow(r) }));

  // Filtrul de status se aplica dupa calculul verdictului, pentru ca statusul
  // nu e o coloana stocata direct in forma finala (e derivat din rezultate+limite).
  if (status) {
    withStatus = withStatus.filter(s => s.status === status);
  }

  // Paginare la nivel de raspuns - vezi nota similara din routes/results.js
  // /archive: statusul calculat in JS nu permite LIMIT/OFFSET curat direct
  // in SQL cand e combinat cu filtrul de status.
  const total = withStatus.length;
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const paged = withStatus.slice((page - 1) * pageSize, page * pageSize);

  res.json({ samples: paged, total, page, pageSize });
});

// Export CSV al arhivei, cu aceleasi filtre ca mai sus.
router.get('/archive/export', requireRole('owner'), (req, res) => {
  const { status, category, dateFrom, dateTo } = req.query;

  let query = `
    SELECT s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.sampled_by AS sampledBy,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_profile_id AS limitProfileId, r.limit_source AS limitSource, r.limit_regulation_ref AS limitRegulationRef, r.limit_basis AS limitBasis, r.limit_override_reason AS limitOverrideReason,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta,
           r.limit_m1 AS limitM1, r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum,
           r.analysis_date AS analysisDate, r.notes, r.qc_status AS qcStatus
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    WHERE s.owner_id = ?
  `;
  const params = [req.session.user.id];

  if (category) {
    query += ' AND s.category LIKE ?';
    params.push(`%${category}%`);
  }
  if (dateFrom) {
    query += ' AND s.sample_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    query += ' AND s.sample_date <= ?';
    params.push(dateTo);
  }

  query += ' ORDER BY s.created_at DESC';

  let rows = db.prepare(query).all(...params);
  rows = rows.map(r => ({ ...r, status: evaluateArchiveRow(r) }));

  if (status) {
    rows = rows.filter(r => r.status === status);
  }

  const statusLabels = { ok: 'Conform', fail: 'Depasire limita', pending: 'In asteptare', in_analysis: 'In analiza' };

  const csvEscape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const header = [
    'Cod probă', 'Denumire produs', 'Categorie', 'Data prelevării', 'Prelevat de',
    'AFB1 (µg/kg)', 'AFB2 (µg/kg)', 'AFG1 (µg/kg)', 'AFG2 (µg/kg)', 'OTA (µg/kg)',
    'M1 (µg/kg)', 'DON (µg/kg)', 'ZEA (µg/kg)', 'Fumonizine (µg/kg)',
    'Limită AFB1', 'Limită sumă aflatoxine', 'Limită OTA',
    'Limită M1', 'Limită DON', 'Limită ZEA', 'Limită Fumonizine',
    'Data analizei', 'Status', 'Observații'
  ];

  const lines = [header.join(',')];
  rows.forEach(r => {
    lines.push([
      csvEscape(r.code), csvEscape(r.productName), csvEscape(r.category), csvEscape(r.sampleDate), csvEscape(r.sampledBy),
      csvEscape(r.afb1), csvEscape(r.afb2), csvEscape(r.afg1), csvEscape(r.afg2), csvEscape(r.ota),
      csvEscape(r.m1), csvEscape(r.don), csvEscape(r.zea), csvEscape(r.fum),
      csvEscape(r.limitAfb1), csvEscape(r.limitAflaSum), csvEscape(r.limitOta),
      csvEscape(r.limitM1), csvEscape(r.limitDon), csvEscape(r.limitZea), csvEscape(r.limitFum),
      csvEscape(r.analysisDate), csvEscape(statusLabels[r.status] || r.status), csvEscape(r.notes)
    ].join(','));
  });

  // BOM UTF-8 pentru ca Excel sa afiseze corect diacriticele romanesti.
  const csvContent = '\uFEFF' + lines.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arhiva-probe-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csvContent);
});

// Context HACCP al probei. Este un screening contextual, nu un plan HACCP și nu stabilește singur CCP-uri.
router.put('/:id/haccp', requireRole('owner', 'admin'), (req, res) => {
  const sample = db.prepare('SELECT id, owner_id FROM samples WHERE id = ?').get(req.params.id);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  if (req.session.user.role === 'owner' && sample.owner_id !== req.session.user.id) return res.status(403).json({ error: 'Nu ai acces la această probă.' });
  const h = normalizeHaccp(req.body);
  db.prepare(`UPDATE samples SET haccp_intended_use=?, haccp_hazard=?, haccp_likelihood=?, haccp_severity=?, haccp_risk_score=?, haccp_control_measure=?, haccp_ccp_relevance=?, haccp_corrective_action=? WHERE id=?`)
    .run(h.intendedUse, h.hazard, h.likelihood, h.severity, h.riskScore, h.controlMeasure, h.ccpRelevance, h.correctiveAction, req.params.id);
  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, req.session.user.id, 'haccp_context_updated', JSON.stringify(h));
  res.json({ ok: true, haccp: h });
});

// Evolutia in timp a rezultatelor validate ale proprietarului, pentru
// aceeasi categorie de produs - ii permite sa vada un trend al unui
// contaminant inainte sa devina o problema. Plasata inaintea rutei /:id
// pentru ca Express sa nu interpreteze "trend" ca fiind un id de proba.
router.get('/trend', requireRole('owner'), (req, res) => {
  const category = req.query.category || '';
  if (!category) return res.status(400).json({ error: 'Categoria este obligatorie.' });

  const rows = db.prepare(`
    SELECT s.code, s.sample_date AS sampleDate, r.validated_at AS validatedAt,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_profile_id AS limitProfileId, r.limit_source AS limitSource, r.limit_regulation_ref AS limitRegulationRef, r.limit_basis AS limitBasis, r.limit_override_reason AS limitOverrideReason,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta, r.limit_m1 AS limitM1,
           r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum
    FROM samples s
    JOIN results r ON r.sample_id = s.id
    WHERE s.owner_id = ? AND s.category = ? AND r.validation_status = 'validated'
    ORDER BY r.validated_at ASC
    LIMIT 20
  `).all(req.session.user.id, category);

  const points = rows.map(r => {
    const afVals = [r.afb1, r.afb2, r.afg1, r.afg2];
    const aflaSum = afVals.every(v => v !== null && v !== undefined) ? afVals.reduce((a, b) => a + b, 0) : null;
    return { ...r, aflaSum };
  });

  // Detectarea unei tendinte crescatoare reale (nu doar vizuale), per
  // contaminant - vezi db/trend-analysis.js pentru metoda (Mann-Kendall).
  // Gandit pentru depozitare: proba curenta poate fi conforma, dar o
  // tendinta constanta de crestere poate semnala un risc care se
  // acumuleaza inainte sa devina o neconformitate.
  const contaminantDefs = [
    ['afb1', 'limitAfb1'], ['aflaSum', 'limitAflaSum'], ['ota', 'limitOta'],
    ['don', 'limitDon'], ['zea', 'limitZea'], ['fum', 'limitFum'],
  ];
  const trendAlerts = {};
  for (const [key, limitKey] of contaminantDefs) {
    const history = points.map(p => ({ value: p[key], limit: p[limitKey] }));
    const alert = detectIncreasingTrend(history);
    if (alert) trendAlerts[key] = alert;
  }

  res.json({ points, trendAlerts });
});

// Detaliu proba - proprietarul poate vedea DOAR daca e a lui.
router.get('/:id', requireRole('owner', 'admin'), (req, res) => {
  const sample = db.prepare(`
    SELECT s.*, r.afb1, r.afb2, r.afg1, r.afg2, r.ota,
           r.limit_profile_id AS limitProfileId, r.limit_source AS limitSource, r.limit_regulation_ref AS limitRegulationRef, r.limit_basis AS limitBasis, r.limit_override_reason AS limitOverrideReason,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt, r.bulletin_no AS bulletinNo, r.bulletin_issued_at AS bulletinIssuedAt, vu.full_name AS validatedByName,
           ow.company_name AS companyName, ow.company_reg_no AS companyRegNo, ow.company_address AS companyAddress, ow.company_contact AS companyContact
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users vu ON vu.id = r.validated_by
    LEFT JOIN users ow ON ow.id = s.owner_id
    WHERE s.id = ?
  `).get(req.params.id);

  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  if (req.session.user.role === 'owner' && sample.owner_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Nu ai acces la această probă.' });
  }

  res.json({ sample });
});

// Marcheaza proba drept "vazuta" de proprietar la starea ei curenta -
// sterge notificarea "Nou" din bara laterala. Se apeleaza cand proprietarul
// deschide detaliul probei.
router.post('/:id/mark-seen', requireRole('owner'), (req, res) => {
  const sample = db.prepare('SELECT id, owner_id FROM samples WHERE id = ?').get(req.params.id);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  if (sample.owner_id !== req.session.user.id) return res.status(403).json({ error: 'Nu ai acces la această probă.' });

  const current = db.prepare(`
    SELECT afb1, afb2, afg1, afg2, ota, m1, don, zea, fum,
           limit_afb1 AS limitAfb1, limit_afla_sum AS limitAflaSum, limit_ota AS limitOta, limit_m1 AS limitM1,
           limit_don AS limitDon, limit_zea AS limitZea, limit_fum AS limitFum, validation_status AS validationStatus, qc_status AS qcStatus
    FROM results WHERE sample_id = ?
  `).get(req.params.id);
  const computedStatus = current ? evaluateResult({
    afb1: current.afb1, afb2: current.afb2, afg1: current.afg1, afg2: current.afg2, ota: current.ota, m1: current.m1, don: current.don, zea: current.zea, fum: current.fum,
    limit_afb1: current.limitAfb1, limit_afla_sum: current.limitAflaSum, limit_ota: current.limitOta, limit_m1: current.limitM1, limit_don: current.limitDon, limit_zea: current.limitZea, limit_fum: current.limitFum, qc_status: current.qcStatus
  }) : 'pending';
  const signature = `${computedStatus}|${current ? current.validationStatus : 'draft'}`;

  db.prepare('UPDATE samples SET owner_seen_state = ? WHERE id = ?').run(signature, req.params.id);
  res.json({ ok: true });
});

// Operatorul confirma/ajusteaza termenul real de livrare (TAT), dupa ce
// evalueaza volumul de lucru - poate diferi de data ceruta initial de client.
router.put('/:id/due-date', requireRole('operator', 'admin'), (req, res) => {
  const sample = db.prepare('SELECT id FROM samples WHERE id = ?').get(req.params.id);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });

  const { dueDate } = req.body;
  if (dueDate) {
    const parsed = new Date(dueDate);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Data de livrare nu este validă.' });
    }
  }

  db.prepare('UPDATE samples SET due_date = ? WHERE id = ?').run(dueDate || null, req.params.id);
  res.json({ ok: true, dueDate: dueDate || null });
});

// Fluxul formal de reanalizare: creeaza o proba NOUA, legata de cea
// originala (retest_of_sample_id), cu aceeasi categorie/analize comandate.
// Proba originala ramane neschimbata (in special daca e deja validata) -
// trasabilitatea completa se pastreaza prin legatura si prin jurnalul de audit.
router.post('/:id/retest', requireRole('owner', 'validator', 'admin'), (req, res) => {
  const original = db.prepare('SELECT * FROM samples WHERE id = ?').get(req.params.id);
  if (!original) return res.status(404).json({ error: 'Proba originală nu a fost găsită.' });
  if (req.session.user.role === 'owner' && original.owner_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Nu ai acces la această probă.' });
  }

  const { reason, sampleDate } = req.body;
  const reasonText = String(reason || '').trim() || null;

  const code = genCode();
  const info = db.prepare(`
    INSERT INTO samples (code, owner_id, product_name, category, sample_date, sampled_by, requested_tests, owner_seen_state, operator_seen_state, retest_of_sample_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(code, original.owner_id, original.product_name, original.category, sampleDate || null, original.sampled_by, original.requested_tests, 'pending|draft', 'pending|pending|draft', original.id);

  // Limitele probei noi reflecta exact ce era corect pentru proba
  // originala (categorie + analize comandate), fara sa depinda de
  // implicit-urile de la creare initiala.
  const originalResult = db.prepare(`
    SELECT limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum,
           limit_profile_id, limit_source, limit_regulation_ref, limit_basis, limit_override_reason
    FROM results WHERE sample_id = ?
  `).get(original.id);

  db.prepare(`
    INSERT INTO results (sample_id, limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum,
                         limit_profile_id, limit_source, limit_regulation_ref, limit_basis, limit_override_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    info.lastInsertRowid,
    originalResult?.limit_afb1 ?? null, originalResult?.limit_afla_sum ?? null, originalResult?.limit_ota ?? null,
    originalResult?.limit_m1 ?? null, originalResult?.limit_don ?? null, originalResult?.limit_zea ?? null, originalResult?.limit_fum ?? null,
    originalResult?.limit_profile_id ?? null, originalResult?.limit_source ?? null, originalResult?.limit_regulation_ref ?? null,
    originalResult?.limit_basis ?? null, originalResult?.limit_override_reason ?? null
  );

  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(original.id, req.session.user.id, 'retest_requested', JSON.stringify({ newSampleId: info.lastInsertRowid, newCode: code, reason: reasonText }));

  res.json({ id: info.lastInsertRowid, code });
});



router.get('/:sampleId/audit', requireRole('owner', 'operator', 'validator', 'admin'), (req, res) => {
  // Proprietarul vede doar auditul propriilor probe; operator/validator/admin
  // pot vedea auditul oricarei probe (nu au conceptul de "proba proprie").
  if (req.session.user.role === 'owner') {
    const exists = db.prepare('SELECT id FROM samples WHERE id = ? AND owner_id = ?').get(req.params.sampleId, req.session.user.id);
    if (!exists) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  } else {
    const exists = db.prepare('SELECT id FROM samples WHERE id = ?').get(req.params.sampleId);
    if (!exists) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  }
  const rows = db.prepare(`
    SELECT a.id, a.action, a.details, a.created_at AS createdAt, u.full_name AS userName
    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.sample_id = ? ORDER BY a.created_at DESC, a.id DESC
  `).all(req.params.sampleId);
  res.json({ audit: rows });
});

module.exports = router;
