const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');
const { loginRateLimit, recordFailedAttempt, clearAttempts, accountLocked, recordFailedAccount, clearAccount } = require('../middleware/rate-limit');
const { logEvent } = require('../db/audit');
require('../db/session-store'); // tabela de sesiuni (închiderea sesiunilor la schimbarea parolei)

const router = express.Router();

// Inregistrare - doar pentru proprietari de probe. Operatorii sunt adaugati de admin.
router.post('/register', (req, res) => {
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
    VALUES (?, ?, ?, 'owner')
  `).run(email.toLowerCase().trim(), hash, fullName.trim());

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Nu s-a putut inițializa sesiunea.' });
    req.session.user = { id: info.lastInsertRowid, email: email.toLowerCase().trim(), fullName: fullName.trim(), role: 'owner' };
    // regenerate() sterge orice era pe sesiunea veche, inclusiv token-ul CSRF
    // emis pentru sesiunea anonima - reemis aici, pe noua sesiune.
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
  });
});

const LOCK_MESSAGE = 'Prea multe încercări de autentificare. Încearcă din nou peste 15 minute.';

router.post('/login', loginRateLimit, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Completează email și parolă.' });
  }
  const normalized = String(email).toLowerCase().trim();

  // D3: blocare pe cont (în plus față de limita pe IP); răspunsul nu diferă pentru conturi inexistente.
  if (accountLocked(normalized)) {
    return res.status(429).json({ error: LOCK_MESSAGE });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalized);
  if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailedAttempt(req);
    const lockedNow = recordFailedAccount(normalized);
    // Jurnal de securitate: nu se păstrează textul introdus (poate fi o parolă tastată în câmpul de email).
    logEvent(user ? user.id : null, 'login_failed', { knownAccount: !!user });
    if (lockedNow) logEvent(user ? user.id : null, 'account_locked', { knownAccount: !!user, minutes: 15 });
    return res.status(401).json({ error: 'Email sau parolă incorectă.' });
  }
  clearAttempts(req);
  clearAccount(normalized);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Nu s-a putut inițializa sesiunea.' });
    req.session.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role, mustChangePassword: !!user.must_change_password };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    logEvent(user.id, 'login_success', null);
    res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
  });
});

// D3: schimbarea parolei de către utilizatorul autentificat. Regula de lungime este cea existentă
// (minimum 8 caractere, ca la înregistrare); nu se introduce o politică nouă.
router.post('/change-password', requireLogin, loginRateLimit, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Completează parola curentă și parola nouă.' });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: 'Parola trebuie să aibă minimum 8 caractere.' });
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.session.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    recordFailedAttempt(req);
    logEvent(req.session.user.id, 'password_change_failed', null);
    return res.status(401).json({ error: 'Parola curentă este incorectă.' });
  }
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Parola nouă trebuie să difere de cea curentă.' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), user.id);
  logEvent(user.id, 'password_changed', null);
  clearAttempts(req);
  // Toate sesiunile contului se închid (inclusiv cea curentă, care se reînnoiește imediat mai jos).
  db.prepare("DELETE FROM sessions WHERE json_extract(data, '$.user.id') = ?").run(user.id);
  const prev = req.session.user;
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Nu s-a putut reînnoi sesiunea.' });
    req.session.user = { ...prev, mustChangePassword: false };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.json({ ok: true, user: req.session.user, csrfToken: req.session.csrfToken });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Etapa E: informații despre instanță, afișate în subsolul aplicației (licență, cod sursă) și bannerul DEMO.
function instanceInfo() {
  return {
    version: require('../package.json').version,
    license: 'AGPL-3.0-or-later',
    sourceUrl: (process.env.LIMS_SOURCE_URL || '').trim() || null,
    demo: require('../config').isDemo()
  };
}

router.get('/me', (req, res) => {
  const role = req.session.user?.role || null;
  const permissions = {
    viewOwnSamples: role === 'owner',
    createSample: role === 'owner',
    workQueue: role === 'operator' || role === 'admin',
    editResults: role === 'operator' || role === 'admin',
    validateResults: role === 'operator' || role === 'admin',
    manageOperators: role === 'admin',
    systemValidation: role === 'admin',
    qualityAdministration: role === 'admin'
  };
  res.json({ user: req.session.user || null, permissions, csrfToken: req.session.csrfToken, instance: instanceInfo() });
});

// Genereaza un cod QR care duce la pagina de autentificare a aplicatiei,
// util pentru a deschide rapid aplicatia pe telefon (ex. in laborator).
// Codul QR NU contine parola sau un token de sesiune - scanarea lui
// deschide doar ecranul de login, unde utilizatorul introduce credentialele normal.
router.get('/qr', requireLogin, async (req, res) => {
  try {
    const { findLanAddress } = require('../network-utils');
    // Nu folosim orbeste host-ul cu care s-a conectat clientul curent -
    // daca utilizatorul deschide aplicatia prin "localhost", codul QR ar
    // contine "localhost", care pe telefon se refera la telefon, nu la
    // laptop, si ar fi imposibil de folosit efectiv de pe alt dispozitiv.
    const lan = findLanAddress();
    const host = lan ? `${lan.address}:${req.socket.localPort}` : req.get('host');
    const appUrl = `${req.protocol}://${host}/`;
    const dataUrl = await QRCode.toDataURL(appUrl, {
      width: 300,
      margin: 1,
      color: { dark: '#1C2B24', light: '#FFFFFF' }
    });
    res.json({ dataUrl, url: appUrl });
  } catch (err) {
    res.status(500).json({ error: 'Nu s-a putut genera codul QR.' });
  }
});

// Datele firmei beneficiarului - separate de /me, ca sa poata fi editate
// oricand, fara sa depinda de ce era stocat in sesiune la login. Doar
// rolul "owner" le poate citi/edita pe ale sale proprii.
router.get('/company', requireLogin, (req, res) => {
  if (req.session.user.role !== 'owner') return res.status(403).json({ error: 'Doar beneficiarul își poate vedea datele firmei.' });
  const row = db.prepare(`SELECT company_name AS companyName, company_reg_no AS companyRegNo, company_address AS companyAddress, company_contact AS companyContact, company_type AS companyType FROM users WHERE id = ?`).get(req.session.user.id);
  res.json(row || {});
});

router.put('/company', requireLogin, (req, res) => {
  if (req.session.user.role !== 'owner') return res.status(403).json({ error: 'Doar beneficiarul își poate edita datele firmei.' });
  const { companyName, companyRegNo, companyAddress, companyContact, companyType } = req.body;
  const validTypes = ['firma', 'pfa', 'persoana_fizica'];
  db.prepare(`UPDATE users SET company_name = ?, company_reg_no = ?, company_address = ?, company_contact = ?, company_type = ? WHERE id = ?`)
    .run(
      companyName ? String(companyName).trim() : null,
      companyRegNo ? String(companyRegNo).trim() : null,
      companyAddress ? String(companyAddress).trim() : null,
      companyContact ? String(companyContact).trim() : null,
      validTypes.includes(companyType) ? companyType : 'firma',
      req.session.user.id
    );
  res.json({ ok: true });
});

module.exports = router;
