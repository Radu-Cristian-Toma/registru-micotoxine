const express = require('express');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireRole('admin'), (req, res) => {
  const tests = db.prepare(`
    SELECT t.id, t.code, t.title, t.area, t.expected, t.result, t.note,
           t.executed_by AS executedBy, t.executed_at AS executedAt, u.full_name AS executedByName
    FROM system_validation_tests t
    LEFT JOIN users u ON u.id = t.executed_by
    ORDER BY t.id
  `).all();
  const summary = {
    total: tests.length,
    passed: tests.filter(t => t.result === 'passed').length,
    failed: tests.filter(t => t.result === 'failed').length,
    notRun: tests.filter(t => !t.result || t.result === 'not_run').length
  };
  res.json({ tests, summary });
});

router.post('/:id', requireRole('admin'), (req, res) => {
  const result = ['passed', 'failed', 'not_run'].includes(req.body.result) ? req.body.result : null;
  if (!result) return res.status(400).json({ error: 'Rezultatul trebuie să fie trecut, eșuat sau netestat.' });
  const note = String(req.body.note || '').trim() || null;
  const test = db.prepare('SELECT id, code FROM system_validation_tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Testul de validare nu a fost găsit.' });
  db.prepare(`UPDATE system_validation_tests
    SET result = ?, note = ?, executed_by = ?, executed_at = datetime('now', 'localtime')
    WHERE id = ?`).run(result, note, req.session.user.id, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
