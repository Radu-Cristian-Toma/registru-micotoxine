// Etapa D1: loturi cu mai multe probe de laborator (Reg. (UE) 2023/2782, anexa I, partea II, C.8 și D.8).
// Un lot grupează probele aceluiași beneficiar; decizia de lot se calculează cu judgeLot().
// Constituirea lotului se face înainte de validarea oricărei probe; după aceea este înghețat.
const express = require('express');
const db = require('../db/database');
const { logEvent } = require('../db/audit');
const { evaluateLot } = require('../db/lots');
const { requireRole, requireSampleAccess } = require('../middleware/auth');
const Core = require('../public/decision-core');

const router = express.Router();
const STAFF = ['operator', 'validator', 'admin'];
const MAX_MEMBERS = 10;

const text = (v, n) => { const t = String(v === undefined || v === null ? '' : v).trim().slice(0, n); return t || null; };

function nextLotCode() {
  const year = new Date().getFullYear();
  let next = 1;
  for (const { code } of db.prepare('SELECT code FROM sample_lots WHERE code LIKE ?').all(`LOT-${year}-%`)) {
    const m = code.match(/LOT-\d{4}-(\d+)/);
    if (m) next = Math.max(next, parseInt(m[1], 10) + 1);
  }
  return `LOT-${year}-${String(next).padStart(4, '0')}`;
}

// Verifică probele propuse pentru un lot; întoarce { error } sau { samples }.
function checkSamples(ids, lotId) {
  if (!Array.isArray(ids) || ids.some(i => !Number.isInteger(i) || i <= 0)) return { error: 'Lista de probe este invalidă.' };
  if (new Set(ids).size !== ids.length) return { error: 'O probă apare de mai multe ori în listă.' };
  const samples = [];
  for (const id of ids) {
    const s = db.prepare(`SELECT s.id, s.code, s.owner_id AS ownerId, s.lot_id AS lotId, s.status, s.is_control_sample AS isControl, r.validation_status AS validationStatus
      FROM samples s LEFT JOIN results r ON r.sample_id = s.id WHERE s.id = ?`).get(id);
    if (!s) return { error: `Proba cu id ${id} nu există.` };
    if (s.isControl) return { error: `Proba ${s.code} este probă de control și nu poate face parte dintr-un lot.` };
    if (s.status === 'cancelled') return { error: `Proba ${s.code} este anulată.` };
    if (s.lotId && s.lotId !== lotId) return { error: `Proba ${s.code} face deja parte dintr-un alt lot.` };
    if (s.validationStatus === 'validated') return { error: `Proba ${s.code} este deja validată; lotul se constituie înainte de validare.` };
    samples.push(s);
  }
  if (new Set(samples.map(s => s.ownerId)).size > 1) return { error: 'Probele unui lot trebuie să aparțină aceluiași beneficiar.' };
  return { samples };
}

router.get('/', requireRole(...STAFF), (req, res) => {
  const rows = db.prepare('SELECT id FROM sample_lots ORDER BY id DESC LIMIT 200').all();
  res.json({ lots: rows.map(r => { const e = evaluateLot(r.id); return { ...e.lot, members: e.members.length, final: e.final, frozen: e.frozen, overall: e.overall }; }) });
});

router.post('/', requireRole('operator', 'admin'), (req, res) => {
  const b = req.body || {};
  if (!Core.LOT_MODES.includes(b.lotMode)) return res.status(400).json({ error: 'Modul de lot trebuie să fie „none_exceeds” sau „average”.' });
  const ids = (b.sampleIds || []).map(Number);
  if (ids.length < 2 || ids.length > MAX_MEMBERS) return res.status(400).json({ error: `Un lot are între 2 și ${MAX_MEMBERS} probe de laborator.` });
  const chk = checkSamples(ids, null);
  if (chk.error) return res.status(400).json({ error: chk.error });
  let code = text(b.code, 40);
  if (code && db.prepare('SELECT 1 FROM sample_lots WHERE code = ?').get(code)) return res.status(409).json({ error: 'Există deja un lot cu acest cod.' });
  const productName = text(b.productName, 200) || (db.prepare('SELECT product_name AS p FROM samples WHERE id = ?').get(ids[0]) || {}).p || null;
  const lotId = db.transaction(() => {
    code = code || nextLotCode();
    const id = db.prepare('INSERT INTO sample_lots (code, product_name, lot_mode, note, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(code, productName, b.lotMode, text(b.note, 500), req.session.user.id).lastInsertRowid;
    for (const s of chk.samples) {
      db.prepare('UPDATE samples SET lot_id = ? WHERE id = ?').run(id, s.id);
      logEvent(req.session.user.id, 'lot_member_added', { lotId: id, lotCode: code }, s.id);
    }
    logEvent(req.session.user.id, 'lot_created', { lotId: id, code, lotMode: b.lotMode, sampleIds: ids });
    return id;
  })();
  res.json({ ok: true, id: lotId, code });
});

router.get('/by-sample/:sampleId', requireRole('owner', ...STAFF), requireSampleAccess('sampleId'), (req, res) => {
  const row = db.prepare('SELECT lot_id AS lotId FROM samples WHERE id = ?').get(req.params.sampleId);
  if (!row || !row.lotId) return res.status(404).json({ error: 'Proba nu face parte dintr-un lot.' });
  return sendLot(req, res, row.lotId);
});

function sendLot(req, res, lotId) {
  const e = evaluateLot(lotId);
  if (!e) return res.status(404).json({ error: 'Lotul nu există.' });
  if (req.session.user.role === 'owner') {
    // Beneficiarul vede decizia de lot numai după validarea tuturor probelor.
    if (!e.members.some(m => m.ownerId === req.session.user.id)) return res.status(403).json({ error: 'Nu ai acces la acest lot.' });
    if (!e.final) return res.json({ lot: { code: e.lot.code, lotMode: e.lot.lotMode }, final: false, members: e.members.length });
  }
  res.json(e);
}

router.get('/:id', requireRole(...STAFF), (req, res) => sendLot(req, res, Number(req.params.id)));

router.post('/:id/members', requireRole('operator', 'admin'), (req, res) => {
  const lotId = Number(req.params.id);
  const e = evaluateLot(lotId);
  if (!e) return res.status(404).json({ error: 'Lotul nu există.' });
  if (e.frozen) return res.status(409).json({ error: 'Lotul este înghețat: cel puțin o probă a fost validată.' });
  if (e.members.length >= MAX_MEMBERS) return res.status(400).json({ error: `Un lot are cel mult ${MAX_MEMBERS} probe.` });
  const id = Number((req.body || {}).sampleId);
  const chk = checkSamples([id], lotId);
  if (chk.error) return res.status(400).json({ error: chk.error });
  const owner = e.members[0] && e.members[0].ownerId;
  if (owner && chk.samples[0].ownerId !== owner) return res.status(400).json({ error: 'Proba aparține altui beneficiar decât cele ale lotului.' });
  db.transaction(() => {
    db.prepare('UPDATE samples SET lot_id = ? WHERE id = ?').run(lotId, id);
    logEvent(req.session.user.id, 'lot_member_added', { lotId, lotCode: e.lot.code }, id);
  })();
  res.json({ ok: true });
});

router.delete('/:id/members/:sampleId', requireRole('operator', 'admin'), (req, res) => {
  const lotId = Number(req.params.id);
  const e = evaluateLot(lotId);
  if (!e) return res.status(404).json({ error: 'Lotul nu există.' });
  if (e.frozen) return res.status(409).json({ error: 'Lotul este înghețat: cel puțin o probă a fost validată.' });
  const sid = Number(req.params.sampleId);
  if (!e.members.some(m => m.sampleId === sid)) return res.status(404).json({ error: 'Proba nu face parte din acest lot.' });
  if (e.members.length <= 2) return res.status(400).json({ error: 'Un lot are cel puțin 2 probe; desființați lotul în loc să scoateți proba.' });
  db.transaction(() => {
    db.prepare('UPDATE samples SET lot_id = NULL WHERE id = ?').run(sid);
    logEvent(req.session.user.id, 'lot_member_removed', { lotId, lotCode: e.lot.code }, sid);
  })();
  res.json({ ok: true });
});

router.delete('/:id', requireRole('operator', 'admin'), (req, res) => {
  const lotId = Number(req.params.id);
  const e = evaluateLot(lotId);
  if (!e) return res.status(404).json({ error: 'Lotul nu există.' });
  if (e.frozen) return res.status(409).json({ error: 'Lotul este înghețat: cel puțin o probă a fost validată.' });
  db.transaction(() => {
    db.prepare('UPDATE samples SET lot_id = NULL WHERE lot_id = ?').run(lotId);
    db.prepare('DELETE FROM sample_lots WHERE id = ?').run(lotId);
    logEvent(req.session.user.id, 'lot_dissolved', { lotId, code: e.lot.code, sampleIds: e.members.map(m => m.sampleId) });
  })();
  res.json({ ok: true });
});

module.exports = router;
