// Jurnal de audit - punct unic de scriere pentru evenimente (Etapa B3, L8).
// Evenimentele care nu apartin unei probe (conturi, setari de laborator,
// teste de validare, incidente fara proba) se scriu cu sample_id NULL.
const db = require('./database');

const insertStmt = db.prepare('INSERT INTO audit_log (sample_id, user_id, action, details) VALUES (?, ?, ?, ?)');

function logEvent(userId, action, details = null, sampleId = null) {
  return insertStmt.run(sampleId, userId || null, action, details === null ? null : JSON.stringify(details));
}

module.exports = { logEvent };
