// Prima pornire (Etapa E): pregătește o instalare nouă fără a introduce parole în fișiere sau în istoricul comenzilor.
//
//   node scripts/first-run.js env [--file .env]            creează .env din .env.example, cu un SESSION_SECRET generat (dacă lipsește)
//   node scripts/first-run.js secret --file <cale>         scrie un SESSION_SECRET generat într-un fișier (0600), dacă nu există
//   node scripts/first-run.js admin --email <e> [--name N] creează primul administrator, cu o parolă temporară aleatoare
//
// Parola temporară se afișează o singură dată și are indicatorul „trebuie schimbată la prima autentificare”.
// Dacă există deja un administrator, comanda „admin” nu face nimic. Politica de parole a aplicației nu este modificată.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
// Alfabet fără caractere ușor de confundat (0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generateSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function generateTempPassword(length = 16) {
  let out = '';
  while (out.length < length) {
    const b = crypto.randomBytes(1)[0];
    if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length]; // fără părtinire de modul
  }
  return out;
}

// Creează fișierul .env din șablon, cu SESSION_SECRET generat. Nu rescrie un secret existent.
function ensureEnvFile(envPath, examplePath = path.join(ROOT, '.env.example')) {
  let text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : (fs.existsSync(examplePath) ? fs.readFileSync(examplePath, 'utf8') : '');
  const has = /^SESSION_SECRET=\S+/m.test(text);
  if (has) return { created: false, path: envPath };
  text = text.replace(/^#?\s*SESSION_SECRET=.*$/m, '').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
  text += `\n# Generat de scripts/first-run.js; nu se pune în depozit.\nSESSION_SECRET=${generateSecret()}\n`;
  fs.writeFileSync(envPath, text, { mode: 0o600 });
  return { created: true, path: envPath };
}

function ensureSecretFile(file) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim().length >= 32) return { created: false, path: file };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, generateSecret() + '\n', { mode: 0o600 });
  return { created: true, path: file };
}

// db: instanță better-sqlite3; bcrypt: modulul bcryptjs. Întoarce parola temporară numai la creare.
function ensureFirstAdmin(db, bcrypt, email, fullName) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Adresa de e-mail a administratorului nu este validă.');
  if (db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get()) return { created: false };
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(normalized)) throw new Error('Există deja un utilizator cu această adresă, dar nu este administrator.');
  const password = generateTempPassword();
  db.prepare(`INSERT INTO users (email, password_hash, full_name, role, must_change_password) VALUES (?, ?, ?, 'admin', 1)`)
    .run(normalized, bcrypt.hashSync(password, 12), fullName || 'Administrator');
  return { created: true, email: normalized, password };
}

module.exports = { generateSecret, generateTempPassword, ensureEnvFile, ensureSecretFile, ensureFirstAdmin };

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'env') {
      const r = ensureEnvFile(path.resolve(arg('--file') || path.join(ROOT, '.env')));
      console.log(r.created ? `Creat ${r.path} cu un SESSION_SECRET generat.` : `${r.path} are deja un SESSION_SECRET; nemodificat.`);
    } else if (cmd === 'secret') {
      const file = arg('--file');
      if (!file) throw new Error('Lipsește --file <cale>.');
      ensureSecretFile(path.resolve(file));
    } else if (cmd === 'admin') {
      const db = require('../db/database');
      const r = ensureFirstAdmin(db, require('bcryptjs'), arg('--email') || process.env.LIMS_ADMIN_EMAIL, arg('--name') || process.env.LIMS_ADMIN_NAME);
      if (!r.created) console.log('Există deja un administrator; nu s-a creat niciun cont.');
      else {
        console.log('==============================================================');
        console.log(' Primul administrator a fost creat.');
        console.log(`   e-mail:            ${r.email}`);
        console.log(`   parolă temporară:  ${r.password}`);
        console.log(' Parola se afișează o singură dată; la prima autentificare');
        console.log(' aplicația cere schimbarea ei. Păstrați-o într-un loc sigur.');
        console.log('==============================================================');
      }
    } else {
      console.error('Utilizare: node scripts/first-run.js env|secret|admin [opțiuni] (vezi comentariul din fișier)');
      process.exit(1);
    }
  } catch (err) {
    console.error(`first-run: ${err.message}`);
    process.exit(1);
  }
}
