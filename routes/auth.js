const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');
const { loginRateLimit, recordFailedAttempt, clearAttempts } = require('../middleware/rate-limit');

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

router.post('/login', loginRateLimit, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Completează email și parolă.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailedAttempt(req);
    return res.status(401).json({ error: 'Email sau parolă incorectă.' });
  }
  clearAttempts(req);

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Nu s-a putut inițializa sesiunea.' });
    req.session.user = { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

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
  res.json({ user: req.session.user || null, permissions, csrfToken: req.session.csrfToken });
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
