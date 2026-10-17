const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { requireRole, requireSampleAccess } = require('../middleware/auth');
const { evaluateResult, RULE_PROFILES, getRuleProfile, TEST_GROUP_KEYS } = require('../db/evaluation');

const router = express.Router();

// Reguli disponibile pentru aplicație. Nu presupun existența unui instrument.
router.get('/rules', requireRole('owner', 'operator', 'validator', 'admin'), (req, res) => {
  const profile = getRuleProfile(req.query.category || '', req.query.productName || '');
  res.json({
    profiles: RULE_PROFILES.map(({ id, label, limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum, source }) => ({ id, label, limit_afb1, limit_afla_sum, limit_ota, limit_m1, limit_don, limit_zea, limit_fum, source })),
    suggested: profile ? { id: profile.id, label: profile.label, limit_afb1: profile.limit_afb1, limit_afla_sum: profile.limit_afla_sum, limit_ota: profile.limit_ota, limit_m1: profile.limit_m1, limit_don: profile.limit_don, limit_zea: profile.limit_zea, limit_fum: profile.limit_fum, source: profile.source } : null
  });
});

// Coada operatorului: toate probele, indiferent de proprietar (operatorul NU are
// nevoie sa vada cine e proprietarul pentru a lucra, dar codul probei e suficient
// pentru trasabilitate).
// Statistica "timp pana la receptie" - din auditul logic, recomandarea 2:
// durata dintre inregistrare si confirmarea efectiva la poarta de intrare
// nu era urmarita ca indicator, desi poate conta pentru probe cu valabilitate
// scurta. Foloseste doar probe deja receptionate; cele inca in asteptare nu
// au un punct final de masurat, deci nu intra in medie.
router.get('/stats/intake-time', requireRole('admin'), (req, res) => {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS receivedCount,
      AVG((julianday(r.intake_checked_at) - julianday(s.created_at)) * 24) AS avgHours,
      MAX((julianday(r.intake_checked_at) - julianday(s.created_at)) * 24) AS maxHours
    FROM samples s
    JOIN results r ON r.sample_id = s.id
    WHERE r.intake_checked_at IS NOT NULL
  `).get();
  const pendingCount = db.prepare(`
    SELECT COUNT(*) AS n FROM samples s JOIN results r ON r.sample_id = s.id
    WHERE r.intake_checked_at IS NULL AND s.status != 'cancelled'
  `).get().n;
  res.json({
    receivedCount: row.receivedCount || 0,
    avgHours: row.avgHours !== null ? Math.round(row.avgHours * 10) / 10 : null,
    maxHours: row.maxHours !== null ? Math.round(row.maxHours * 10) / 10 : null,
    pendingCount,
  });
});

router.get('/queue', requireRole('operator', 'validator', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.requested_tests AS requestedTestsJson, s.due_date AS dueDate, s.retest_of_sample_id AS retestOfSampleId, orig.code AS retestOfCode,
           s.is_control_sample AS isControlSample, s.operator_seen_state AS operatorSeenState,
           s.status, s.created_at AS createdAt, ow.company_name AS companyName,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta, r.limit_m1 AS limitM1, r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt,
           r.operator_id AS operatorId, r.review_status AS reviewStatus, r.reviewed_at AS reviewedAt, r.review_note AS reviewNote, ru.full_name AS reviewedByName,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users ru ON ru.id = r.reviewed_by
    LEFT JOIN users ow ON ow.id = s.owner_id
    LEFT JOIN samples orig ON orig.id = s.retest_of_sample_id
    ORDER BY s.created_at DESC
  `).all();

  const withStatus = rows.map(r => {
    let requestedTests = null;
    try { requestedTests = r.requestedTestsJson ? JSON.parse(r.requestedTestsJson) : null; } catch (_) { requestedTests = null; }
    const { requestedTestsJson, operatorSeenState, ...rest } = r;
    const computedStatus = evaluateResult({
      afb1: r.afb1, afb2: r.afb2, afg1: r.afg1, afg2: r.afg2, ota: r.ota, m1: r.m1, don: r.don, zea: r.zea, fum: r.fum,
      limit_afb1: r.limitAfb1, limit_afla_sum: r.limitAflaSum, limit_ota: r.limitOta, limit_m1: r.limitM1, limit_don: r.limitDon, limit_zea: r.limitZea, limit_fum: r.limitFum, qc_status: r.qcStatus
    });
    // Notificare "Nou" comuna echipei operator/validator - vezi nota din
    // db/database.js despre alegerea de a nu tine starea per utilizator.
    const currentSignature = `${computedStatus}|${r.reviewStatus}|${r.validationStatus}`;
    const hasUpdate = operatorSeenState !== null && operatorSeenState !== currentSignature;
    return { ...rest, requestedTests, status: computedStatus, hasUpdate };
  });

  res.json({ samples: withStatus });
});

// Marcheaza proba ca vazuta de operator/validator - sterge notificarea "Nou"
// din coada. Stare comuna echipei, vezi nota din db/database.js.
router.post('/:id/mark-seen', requireRole('operator', 'validator', 'admin'), (req, res) => {
  const sample = db.prepare('SELECT id FROM samples WHERE id = ?').get(req.params.id);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });

  const current = db.prepare(`
    SELECT afb1, afb2, afg1, afg2, ota, m1, don, zea, fum,
           limit_afb1 AS limitAfb1, limit_afla_sum AS limitAflaSum, limit_ota AS limitOta, limit_m1 AS limitM1,
           limit_don AS limitDon, limit_zea AS limitZea, limit_fum AS limitFum,
           review_status AS reviewStatus, validation_status AS validationStatus, qc_status AS qcStatus
    FROM results WHERE sample_id = ?
  `).get(req.params.id);
  const computedStatus = current ? evaluateResult({
    afb1: current.afb1, afb2: current.afb2, afg1: current.afg1, afg2: current.afg2, ota: current.ota, m1: current.m1, don: current.don, zea: current.zea, fum: current.fum,
    limit_afb1: current.limitAfb1, limit_afla_sum: current.limitAflaSum, limit_ota: current.limitOta, limit_m1: current.limitM1, limit_don: current.limitDon, limit_zea: current.limitZea, limit_fum: current.limitFum, qc_status: current.qcStatus
  }) : 'pending';
  const signature = `${computedStatus}|${current ? current.reviewStatus : 'pending'}|${current ? current.validationStatus : 'draft'}`;

  db.prepare('UPDATE samples SET operator_seen_state = ? WHERE id = ?').run(signature, req.params.id);
  res.json({ ok: true });
});

// Arhiva operatorului: toate probele (indiferent de proprietar), cu filtre
// si cu numele proprietarului afisat - util pentru operator, spre deosebire
// de coada curenta care nu arata aceasta informatie.
router.get('/archive', requireRole('operator', 'validator', 'admin'), (req, res) => {
  const { status, category, dateFrom, dateTo, search } = req.query;

  let query = `
    SELECT s.id, s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.sampled_by AS sampledBy, s.created_at AS createdAt,
           u.full_name AS ownerName, u.email AS ownerEmail, u.company_name AS companyName,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt, r.review_status AS reviewStatus,
           vu.full_name AS validatedByName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN users vu ON vu.id = r.validated_by
    WHERE 1=1
  `;
  const params = [];

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
  if (search) {
    query += ' AND (s.code LIKE ? OR s.product_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY s.created_at DESC';

  let rows = db.prepare(query).all(...params);

  let withStatus = rows.map(r => ({ ...r, status: evaluateResult({
    afb1: r.afb1, afb2: r.afb2, afg1: r.afg1, afg2: r.afg2, ota: r.ota,
    limit_afb1: r.limitAfb1, limit_afla_sum: r.limitAflaSum, limit_ota: r.limitOta, qc_status: r.qcStatus
  }) }));

  if (status) {
    withStatus = withStatus.filter(s => s.status === status);
  }

  // Paginare la nivel de raspuns - statusul e calculat in JS (nu e coloana
  // in baza de date), deci LIMIT/OFFSET direct in SQL nu s-ar putea combina
  // corect cu filtrul de status. Aplicam pagina DUPA filtrare, ca sa
  // limitam ce se trimite la client si ce se randeaza in DOM, indiferent
  // cat de mare devine arhiva istorica.
  const total = withStatus.length;
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const paged = withStatus.slice((page - 1) * pageSize, page * pageSize);

  res.json({ samples: paged, total, page, pageSize });
});

// Export CSV al arhivei operatorului, cu aceleasi filtre.
router.get('/archive/export', requireRole('operator', 'validator', 'admin'), (req, res) => {
  const { status, category, dateFrom, dateTo, search } = req.query;

  let query = `
    SELECT s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.sampled_by AS sampledBy,
           u.full_name AS ownerName, u.email AS ownerEmail, u.company_name AS companyName,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta,
           r.analysis_date AS analysisDate, r.notes, r.method, r.equipment, r.qc_status AS qcStatus, r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt,
           vu.full_name AS validatedByName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users u ON u.id = s.owner_id
    LEFT JOIN users vu ON vu.id = r.validated_by
    WHERE 1=1
  `;
  const params = [];

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
  if (search) {
    query += ' AND (s.code LIKE ? OR s.product_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY s.created_at DESC';

  let rows = db.prepare(query).all(...params);
  rows = rows.map(r => ({ ...r, status: evaluateResult({
    afb1: r.afb1, afb2: r.afb2, afg1: r.afg1, afg2: r.afg2, ota: r.ota,
    limit_afb1: r.limitAfb1, limit_afla_sum: r.limitAflaSum, limit_ota: r.limitOta, qc_status: r.qcStatus
  }) }));

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
    'Proprietar', 'Email proprietar', 'Firma',
    'AFB1 (µg/kg)', 'AFB2 (µg/kg)', 'AFG1 (µg/kg)', 'AFG2 (µg/kg)', 'OTA (µg/kg)',
    'Limită AFB1', 'Limită sumă aflatoxine', 'Limită OTA',
    'Data analizei', 'Status', 'Observații'
  ];

  const lines = [header.join(',')];
  rows.forEach(r => {
    lines.push([
      csvEscape(r.code), csvEscape(r.productName), csvEscape(r.category), csvEscape(r.sampleDate), csvEscape(r.sampledBy),
      csvEscape(r.ownerName), csvEscape(r.ownerEmail), csvEscape(r.companyName),
      csvEscape(r.afb1), csvEscape(r.afb2), csvEscape(r.afg1), csvEscape(r.afg2), csvEscape(r.ota),
      csvEscape(r.limitAfb1), csvEscape(r.limitAflaSum), csvEscape(r.limitOta),
      csvEscape(r.analysisDate), csvEscape(statusLabels[r.status] || r.status), csvEscape(r.notes)
    ].join(','));
  });

  const csvContent = '\uFEFF' + lines.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="arhiva-operator-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(csvContent);
});

// Operatorul introduce/actualizeaza rezultatele pentru o proba anume.
router.put('/:sampleId', requireRole('operator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const { afb1, afb2, afg1, afg2, ota, m1, don, zea, fum, analysisDate, notes, method, equipment, qcStatus, qcRejectionReason, intakeConfirmed, limitAfb1, limitAflaSum, limitOta, limitM1, limitDon, limitZea, limitFum, correctionReason } = req.body;

  const sample = db.prepare('SELECT id, requested_tests AS requestedTestsJson FROM samples WHERE id = ?').get(req.params.sampleId);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });

  const current = db.prepare('SELECT * FROM results WHERE sample_id = ?').get(req.params.sampleId);
  if (!current) return res.status(404).json({ error: 'Rezultatul probei nu a fost găsit.' });

  // Odata ce QC e decis (acceptat/neaplicabil), proba e trimisa spre
  // validare si se blocheaza pentru operator - singurul mod de a redeschide
  // e ca validatorul sa respinga la revizuire (review_status='rejected').
  // Adminul pastreaza acces, pentru acoperire in echipe mici.
  const isSubmitted = (current.qc_status === 'accepted' || current.qc_status === 'not_required') && current.review_status !== 'rejected';
  if (isSubmitted && req.session.user.role === 'operator') {
    return res.status(403).json({ error: 'Proba a fost trimisă spre validare și nu mai poate fi modificată. Dacă validatorul o respinge, redevine editabilă.' });
  }

  const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const numericFields = { afb1, afb2, afg1, afg2, ota, m1, don, zea, fum, limitAfb1, limitAflaSum, limitOta, limitM1, limitDon, limitZea, limitFum };
  for (const [key, value] of Object.entries(numericFields)) {
    if (value !== '' && value !== null && value !== undefined && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      return res.status(400).json({ error: `Valoarea ${key} trebuie să fie numerică și nenegativă.` });
    }
  }

  // QC respins anuleaza proba - beneficiarul trebuie sa vada de ce, nu doar
  // "ceva s-a schimbat". Motivul e obligatoriu, nu optional.
  if (qcStatus === 'rejected' && !(qcRejectionReason || '').trim()) {
    return res.status(400).json({ error: 'Trebuie să indici un motiv pentru respingerea QC — beneficiarul va vedea acest motiv.' });
  }

  // Analizele comandate (alese de proprietar la inregistrare) sunt sursa de
  // adevar pentru ce se poate salva - indiferent ce trimite clientul, orice
  // valoare/limita dintr-un grup necomandat e fortata la null. Aceasta e o
  // protectie reala, server-side, nu doar ascunderea campurilor in interfata.
  let requestedTests = TEST_GROUP_KEYS; // fallback: fara lista salvata, toate grupurile raman permise (compatibilitate probe vechi)
  try {
    if (sample.requestedTestsJson) {
      const parsed = JSON.parse(sample.requestedTestsJson);
      if (Array.isArray(parsed) && parsed.length) requestedTests = parsed;
    }
  } catch (_) { /* pastram fallback-ul de mai sus */ }

  const has = (group) => requestedTests.includes(group);
  const maskedAfb1 = has('aflatoxins') ? afb1 : null;
  const maskedAfb2 = has('aflatoxins') ? afb2 : null;
  const maskedAfg1 = has('aflatoxins') ? afg1 : null;
  const maskedAfg2 = has('aflatoxins') ? afg2 : null;
  const maskedLimitAfb1 = has('aflatoxins') ? limitAfb1 : null;
  const maskedLimitAflaSum = has('aflatoxins') ? limitAflaSum : null;
  const maskedOta = has('ota') ? ota : null;
  const maskedLimitOta = has('ota') ? limitOta : null;
  const maskedM1 = has('m1') ? m1 : null;
  const maskedLimitM1 = has('m1') ? limitM1 : null;
  const maskedDon = has('don') ? don : null;
  const maskedLimitDon = has('don') ? limitDon : null;
  const maskedZea = has('zea') ? zea : null;
  const maskedLimitZea = has('zea') ? limitZea : null;
  const maskedFum = has('fum') ? fum : null;
  const maskedLimitFum = has('fum') ? limitFum : null;

  // O data validat, un rezultat NU mai poate fi modificat sub nicio forma -
  // fara exceptie, indiferent de motiv. Pentru o corectie reala e nevoie de
  // o proba noua, nu de editarea uneia deja validate (integritatea
  // buletinelor emise este esentiala pentru increderea in laborator).
  if (current.validation_status === 'validated') {
    return res.status(403).json({ error: 'Rezultatul este validat și nu mai poate fi modificat. Pentru o corecție, înregistrează o probă nouă.' });
  }

  // O proba nu poate fi trimisa spre validare (QC acceptat/neaplicabil) cat
  // timp rezultatele nu sunt complete - altfel proba se blocheaza definitiv:
  // operatorul nu mai poate scrie (QC decis o inchide), iar validatorul nu
  // poate nici aproba, nici respinge (rezultatele incomplete blocheaza si
  // decizia lui). Verificarea foloseste valorile EFECTIVE care vor fi
  // salvate (cele noi, sau cele curente acolo unde nu se trimite o valoare
  // noua), nu doar campurile brute din cerere.
  const effectiveQcStatus = qcStatus !== undefined && qcStatus !== null && qcStatus !== '' ? qcStatus : current.qc_status;
  if (effectiveQcStatus === 'accepted' || effectiveQcStatus === 'not_required') {
    const pick = (masked, currentVal) => { const n = toNum(masked); return (masked !== undefined && masked !== null && masked !== '') ? n : currentVal; };
    const effectiveStatus = evaluateResult({
      afb1: pick(maskedAfb1, current.afb1), afb2: pick(maskedAfb2, current.afb2), afg1: pick(maskedAfg1, current.afg1), afg2: pick(maskedAfg2, current.afg2),
      ota: pick(maskedOta, current.ota), m1: pick(maskedM1, current.m1), don: pick(maskedDon, current.don), zea: pick(maskedZea, current.zea), fum: pick(maskedFum, current.fum),
      limit_afb1: pick(maskedLimitAfb1, current.limit_afb1), limit_afla_sum: pick(maskedLimitAflaSum, current.limit_afla_sum), limit_ota: pick(maskedLimitOta, current.limit_ota),
      limit_m1: pick(maskedLimitM1, current.limit_m1), limit_don: pick(maskedLimitDon, current.limit_don), limit_zea: pick(maskedLimitZea, current.limit_zea), limit_fum: pick(maskedLimitFum, current.limit_fum),
      qc_status: effectiveQcStatus,
    });
    if (effectiveStatus === 'pending' || effectiveStatus === 'in_analysis') {
      return res.status(400).json({ error: 'Rezultatele nu sunt complete încă — proba nu poate fi trimisă spre validare cu control de calitate decis. Completează toate valorile analitice mai întâi.' });
    }
    // Metoda, echipamentul si data analizei sunt parte din dosarul de
    // trasabilitate al rezultatului (cine, cu ce, cand) - o proba nu poate
    // pleca spre validare fara ele, la fel cum nu poate pleca fara valori.
    const effMethod = method !== undefined ? String(method).trim() : (current.method || '').trim();
    const effEquipment = equipment !== undefined ? String(equipment).trim() : (current.equipment || '').trim();
    const effAnalysisDate = analysisDate !== undefined && analysisDate !== null && analysisDate !== '' ? analysisDate : current.analysis_date;
    if (!effAnalysisDate) {
      return res.status(400).json({ error: 'Data analizei este obligatorie înainte de trimiterea spre validare.' });
    }
    if (!effMethod) {
      return res.status(400).json({ error: 'Metoda analitică este obligatorie înainte de trimiterea spre validare.' });
    }
    if (!effEquipment) {
      return res.status(400).json({ error: 'Echipamentul folosit este obligatoriu înainte de trimiterea spre validare.' });
    }
  }

  let newStatus;
  const reason = String(correctionReason || '').trim() || null;

  const save = db.transaction(() => {
    const snapshot = {
      afb1: current.afb1, afb2: current.afb2, afg1: current.afg1, afg2: current.afg2, ota: current.ota, m1: current.m1,
      don: current.don, zea: current.zea, fum: current.fum,
      limitAfb1: current.limit_afb1, limitAflaSum: current.limit_afla_sum, limitOta: current.limit_ota, limitM1: current.limit_m1,
      limitDon: current.limit_don, limitZea: current.limit_zea, limitFum: current.limit_fum,
      analysisDate: current.analysis_date, notes: current.notes, method: current.method, equipment: current.equipment, qcStatus: current.qc_status,
      validationStatus: current.validation_status, bulletinNo: current.bulletin_no || null, bulletinIssuedAt: current.bulletin_issued_at || null
    };
    const latest = db.prepare('SELECT COALESCE(MAX(version_no), 0) AS n FROM result_versions WHERE sample_id = ?').get(req.params.sampleId);
    const versionNo = latest.n + 1;
    const snapshotJson = JSON.stringify(snapshot);
    const hash = crypto.createHash('sha256').update(snapshotJson).digest('hex');
    db.prepare(`INSERT INTO result_versions (sample_id, version_no, snapshot_json, snapshot_hash, change_reason, changed_by) VALUES (?, ?, ?, ?, ?, ?)` )
      .run(req.params.sampleId, versionNo, snapshotJson, hash, reason, req.session.user.id);

    db.prepare(`
    UPDATE results SET
      afb1 = COALESCE(?, afb1), afb2 = COALESCE(?, afb2), afg1 = COALESCE(?, afg1), afg2 = COALESCE(?, afg2),
      ota = COALESCE(?, ota), m1 = COALESCE(?, m1), don = COALESCE(?, don), zea = COALESCE(?, zea), fum = COALESCE(?, fum),
      limit_afb1 = COALESCE(?, limit_afb1),
      limit_afla_sum = COALESCE(?, limit_afla_sum),
      limit_ota = COALESCE(?, limit_ota),
      limit_m1 = COALESCE(?, limit_m1),
      limit_don = COALESCE(?, limit_don),
      limit_zea = COALESCE(?, limit_zea),
      limit_fum = COALESCE(?, limit_fum),
      analysis_date = COALESCE(?, analysis_date), notes = COALESCE(?, notes), method = COALESCE(?, method), equipment = COALESCE(?, equipment),
      qc_status = COALESCE(?, qc_status), qc_rejection_reason = ?,
      intake_checked_at = COALESCE(intake_checked_at, CASE WHEN ? = 1 THEN datetime('now', 'localtime') ELSE NULL END), operator_id = ?,
      validation_status = 'draft', validated_by = NULL, validated_at = NULL, bulletin_no = NULL, bulletin_issued_at = NULL,
      review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
      updated_at = datetime('now', 'localtime')
    WHERE sample_id = ?
  `).run(
    toNum(maskedAfb1), toNum(maskedAfb2), toNum(maskedAfg1), toNum(maskedAfg2), toNum(maskedOta), toNum(maskedM1), toNum(maskedDon), toNum(maskedZea), toNum(maskedFum),
    toNum(maskedLimitAfb1), toNum(maskedLimitAflaSum), toNum(maskedLimitOta), toNum(maskedLimitM1), toNum(maskedLimitDon), toNum(maskedLimitZea), toNum(maskedLimitFum),
    analysisDate || null, notes || null, method || null, equipment || null, ['pending','accepted','not_required','rejected'].includes(qcStatus) ? qcStatus : null,
    qcStatus === 'rejected' ? qcRejectionReason.trim() : null, intakeConfirmed ? 1 : 0, req.session.user.id,
    req.params.sampleId
  );

  const updated = db.prepare(`
    SELECT afb1, afb2, afg1, afg2, ota, m1, don, zea, fum, limit_afb1 AS limitAfb1,
           limit_afla_sum AS limitAflaSum, limit_ota AS limitOta, limit_m1 AS limitM1,
           limit_don AS limitDon, limit_zea AS limitZea, limit_fum AS limitFum, qc_status AS qcStatus
    FROM results WHERE sample_id = ?
  `).get(req.params.sampleId);

  newStatus = evaluateResult({
    afb1: updated.afb1, afb2: updated.afb2, afg1: updated.afg1, afg2: updated.afg2, ota: updated.ota, m1: updated.m1,
    don: updated.don, zea: updated.zea, fum: updated.fum,
    limit_afb1: updated.limitAfb1, limit_afla_sum: updated.limitAflaSum, limit_ota: updated.limitOta, limit_m1: updated.limitM1,
    limit_don: updated.limitDon, limit_zea: updated.limitZea, limit_fum: updated.limitFum, qc_status: updated.qcStatus
  });

  db.prepare('UPDATE samples SET status = ? WHERE id = ?').run(newStatus, req.params.sampleId);

  const auditDetails = JSON.stringify({
    results: { afb1: updated.afb1, afb2: updated.afb2, afg1: updated.afg1, afg2: updated.afg2, ota: updated.ota, m1: updated.m1, don: updated.don, zea: updated.zea, fum: updated.fum },
    limits: { afb1: updated.limitAfb1, aflaSum: updated.limitAflaSum, ota: updated.limitOta, m1: updated.limitM1, don: updated.limitDon, zea: updated.limitZea, fum: updated.limitFum },
    method: method || null,
    qcStatus: qcStatus || null,
    status: newStatus
  });
  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(req.params.sampleId, req.session.user.id, qcStatus === 'rejected' ? 'qc_rejected' : 'results_saved', auditDetails);
  });

  save();
  res.json({ ok: true, status: newStatus });
});

// Deblocare/resetare administrativa - pentru o proba ramasa blocata intre
// operator si validator (de exemplu, trimisa fara toate valorile, inainte
// de introducerea verificarii la sursa). Doar adminul poate folosi aceasta
// ruta, si doar cu un motiv explicit, scris - conform practicii uzuale de
// corectie a inregistrarilor de laborator (autorizata, motivata, trasabila),
// nu o "parola universala" anonima. O proba deja validata NU poate fi
// resetata pe aceasta cale - integritatea unui buletin emis ramane
// neatinsa; pentru o corectie acolo e nevoie de o proba noua.
router.post('/:sampleId/reset', requireRole('admin'), requireSampleAccess('sampleId'), (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) {
    return res.status(400).json({ error: 'Motivul resetării este obligatoriu — va rămâne înregistrat în istoricul probei.' });
  }
  const current = db.prepare('SELECT * FROM results WHERE sample_id = ?').get(req.params.sampleId);
  if (!current) return res.status(404).json({ error: 'Rezultatul probei nu a fost găsit.' });
  if (current.validation_status === 'validated') {
    return res.status(403).json({ error: 'Rezultatul este deja validat și nu poate fi resetat. Pentru o corecție, înregistrează o probă nouă.' });
  }

  db.prepare(`
    UPDATE results SET
      qc_status = 'pending', qc_rejection_reason = NULL,
      review_status = 'pending', reviewed_by = NULL, reviewed_at = NULL, review_note = NULL,
      updated_at = datetime('now', 'localtime')
    WHERE sample_id = ?
  `).run(req.params.sampleId);

  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, 'admin_reset', ?)`)
    .run(req.params.sampleId, req.session.user.id, JSON.stringify({ reason }));

  res.json({ ok: true });
});

// Validarea este un pas separat, dar optional in aceasta etapa. Nu cere echipamente reale.
router.post('/:sampleId/validate', requireRole('validator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const row = db.prepare(`SELECT r.*, s.status, s.is_control_sample AS isControlSample FROM results r JOIN samples s ON s.id = r.sample_id WHERE r.sample_id = ?`).get(req.params.sampleId);
  if (!row) return res.status(404).json({ error: 'Rezultatele probei nu au fost găsite.' });
  if (row.validation_status === 'validated') {
    return res.status(403).json({ error: 'Rezultatul este deja validat. Un buletin validat nu poate fi re-emis sau re-validat.' });
  }
  const resultStatus = evaluateResult(row);
  if (resultStatus !== 'ok' && resultStatus !== 'fail') {
    return res.status(400).json({ error: 'Rezultatul nu poate fi validat până când toate valorile sunt completate.' });
  }
  if (row.qc_status !== 'accepted' && row.qc_status !== 'not_required') {
    if (row.qc_status === 'rejected') {
      return res.status(400).json({ error: 'Proba a fost anulată în urma respingerii QC — nu poate fi validată.' });
    }
    return res.status(400).json({ error: 'Selectează mai întâi statusul QC: acceptat sau neaplicabil.' });
  }
  // Aprobare pe doua niveluri: un coleg diferit trebuie sa fi aprobat
  // rezultatele inainte ca ele sa poata fi validate/emise ca buletin.
  if (row.review_status !== 'approved') {
    return res.status(400).json({ error: 'Rezultatele trebuie aprobate de un coleg (revizuire independentă) înainte de validare.' });
  }
  const bulletinNo = db.transaction(() => {
    // Probele de control (fara client real) NU primesc numar de buletin din
    // secventa clientilor - ar strica trasabilitatea numerotarii la un audit
    // extern. Sunt doar marcate ca finalizate/validate intern.
    if (row.isControlSample) {
      db.prepare(`UPDATE results SET validation_status = 'validated', validated_by = ?, validated_at = datetime('now', 'localtime') WHERE sample_id = ?`)
        .run(req.session.user.id, req.params.sampleId);
      db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
        .run(req.params.sampleId, req.session.user.id, 'control_sample_completed', JSON.stringify({ status: resultStatus }));
      return null;
    }
    const year = new Date().getFullYear();
    // BUG REAL, descoperit si demonstrat cu o simulare: varianta anterioara
    // folosea "ORDER BY id DESC" (ordinea de CREARE a probei) ca sa gaseasca
    // ultimul numar de buletin emis - dar validarea nu se intampla mereu in
    // aceeasi ordine ca inregistrarea (o proba creata mai tarziu poate fi
    // validata mai devreme). Asta putea produce NUMERE DUPLICATE de buletin
    // (confirmat: doua probe primind acelasi BUL-2026-00002). Reparat:
    // gasim valoarea numerica MAXIMA reala dintre toate buletinele anului,
    // indiferent de ordinea de creare a probelor care le-au primit.
    const allThisYear = db.prepare(`SELECT bulletin_no FROM results WHERE bulletin_no LIKE ?`).all(`BUL-${year}-%`);
    let next = 1;
    for (const { bulletin_no } of allThisYear) {
      const m = bulletin_no.match(/BUL-\d{4}-(\d+)/);
      if (m) next = Math.max(next, parseInt(m[1], 10) + 1);
    }
    const no = `BUL-${year}-${String(next).padStart(5, '0')}`;
    db.prepare(`UPDATE results SET validation_status = 'validated', validated_by = ?, validated_at = datetime('now', 'localtime'), bulletin_no = ?, bulletin_issued_at = datetime('now', 'localtime') WHERE sample_id = ?`)
      .run(req.session.user.id, no, req.params.sampleId);
    db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
      .run(req.params.sampleId, req.session.user.id, 'result_validated', JSON.stringify({ status: resultStatus, bulletinNo: no }));
    return no;
  })();
  res.json({ ok: true, validationStatus: 'validated', bulletinNo });
});

// Aprobare independenta a rezultatelor (al doilea nivel de control, inainte
// de validare/emitere buletin). Cine a introdus ultima data rezultatele nu
// poate aproba propria munca - e nevoie de un coleg diferit.
router.post('/:sampleId/review', requireRole('validator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const { decision, note } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'Decizia trebuie să fie "approved" sau "rejected".' });
  }
  const current = db.prepare('SELECT * FROM results WHERE sample_id = ?').get(req.params.sampleId);
  if (!current) return res.status(404).json({ error: 'Rezultatul probei nu a fost găsit.' });
  if (current.validation_status === 'validated') {
    return res.status(403).json({ error: 'Rezultatul este deja validat.' });
  }
  if (current.operator_id && current.operator_id === req.session.user.id) {
    return res.status(403).json({ error: 'Nu poți aproba propriile rezultate introduse — este nevoie de un coleg diferit pentru revizuire.' });
  }
  const resultStatus = evaluateResult(current);
  // O proba trebuie sa fi fost trimisa oficial de operator (QC decis) inainte
  // ca validatorul sa poata actiona pe ea - altfel s-ar putea aproba o proba
  // pe care operatorul inca lucreaza, inchizand-o fara nicio validare
  // posibila si fara ca beneficiarul sa primeasca vreodata un buletin.
  const wasSubmitted = current.qc_status === 'accepted' || current.qc_status === 'not_required';
  if (!wasSubmitted) {
    return res.status(400).json({ error: 'Operatorul nu a trimis încă proba spre validare (control de calitate nedecis) — nu poate fi aprobată sau respinsă.' });
  }
  if (resultStatus === 'cancelled') {
    return res.status(400).json({ error: 'Proba a fost anulată în urma respingerii QC — nu poate fi trimisă spre aprobare sau validare.' });
  }
  // Respingerea trebuie sa functioneze mereu, indiferent de completitudine -
  // e exact mecanismul de recuperare pentru o proba ramasa blocata (trimisa
  // din greseala, incompleta, inainte de a exista aceasta verificare la
  // sursa). Doar APROBAREA cere rezultate complete.
  if (decision === 'approved' && (resultStatus === 'pending' || resultStatus === 'in_analysis')) {
    return res.status(400).json({ error: 'Rezultatele nu sunt complete încă — nu pot fi aprobate. Poți respinge proba pentru a o retrimite operatorului.' });
  }

  db.prepare(`UPDATE results SET review_status = ?, reviewed_by = ?, reviewed_at = datetime('now', 'localtime'), review_note = ? WHERE sample_id = ?`)
    .run(decision, req.session.user.id, String(note || '').trim() || null, req.params.sampleId);

  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(req.params.sampleId, req.session.user.id, `review_${decision}`, JSON.stringify({ note: note || null }));

  res.json({ ok: true, reviewStatus: decision });
});

router.get('/:sampleId/versions', requireRole('owner', 'operator', 'validator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const rows = db.prepare(`
    SELECT v.id, v.version_no AS versionNo, v.snapshot_json AS snapshotJson, v.snapshot_hash AS snapshotHash,
           v.change_reason AS changeReason, v.created_at AS createdAt, u.full_name AS changedByName
    FROM result_versions v LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.sample_id = ? ORDER BY v.version_no ASC
  `).all(req.params.sampleId);

  // Etichete lizibile pentru campurile din snapshot, folosite la afisarea
  // diferentelor intre versiuni succesive.
  const fieldLabels = {
    afb1: 'AFB1', afb2: 'AFB2', afg1: 'AFG1', afg2: 'AFG2', ota: 'OTA', m1: 'M1',
    don: 'DON', zea: 'ZEA', fum: 'Fumonizine',
    limitAfb1: 'Limită AFB1', limitAflaSum: 'Limită sumă aflatoxine', limitOta: 'Limită OTA', limitM1: 'Limită M1',
    limitDon: 'Limită DON', limitZea: 'Limită ZEA', limitFum: 'Limită Fumonizine',
    analysisDate: 'Data analizei', notes: 'Observații', method: 'Metodă analitică', qcStatus: 'QC',
    validationStatus: 'Status validare', bulletinNo: 'Nr. buletin', bulletinIssuedAt: 'Dată emitere buletin'
  };

  // Fiecare snapshot salvat reprezinta starea DINAINTE de modificarea curenta
  // (vezi routes/results.js linia ~213: se salveaza `current`, apoi se aplica
  // update-ul nou). Deci diferenta relevanta pentru versiunea N este intre
  // snapshot-ul ei si urmatorul snapshot cronologic (sau valorile actuale,
  // pentru cea mai recenta versiune salvata).
  const withSnapshots = rows.map(v => ({ ...v, snapshot: JSON.parse(v.snapshotJson) }));

  const current = db.prepare(`
    SELECT afb1, afb2, afg1, afg2, ota, m1, don, zea, fum,
           limit_afb1 AS limitAfb1, limit_afla_sum AS limitAflaSum, limit_ota AS limitOta, limit_m1 AS limitM1,
           limit_don AS limitDon, limit_zea AS limitZea, limit_fum AS limitFum,
           analysis_date AS analysisDate, notes, method, qc_status AS qcStatus,
           validation_status AS validationStatus, bulletin_no AS bulletinNo, bulletin_issued_at AS bulletinIssuedAt
    FROM results WHERE sample_id = ?
  `).get(req.params.sampleId);

  const computeDiff = (before, after) => {
    const changes = [];
    Object.keys(fieldLabels).forEach(key => {
      const a = before ? before[key] : undefined;
      const b = after ? after[key] : undefined;
      const normalize = (v) => (v === undefined ? null : v);
      if (normalize(a) !== normalize(b)) {
        changes.push({ field: key, label: fieldLabels[key], from: normalize(a), to: normalize(b) });
      }
    });
    return changes;
  };

  const withDiffs = withSnapshots.map((v, idx) => {
    const nextSnapshot = idx + 1 < withSnapshots.length ? withSnapshots[idx + 1].snapshot : current;
    return { ...v, changes: computeDiff(v.snapshot, nextSnapshot) };
  });

  // Returnam cea mai recenta versiune prima, ca in interfata.
  withDiffs.reverse();
  res.json({ versions: withDiffs });
});

// Notă: ruta de audit este acum unificată la /api/samples/:sampleId/audit
// (routes/samples.js), care gestionează deja corect toate rolurile,
// inclusiv beneficiarul - evitam doua rute separate cu ordine diferita.



// Verificare publică a unui buletin emis. Nu expune rezultate înainte de validare.


// QR + cod de bare pentru eticheta fizica a probei - disponibil din momentul
// inregistrarii, nu doar dupa validare (spre deosebire de bulletin-qr de mai
// jos). Codeaza direct codul probei, nu un URL - eticheta e pentru
// identificare interna in laborator (lipita pe recipient), nu pentru
// verificare publica a unui buletin care poate nici sa nu existe inca.
// Ambele coduri - QR (citibil direct cu telefonul) si Code 128 (citibil
// instant cu scannere ieftine, dedicate, de banc de laborator) - codeaza
// acelasi text, doar formatul difera dupa cum se scaneaza.
// Certificat de respingere la receptie - "hartia la mana" ceruta explicit:
// ISO/IEC 17025 §7.4.3 cere ca abaterile constatate la primirea probei sa
// fie INREGISTRATE, nu doar comunicate verbal. Motivul scris exista deja in
// baza de date (qc_rejection_reason); acest document il transforma intr-o
// hartie tiparibila, cu toate partile implicate identificate clar.
// Validatorul trebuie sa poata consulta certificatul de respingere la fel ca
// operatorul si beneficiarul - o proba anulata la poarta de intrare e vizibila
// in coada validatorului (fara filtrare pe rol la /queue), dar butonul de
// printare din interfata dadea 403 pentru validator, fiindca fusese omis aici
// din lista de roluri permise. Nu exista niciun motiv real sa i se refuze
// validatorului exact motivul pentru care o proba nu ajunge niciodata la el.
router.get('/:sampleId/rejection-certificate', requireRole('owner', 'operator', 'validator', 'admin'), requireSampleAccess('sampleId'), async (req, res) => {
  const row = db.prepare(`
    SELECT s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate, s.created_at AS createdAt, s.status,
           r.qc_rejection_reason AS qcRejectionReason, r.intake_checked_at AS intakeCheckedAt, r.operator_id AS operatorId,
           ou.full_name AS operatorName, ow.company_name AS companyName, ow.full_name AS ownerName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users ou ON ou.id = r.operator_id
    LEFT JOIN users ow ON ow.id = s.owner_id
    WHERE s.id = ?
  `).get(req.params.sampleId);
  if (!row) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  if (row.status !== 'cancelled' || !row.qcRejectionReason) {
    return res.status(400).json({ error: 'Certificatul e disponibil doar pentru probe respinse, cu motiv înregistrat.' });
  }
  let dataUrl;
  try {
    const QRCode = require('qrcode');
    dataUrl = await QRCode.toDataURL(row.code, { width: 160, margin: 1 });
  } catch (err) {
    dataUrl = null;
  }
  res.json({
    code: row.code, productName: row.productName, category: row.category, sampleDate: row.sampleDate,
    createdAt: row.createdAt, reason: row.qcRejectionReason, operatorName: row.operatorName,
    companyName: row.companyName, ownerName: row.ownerName, dataUrl,
  });
});

router.get('/:sampleId/label-qr', requireRole('owner', 'operator', 'admin'), requireSampleAccess('sampleId'), async (req, res) => {
  const row = db.prepare(`SELECT code, product_name AS productName, category, sample_date AS sampleDate FROM samples WHERE id = ?`).get(req.params.sampleId);
  if (!row) return res.status(404).json({ error: 'Proba nu a fost găsită.' });

  // Codul QR e componenta principala a etichetei - daca generarea lui
  // esueaza (biblioteca lipseste sau o alta eroare neasteptata), eticheta
  // nu are sens fara el, deci raspundem cu o eroare clara, nu cu o pagina
  // de eroare generica pe care clientul n-o poate interpreta ca JSON.
  let dataUrl;
  try {
    const QRCode = require('qrcode');
    dataUrl = await QRCode.toDataURL(row.code, { width: 200, margin: 1 });
  } catch (err) {
    console.error('Generare cod QR esuata pentru eticheta probei:', err.message);
    return res.status(500).json({ error: 'Generarea codului QR a eșuat. Verifică pe server că dependența "qrcode" este instalată (npm install).' });
  }

  // Codul de bare e un supliment, nu o cerinta - daca generarea lui esueaza
  // dintr-un motiv neasteptat (inclusiv daca biblioteca "bwip-js" nu e
  // instalata), eticheta tot functioneaza doar cu QR, nu blocam raspunsul.
  let barcodeDataUrl = null;
  try {
    const bwipjs = require('bwip-js');
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: row.code, scale: 2.4, height: 9, includetext: true, textxalign: 'center', textsize: 9 });
    barcodeDataUrl = `data:image/png;base64,${png.toString('base64')}`;
  } catch (err) {
    console.error('Generare cod de bare esuata pentru eticheta probei (eticheta continua doar cu QR):', err.message);
  }

  res.json({ code: row.code, productName: row.productName, category: row.category, sampleDate: row.sampleDate, dataUrl, barcodeDataUrl });
});

router.get('/:sampleId/bulletin-qr', requireRole('owner', 'operator', 'validator', 'admin'), async (req, res) => {
  const row = db.prepare(`SELECT r.bulletin_no AS bulletinNo, s.owner_id AS ownerId FROM results r JOIN samples s ON s.id = r.sample_id WHERE r.sample_id = ? AND r.validation_status = 'validated'`).get(req.params.sampleId);
  if (!row) return res.status(404).json({ error: 'Buletinul nu este emis.' });
  if (req.session.user.role === 'owner' && row.ownerId !== req.session.user.id) return res.status(403).json({ error: 'Nu ai acces la această probă.' });
  const QRCode = require('qrcode');
  const { findLanAddress } = require('../network-utils');
  // Folosim mereu adresa reala din reteaua locala pentru codul QR, nu adresa
  // pe care a folosit-o clientul curent pentru a se conecta - altfel, daca
  // operatorul lucreaza pe http://localhost:3000, QR-ul ar contine
  // "localhost", care pe telefon se refera la telefon, nu la laptop, si
  // codul ar fi imposibil de scanat cu rezultat util.
  const localPort = req.socket.localPort;
  const lan = findLanAddress();
  const lanHost = lan ? `${lan.address}:${localPort}` : req.get('host');
  const url = `${req.protocol}://${lanHost}/verify/${encodeURIComponent(row.bulletinNo)}`;
  const dataUrl = await QRCode.toDataURL(url, { width: 240, margin: 1 });
  res.json({ url, dataUrl });
});

router.get('/public/verify/:bulletinNo', (req, res) => {
  const row = db.prepare(`
    SELECT r.bulletin_no AS bulletinNo, r.bulletin_issued_at AS issuedAt,
           r.validation_status AS validationStatus, r.validated_at AS validatedAt,
           r.analysis_date AS analysisDate, r.method, r.equipment,
           r.afb1, r.afb2, r.afg1, r.afg2, r.ota, r.m1, r.don, r.zea, r.fum,
           r.limit_afb1 AS limitAfb1, r.limit_afla_sum AS limitAflaSum, r.limit_ota AS limitOta, r.limit_m1 AS limitM1, r.limit_don AS limitDon, r.limit_zea AS limitZea, r.limit_fum AS limitFum,
           s.code, s.product_name AS productName, s.category, s.status, s.requested_tests AS requestedTestsJson,
           u.full_name AS validatedByName
    FROM results r
    JOIN samples s ON s.id = r.sample_id
    LEFT JOIN users u ON u.id = r.validated_by
    WHERE r.bulletin_no = ? AND r.validation_status = 'validated'
  `).get(req.params.bulletinNo);
  if (!row) return res.status(404).json({ error: 'Buletin inexistent sau neverificat.' });

  const afVals = [row.afb1, row.afb2, row.afg1, row.afg2];
  const afSum = afVals.every(v => v !== null && v !== undefined) ? afVals.reduce((a, b) => a + b, 0) : null;

  let requestedTests = null;
  try { requestedTests = row.requestedTestsJson ? JSON.parse(row.requestedTestsJson) : null; } catch (_) { requestedTests = null; }

  res.json({
    bulletin: {
      bulletinNo: row.bulletinNo,
      issuedAt: row.issuedAt,
      code: row.code,
      productName: row.productName,
      category: row.category,
      requestedTests,
      analysisDate: row.analysisDate,
      method: row.method,
      equipment: row.equipment,
      status: row.status,
      validatedAt: row.validatedAt,
      validatedByName: row.validatedByName,
      results: {
        afb1: row.afb1, afb2: row.afb2, afg1: row.afg1, afg2: row.afg2, ota: row.ota, m1: row.m1, don: row.don, zea: row.zea, fum: row.fum,
        aflaSum: afSum
      },
      limits: {
        afb1: row.limitAfb1, aflaSum: row.limitAflaSum, ota: row.limitOta, m1: row.limitM1, don: row.limitDon, zea: row.limitZea, fum: row.limitFum
      }
    }
  });
});

module.exports = router;

// Lucrari neconforme: flux minimal, aliniat cu ISO/IEC 17025 cl. 7.10.
// Nu este un modul CAPA complet si nu inlocuieste procedura laboratorului.
router.get('/:sampleId/nonconforming', requireRole('operator', 'validator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const rows = db.prepare(`
    SELECT n.id, n.reason, n.risk_level AS riskLevel, n.action, n.impact_assessment AS impactAssessment,
           n.customer_notification AS customerNotification, n.disposition, n.opened_at AS openedAt,
           n.closed_at AS closedAt, u.full_name AS openedByName, cu.full_name AS closedByName
    FROM nonconforming_work n
    LEFT JOIN users u ON u.id = n.opened_by
    LEFT JOIN users cu ON cu.id = n.closed_by
    WHERE n.sample_id = ? ORDER BY n.opened_at DESC, n.id DESC
  `).all(req.params.sampleId);
  res.json({ cases: rows });
});

router.post('/:sampleId/nonconforming', requireRole('operator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const sample = db.prepare('SELECT id FROM samples WHERE id = ?').get(req.params.sampleId);
  if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
  const reason = String(req.body.reason || '').trim();
  const action = String(req.body.action || '').trim();
  const impactAssessment = String(req.body.impactAssessment || '').trim() || null;
  const customerNotification = String(req.body.customerNotification || '').trim() || null;
  const riskLevel = ['low','medium','high'].includes(req.body.riskLevel) ? req.body.riskLevel : null;
  if (!reason || !action || !riskLevel) return res.status(400).json({ error: 'Motivul, nivelul de risc și acțiunea sunt obligatorii.' });
  const info = db.prepare(`INSERT INTO nonconforming_work
    (sample_id, opened_by, reason, risk_level, action, impact_assessment, customer_notification)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(req.params.sampleId, req.session.user.id, reason, riskLevel, action, impactAssessment, customerNotification);
  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(req.params.sampleId, req.session.user.id, 'nonconforming_work_opened', JSON.stringify({ id: info.lastInsertRowid, riskLevel, reason, action }));
  res.json({ ok: true, id: info.lastInsertRowid });
});

router.post('/:sampleId/nonconforming/:id/close', requireRole('operator', 'admin'), requireSampleAccess('sampleId'), (req, res) => {
  const disposition = ['accepted','retest','closed'].includes(req.body.disposition) ? req.body.disposition : null;
  if (!disposition) return res.status(400).json({ error: 'Selectează o decizie validă.' });
  const row = db.prepare('SELECT id FROM nonconforming_work WHERE id = ? AND sample_id = ?').get(req.params.id, req.params.sampleId);
  if (!row) return res.status(404).json({ error: 'Înregistrarea nu a fost găsită.' });
  db.prepare(`UPDATE nonconforming_work SET disposition=?, closed_by=?, closed_at=datetime('now', 'localtime') WHERE id=?`)
    .run(disposition, req.session.user.id, req.params.id);
  db.prepare(`INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)`)
    .run(req.params.sampleId, req.session.user.id, 'nonconforming_work_closed', JSON.stringify({ id: row.id, disposition }));
  res.json({ ok: true });
});
