// Adresa de ascultare a serverului. Implicit doar local (127.0.0.1);
// LIMS_HOST o poate schimba explicit (documentat in README).
const HOST = (process.env.LIMS_HOST || '').trim() || '127.0.0.1';

// Valoarea implicită a secretului de sesiune (doar pentru dezvoltare locală; nu se schimbă aici).
const DEV_SESSION_SECRET = 'dev-secret-schimba-in-productie';

// Etapa E: instanță de demonstrație (date inventate, bannerul DEMO). Nu se admite în producție.
function isDemo(env = process.env) {
  return /^(1|true)$/i.test((env.LIMS_DEMO || '').trim());
}

// Etapa D3: verificări de configurare cerute DOAR în producție (NODE_ENV=production). În dezvoltare,
// comportamentul rămâne cel de până acum (avertisment, valoare implicită). Întoarce lista erorilor.
function checkProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];
  const errors = [];
  if (isDemo(env)) errors.push('LIMS_DEMO este activ: instanța de demonstrație (date inventate) nu poate rula în producție.');
  const secret = env.SESSION_SECRET || '';
  if (!secret) errors.push('SESSION_SECRET nu este setat.');
  else if (secret === DEV_SESSION_SECRET) errors.push('SESSION_SECRET are valoarea implicită de dezvoltare.');
  else if (secret.length < 32) errors.push('SESSION_SECRET trebuie să aibă cel puțin 32 de caractere.');
  const host = (env.LIMS_HOST || '').trim() || '127.0.0.1';
  if ((host === '0.0.0.0' || host === '::') && !env.LIMS_TRUST_PROXY) {
    errors.push('LIMS_HOST ascultă pe toate interfețele fără LIMS_TRUST_PROXY: în producție aplicația trebuie să fie în spatele unui proxy HTTPS (LIMS_TRUST_PROXY=1) sau să asculte local.');
  }
  return errors;
}

// LIMS_TRUST_PROXY: număr de proxy-uri de încredere (ex. 1) sau „loopback”; nesetat = fără proxy.
function trustProxySetting(env = process.env) {
  const v = (env.LIMS_TRUST_PROXY || '').trim();
  if (!v) return false;
  return /^\d+$/.test(v) ? Number(v) : v;
}

module.exports = { HOST, DEV_SESSION_SECRET, checkProductionConfig, trustProxySetting, isDemo };
