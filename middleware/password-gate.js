// Etapa D3: un cont a cărui parolă a fost resetată de administrator (parolă temporară) trebuie să
// și-o schimbe înainte de orice altă acțiune. Până atunci, toate rutele /api, în afară de cele de mai
// jos, răspund cu 403 și codul „password_change_required”.
const ALLOWED = new Set(['/auth/me', '/auth/logout', '/auth/change-password']);

function requirePasswordChange(req, res, next) {
  const u = req.session && req.session.user;
  if (!u || !u.mustChangePassword) return next();
  if (ALLOWED.has(req.path)) return next();
  return res.status(403).json({ error: 'Parola temporară trebuie schimbată înainte de a continua.', code: 'password_change_required' });
}

module.exports = { requirePasswordChange, ALLOWED };
