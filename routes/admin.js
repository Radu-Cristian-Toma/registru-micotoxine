const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db/database');
require('../db/session-store'); // creează tabela de sesiuni, folosită la închiderea sesiunilor la resetare
const { logEvent } = require('../db/audit');
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

  logEvent(req.session.user.id, 'account_created', { newUserId: info.lastInsertRowid, email: email.toLowerCase().trim(), role: 'operator' });
  res.json({ id: info.lastInsertRowid, email: email.toLowerCase().trim(), fullName: fullName.trim(), role: 'operator' });
});

// D3: resetarea parolei unui cont de către administrator. Se generează o parolă temporară, afișată o
// singură dată; contul trebuie să o schimbe la prima autentificare (middleware/password-gate.js), iar
// sesiunile lui deschise se închid. Administratorul nu își resetează propriul cont (folosește schimbarea parolei).
router.post('/users/reset-password', requireRole('admin'), (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'Introdu adresa de email a contului.' });
  const user = db.prepare('SELECT id, email, role, full_name AS fullName FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Nu există un cont cu acest email.' });
  if (user.id === req.session.user.id) return res.status(400).json({ error: 'Propria parolă se schimbă din butonul „Parola”, nu prin resetare.' });
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let temp = '';
  for (let i = 0; i < 14; i++) temp += alphabet[crypto.randomInt(alphabet.length)];
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(bcrypt.hashSync(temp, 12), user.id);
    // Închide sesiunile deschise ale contului (store-ul păstrează JSON-ul sesiunii).
    db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.user.id') = ?").run(user.id);
    logEvent(req.session.user.id, 'password_reset_by_admin', { userId: user.id, role: user.role });
  })();
  res.json({ ok: true, email: user.email, fullName: user.fullName, role: user.role, temporaryPassword: temp });
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

  logEvent(req.session.user.id, 'account_created', { newUserId: info.lastInsertRowid, email: email.toLowerCase().trim(), role: 'validator' });
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

  // Jurnalizam CE s-a schimbat (nume de campuri; imaginile doar ca „modificat"),
  // nu si continutul imaginilor.
  const prevSettings = db.prepare('SELECT * FROM lab_settings WHERE id = 1').get() || {};
  const nv = (v) => ((v || '').trim() || null);
  const changedFields = [];
  [['institution_name', nv(institutionName)], ['institution_address', nv(institutionAddress)], ['institution_email', trimmedEmail || null],
   ['institution_phone', nv(institutionPhone)], ['logo_data_url', logoDataUrl || null], ['signature_data_url', signatureDataUrl || null],
   ['signature_name', nv(signatureName)], ['signature_role', nv(signatureRole)], ['stamp_data_url', stampDataUrl || null]]
    .forEach(([col, val]) => { if ((prevSettings[col] ?? null) !== val) changedFields.push(col); });

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
  logEvent(req.session.user.id, 'lab_settings_updated', { changedFields });

  res.json({ ok: true });
});

// Politici de laborator (etapa C3/C4): separarea sarcinilor (L17), retentia dosarelor (L12),
// intervalul maxim de la ultimul control QC (L13). Citirea e permisa oricarui utilizator
// autentificat (interfata adapteaza ecranele); modificarea doar adminului, cu motiv scris
// cand separarea sarcinilor se relaxeaza, si cu jurnalizare.
router.get('/policy', requireLogin, (req, res) => {
  const r = db.prepare('SELECT strict_roles, retention_years, qc_max_age_days FROM lab_settings WHERE id = 1').get() || {};
  res.json({ policy: { strictRoles: r.strict_roles !== 0, retentionYears: r.retention_years ?? null, qcMaxAgeDays: r.qc_max_age_days ?? 7 } });
});

router.put('/policy', requireRole('admin'), (req, res) => {
  const prev = db.prepare('SELECT strict_roles, retention_years, qc_max_age_days FROM lab_settings WHERE id = 1').get() || {};
  const next = { strict_roles: prev.strict_roles ?? 1, retention_years: prev.retention_years ?? null, qc_max_age_days: prev.qc_max_age_days ?? 7 };
  const { strictRoles, retentionYears, qcMaxAgeDays, reason } = req.body;
  if (strictRoles !== undefined) next.strict_roles = (strictRoles === true || strictRoles === 'true' || strictRoles === 1) ? 1 : 0;
  if (retentionYears !== undefined) {
    if (retentionYears === null || retentionYears === '') next.retention_years = null;
    else {
      const n = Number(retentionYears);
      if (!Number.isInteger(n) || n < 1 || n > 100) return res.status(400).json({ error: 'Perioada de retenție trebuie să fie un număr întreg de ani între 1 și 100.' });
      next.retention_years = n;
    }
  }
  if (qcMaxAgeDays !== undefined) {
    const n = Number(qcMaxAgeDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) return res.status(400).json({ error: 'Intervalul maxim de la ultimul control QC trebuie să fie între 0 și 365 de zile (0 = fără avertisment).' });
    next.qc_max_age_days = n;
  }
  const reasonText = String(reason || '').trim();
  const relaxing = prev.strict_roles !== 0 && next.strict_roles === 0;
  if (relaxing && !reasonText) return res.status(400).json({ error: 'Relaxarea separării sarcinilor necesită un motiv scris, care rămâne în jurnalul de audit.' });
  const changed = {};
  for (const k of Object.keys(next)) if ((prev[k] ?? null) !== next[k]) changed[k] = { from: prev[k] ?? null, to: next[k] };
  db.prepare(`UPDATE lab_settings SET strict_roles = ?, retention_years = ?, qc_max_age_days = ?, updated_by = ?, updated_at = datetime('now', 'localtime') WHERE id = 1`)
    .run(next.strict_roles, next.retention_years, next.qc_max_age_days, req.session.user.id);
  if (Object.keys(changed).length) logEvent(req.session.user.id, 'policy_updated', { changed, reason: reasonText || null });
  res.json({ ok: true, policy: { strictRoles: next.strict_roles !== 0, retentionYears: next.retention_years, qcMaxAgeDays: next.qc_max_age_days } });
});

module.exports = router;
