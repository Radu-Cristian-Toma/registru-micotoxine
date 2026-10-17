// Store propriu de sesiuni, pe SQLite - inlocuieste MemoryStore-ul implicit
// din express-session, care pierde toate sesiunile la fiecare repornire a
// serverului (confirmat empiric in timpul dezvoltarii: orice restart
// deloga toti utilizatorii). Foloseste aceeasi baza de date SQLite pe care
// aplicatia o are deja ca dependinta (better-sqlite3), fara sa adauge o
// dependinta noua externa doar pentru sesiuni.
const session = require('express-session');
const db = require('./database');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
`);

class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this._getStmt = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this._upsertStmt = db.prepare(`
      INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires
    `);
    this._destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this._clearStmt = db.prepare('DELETE FROM sessions');
    this._countStmt = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires >= ?');
    this._pruneStmt = db.prepare('DELETE FROM sessions WHERE expires < ?');

    // Curatare periodica a sesiunilor expirate, ca tabelul sa nu creasca
    // nelimitat cu sesiuni vechi niciodata sterse explicit (ex. utilizator
    // care inchide tab-ul fara logout).
    this._pruneInterval = setInterval(() => {
      try { this._pruneStmt.run(Date.now()); } catch (_) { /* best-effort */ }
    }, 15 * 60 * 1000);
    if (this._pruneInterval.unref) this._pruneInterval.unref();
  }

  get(sid, cb) {
    try {
      const row = this._getStmt.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        this._destroyStmt.run(sid);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  set(sid, sessionData, cb) {
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 8 * 60 * 60 * 1000;
      this._upsertStmt.run(sid, JSON.stringify(sessionData), expires);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  destroy(sid, cb) {
    try {
      this._destroyStmt.run(sid);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  touch(sid, sessionData, cb) {
    // La fiecare cerere autentificata, doar prelungim expirarea - nu are
    // rost sa recalculam/rescriem intregul obiect de sesiune daca datele
    // lui nu s-au schimbat.
    try {
      const expires = sessionData.cookie && sessionData.cookie.expires
        ? new Date(sessionData.cookie.expires).getTime()
        : Date.now() + 8 * 60 * 60 * 1000;
      const row = this._getStmt.get(sid);
      if (row) {
        db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?').run(expires, sid);
      }
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  clear(cb) {
    try {
      this._clearStmt.run();
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  length(cb) {
    try {
      const row = this._countStmt.get(Date.now());
      cb(null, row.n);
    } catch (e) { cb(e); }
  }
}

module.exports = SqliteSessionStore;
