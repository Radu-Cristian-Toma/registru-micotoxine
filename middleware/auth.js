function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Trebuie să fii autentificat.' });
  }
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Trebuie să fii autentificat.' });
    }
    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Nu ai permisiunea pentru această acțiune.' });
    }
    next();
  };
}

function requireSampleAccess(paramName = 'sampleId') {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Trebuie să fii autentificat.' });
    const sampleId = req.params[paramName];
    if (req.session.user.role !== 'owner') return next();
    const db = require('../db/database');
    const sample = db.prepare('SELECT id, owner_id FROM samples WHERE id = ?').get(sampleId);
    if (!sample) return res.status(404).json({ error: 'Proba nu a fost găsită.' });
    if (sample.owner_id !== req.session.user.id) return res.status(403).json({ error: 'Nu ai acces la această probă.' });
    next();
  };
}

module.exports = { requireLogin, requireRole, requireSampleAccess };
