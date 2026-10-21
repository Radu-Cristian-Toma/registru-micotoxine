// Politici de laborator citite din lab_settings (etapa C3, L17).
const db = require('./database');

// Separarea sarcinilor este activa implicit; se relaxeaza explicit de administrator (cu jurnalizare).
function strictRoles() {
  const r = db.prepare('SELECT strict_roles FROM lab_settings WHERE id = 1').get();
  return !r || r.strict_roles !== 0;
}

module.exports = { strictRoles };
