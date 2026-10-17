const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Doar admin poate crea conturi de operator.
router.post('/operators', requireRole('admin'), (req, res) => {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Completează email, parolă și nume complet.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Parola trebuie să aibă minimum 8 caractere.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Există deja un cont cu acest email.' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES (?, ?, ?, 'operator')
  `).run(email.toLowerCase().trim(), hash, fullName.trim());

  res.json({ id: info.lastInsertRowid, email: email.toLowerCase().trim(), fullName: fullName.trim(), role: 'operator' });
});

router.get('/operators', requireRole('admin'), (req, res) => {
  const operators = db.prepare(`
    SELECT id, email, full_name AS fullName, created_at AS createdAt
    FROM users WHERE role = 'operator'
    ORDER BY created_at DESC
  `).all();
  res.json({ operators });
});

// Contul de validator este explicit distinct de cel de operator - un
// validator revizuieste/aproba si valideaza/emite buletinul (pune
// semnatura/stampila cu valoare legala), spre deosebire de operator, care
// introduce rezultatele si confirma controlul de calitate al aparatului.
router.post('/validators', requireRole('admin'), (req, res) => {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Completează email, parolă și nume complet.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Parola trebuie să aibă minimum 8 caractere.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Există deja un cont cu acest email.' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role)
    VALUES (?, ?, ?, 'validator')
  `).run(email.toLowerCase().trim(), hash, fullName.trim());

  res.json({ id: info.lastInsertRowid, email: email.toLowerCase().trim(), fullName: fullName.trim(), role: 'validator' });
});

router.get('/validators', requireRole('admin'), (req, res) => {
  const validators = db.prepare(`
    SELECT id, email, full_name AS fullName, created_at AS createdAt
    FROM users WHERE role = 'validator'
    ORDER BY created_at DESC
  `).all();
  res.json({ validators });
});

// Setarile de identitate vizuala a laboratorului (logo, antet, semnatura
// grafica, stampila). Citirea e permisa oricarui utilizator autentificat,
// fiindca buletinul trebuie sa le afiseze indiferent de rol; scrierea
// ramane exclusiv pentru admin.
const { requireLogin } = require('../middleware/auth');

router.get('/lab-settings', requireLogin, (req, res) => {
  const row = db.prepare(`
    SELECT institution_name AS institutionName, institution_address AS institutionAddress,
           institution_email AS institutionEmail, institution_phone AS institutionPhone,
           logo_data_url AS logoDataUrl, signature_data_url AS signatureDataUrl,
           signature_name AS signatureName, signature_role AS signatureRole,
           stamp_data_url AS stampDataUrl, updated_at AS updatedAt
    FROM lab_settings WHERE id = 1
  `).get();
  res.json({ settings: row || {} });
});

// Limita de dimensiune per imagine (aproximativ, dupa decodare base64) -
// suficienta pentru un logo/semnatura comprimata, fara sa umple inutil baza
// de date SQLite cu fisiere mari.
const MAX_IMAGE_BYTES = 600 * 1024;

function validateDataUrl(value, fieldLabel) {
  if (!value) return null;
  // Verificare stricta pe tipul MIME - un simplu prefix "data:image/" ar fi
  // acceptat si "data:image/svg+xml" (SVG poate contine <script> embedat).
  // Restrans explicit la PNG/JPEG, singurele acceptate si de formularul din
  // interfata (accept="image/png,image/jpeg") - cererea directa catre API,
  // ocolind formularul, nu mai poate trece de aceasta verificare.
  if (typeof value !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(value)) {
    return `${fieldLabel} trebuie să fie o imagine validă (PNG sau JPG).`;
  }
  const approxBytes = Math.ceil((value.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return `${fieldLabel} este prea mare (limită aproximativ 600 KB) — comprimă imaginea înainte de încărcare.`;
  }
  return null;
}

router.put('/lab-settings', requireRole('admin'), (req, res) => {
  const { institutionName, institutionAddress, institutionEmail, institutionPhone, logoDataUrl, signatureDataUrl, signatureName, signatureRole, stampDataUrl } = req.body;

  for (const [value, label] of [[logoDataUrl, 'Logo-ul'], [signatureDataUrl, 'Semnătura grafică'], [stampDataUrl, 'Ștampila']]) {
    const err = validateDataUrl(value, label);
    if (err) return res.status(400).json({ error: err });
  }

  const trimmedEmail = (institutionEmail || '').trim();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: 'Adresa de email nu este validă.' });
  }

  db.prepare(`
    UPDATE lab_settings SET
      institution_name = ?, institution_address = ?, institution_email = ?, institution_phone = ?, logo_data_url = ?,
      signature_data_url = ?, signature_name = ?, signature_role = ?, stamp_data_url = ?,
      updated_by = ?, updated_at = datetime('now', 'localtime')
    WHERE id = 1
  `).run(
    (institutionName || '').trim() || null,
    (institutionAddress || '').trim() || null,
    trimmedEmail || null,
    (institutionPhone || '').trim() || null,
    logoDataUrl || null,
    signatureDataUrl || null,
    (signatureName || '').trim() || null,
    (signatureRole || '').trim() || null,
    stampDataUrl || null,
    req.session.user.id
  );

  res.json({ ok: true });
});

module.exports = router;
