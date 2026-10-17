// Limitare simpla a incercarilor de autentificare, in memorie - fara
// dependinta noua externa (npm install esueaza in acest sandbox din cauza
// compilarii native pentru better-sqlite3, deja prezent; solutie proprie,
// consecventa cu abordarea de la db/session-store.js).
//
// ATENTIE - limitare cunoscuta: fiind in memorie, contorul se reseteaza la
// repornirea serverului. Acceptabil pentru un pilot pe un singur proces -
// un atacator care ar reporni serverul nu e un scenariu realist de amenintare,
// iar restart-urile sunt oricum rare. Pentru multi-proces/multi-server ar fi
// nevoie de o solutie partajata (SQLite, ca la sesiuni, sau alt store comun).

const WINDOW_MS = 15 * 60 * 1000; // fereastra de 15 minute
const MAX_ATTEMPTS = 5; // incercari esuate permise in fereastra, per IP

const attempts = new Map(); // ip -> { count, windowStart }

// Curatare periodica a intrarilor expirate, ca Map-ul sa nu creasca
// nelimitat pe un server pornit mult timp.
const pruneInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now - entry.windowStart > WINDOW_MS) attempts.delete(ip);
  }
}, 5 * 60 * 1000);
if (pruneInterval.unref) pruneInterval.unref();

function keyFor(req) {
  // req.ip respecta setarea 'trust proxy' din server.js, daca e configurata
  // (relevant cand serverul ruleaza in spatele unui reverse proxy).
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

// Middleware: blocheaza cererea DACA IP-ul a depasit deja limita, inainte
// sa se incerce autentificarea. Nu incrementeaza el insusi contorul -
// asta se intampla explicit, doar la un login esuat (vezi recordFailedAttempt).
function loginRateLimit(req, res, next) {
  const key = keyFor(req);
  const entry = attempts.get(key);
  if (!entry) return next();

  const elapsed = Date.now() - entry.windowStart;
  if (elapsed > WINDOW_MS) {
    attempts.delete(key);
    return next();
  }
  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((WINDOW_MS - elapsed) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: `Prea multe încercări de autentificare. Încearcă din nou peste ${Math.ceil(retryAfterSeconds / 60)} minute.`
    });
  }
  next();
}

// Apelat explicit DOAR cand autentificarea a esuat (email/parola gresite) -
// login-urile reusite nu conteaza in limita, si un email valid gasit dar cu
// parola gresita conteaza la fel ca un email inexistent (nu diferentiem, ca
// sa nu scurgem daca un cont exista prin diferenta de comportament).
function recordFailedAttempt(req) {
  const key = keyFor(req);
  const entry = attempts.get(key);
  const now = Date.now();
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

// Apelat explicit la un login REUSIT - reseteaza contorul, ca un utilizator
// legitim care a gresit parola de cateva ori sa nu ramana blocat inutil dupa
// ce a introdus-o corect.
function clearAttempts(req) {
  attempts.delete(keyFor(req));
}

module.exports = { loginRateLimit, recordFailedAttempt, clearAttempts };
