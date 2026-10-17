const crypto = require('crypto');

// Protectie CSRF (Cross-Site Request Forgery) - tipar "synchronizer token",
// legat de sesiune. Solutie proprie, fara dependinta noua (consecvent cu
// db/session-store.js si middleware/rate-limit.js).
//
// Cum functioneaza:
// 1. ensureCsrfToken ruleaza pe FIECARE cerere (inclusiv GET) - daca sesiunea
//    curenta nu are inca un token, il genereaza. Ruleaza si pe cereri
//    anonime (inainte de login), ca token-ul sa existe deja cand clientul
//    incearca prima cerere care modifica ceva - inclusiv login-ul insusi.
// 2. requireCsrf verifica, DOAR pentru metode care modifica starea
//    (POST/PUT/PATCH/DELETE), ca antetul X-CSRF-Token trimis de client sa
//    corespunda exact cu token-ul retinut in sesiune. GET/HEAD/OPTIONS sunt
//    metode sigure, fara efecte secundare - nu au nevoie de verificare.
//
// La login/register, sesiunea se regenereaza explicit (protectie separata,
// impotriva fixarii sesiunii) - asta sterge orice a fost pe sesiunea veche,
// inclusiv token-ul CSRF. De aceea, rutele de autentificare re-emit explicit
// un token nou dupa regenerare si il trimit in raspuns, ca clientul sa-l
// poata retine pentru cererile urmatoare.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Token de securitate lipsă sau expirat. Reîncarcă pagina și încearcă din nou.' });
  }
  next();
}

module.exports = { ensureCsrfToken, requireCsrf };
