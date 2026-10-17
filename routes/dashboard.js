const express = require('express');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { evaluateResult } = require('../db/evaluation');

const router = express.Router();

router.get('/', requireRole('operator', 'validator', 'admin'), (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM samples').get().n;
  const pending = db.prepare("SELECT COUNT(*) AS n FROM samples WHERE status = 'pending'").get().n;
  const inAnalysis = db.prepare("SELECT COUNT(*) AS n FROM samples WHERE status = 'in_analysis'").get().n;
  const conform = db.prepare("SELECT COUNT(*) AS n FROM samples WHERE status = 'ok'").get().n;
  const fail = db.prepare("SELECT COUNT(*) AS n FROM samples WHERE status = 'fail'").get().n;
  const cancelled = db.prepare("SELECT COUNT(*) AS n FROM samples WHERE status = 'cancelled'").get().n;
  const validated = db.prepare("SELECT COUNT(*) AS n FROM results WHERE validation_status = 'validated'").get().n;
  const qcAccepted = db.prepare("SELECT COUNT(*) AS n FROM results WHERE qc_status = 'accepted'").get().n;

  const recent = db.prepare(`
    SELECT s.id, s.code, s.product_name AS productName, s.category, s.sample_date AS sampleDate,
           s.status, s.created_at AS createdAt, r.analysis_date AS analysisDate,
           r.validation_status AS validationStatus, r.qc_status AS qcStatus,
           u.full_name AS ownerName
    FROM samples s
    LEFT JOIN results r ON r.sample_id = s.id
    LEFT JOIN users u ON u.id = s.owner_id
    ORDER BY s.created_at DESC
    LIMIT 8
  `).all().map(r => ({ ...r, status: r.status || evaluateResult({ ...r, qc_status: r.qcStatus }) }));

  res.json({ metrics: { total, pending, inAnalysis, conform, fail, cancelled, validated, qcAccepted }, recent });
});

// Notă: audit-ul este servit unificat de /api/samples/:sampleId/audit -
// aceasta a treia rută, neapelata niciodata din interfata, a fost eliminata.

module.exports = router;
