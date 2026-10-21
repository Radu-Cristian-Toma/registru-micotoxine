// Fixeaza explicit fusul orar al procesului la ora Bucurestiului, indiferent
// de fusul implicit al sistemului de operare pe care ruleaza serverul.
// Aceasta trebuie setata inaintea oricarei alte initializari, pentru ca
// afecteaza atat obiectele Date din Node.js cat si modificatorul SQLite
// 'localtime' folosit mai jos la generarea buletinelor si a jurnalelor.
process.env.TZ = 'Europe/Bucharest';

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const samplesRoutes = require('./routes/samples');
const resultsRoutes = require('./routes/results');
const dashboardRoutes = require('./routes/dashboard');
const validationRoutes = require('./routes/validation');
const incidentRoutes = require('./routes/incidents');
const labRoutes = require('./routes/lab');
const SqliteSessionStore = require('./db/session-store');
const { ensureCsrfToken, requireCsrf } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3000;
const { HOST } = require('./config');

// Security baseline for this stage of the project. These headers do not
// replace a production reverse proxy/WAF/security policy, but reduce
// common browser-side risks.
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

if (!process.env.SESSION_SECRET) {
  console.warn('ATENȚIE: SESSION_SECRET nu este setat în .env — folosesc o valoare implicită NESIGURĂ. Setează SESSION_SECRET înainte de a folosi aplicația în producție.');
}

// Limita implicita Express (100KB) e prea mica pentru cererile care includ
// imagini incarcate ca data-URL (logo/semnatura/stampila institutionala) -
// codificarea base64 adauga ~33% peste marimea originala a fisierului, iar
// cele trei imagini pot ajunge in aceeasi cerere. 8MB lasa loc confortabil
// fara sa elimine complet o plafonare rezonabila.
app.use(express.json({ limit: '8mb' }));
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'dev-secret-schimba-in-productie',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(ensureCsrfToken);
app.use('/api', requireCsrf);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/samples', samplesRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/validation', validationRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/lab', labRoutes);

// Pagina publica de verificare a unui buletin (scanata din codul QR tiparit
// pe buletin). Nu necesita autentificare - oricine cu numarul de buletin
// poate confirma ca cifrele tiparite corespund cu cele emise de laborator.
app.get('/verify/:bulletinNo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verify.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Legare implicit pe 127.0.0.1 (doar local). Schimbarea se face explicit prin
// variabila de mediu LIMS_HOST (vezi README) - de exemplu 0.0.0.0 pentru
// acces din reteaua locala, doar in medii controlate.
app.listen(PORT, HOST, () => {
  const os = require('os');
  console.log(`Server pornit pe http://${HOST}:${PORT}`);

  if (HOST === '0.0.0.0' || HOST === '::') {
    console.warn('ATENȚIE: serverul ascultă pe toate interfețele de rețea, iar aplicația folosește parole simple de test.');
    const interfaces = os.networkInterfaces();
    const lanAddresses = [];
    Object.values(interfaces).forEach(ifaceList => {
      (ifaceList || []).forEach(iface => {
        if (iface.family === 'IPv4' && !iface.internal) lanAddresses.push(iface.address);
      });
    });
    if (lanAddresses.length) {
      console.log('Accesibil din rețeaua locală la:');
      lanAddresses.forEach(addr => console.log(`  http://${addr}:${PORT}`));
    }
  }
});
