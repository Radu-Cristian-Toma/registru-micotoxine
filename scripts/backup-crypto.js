// Etapa D3: criptarea copiilor de siguranță (AES-256-GCM, cheie derivată din parolă cu scrypt).
// Parola copiei se citește DOAR din variabila de mediu LIMS_BACKUP_PASSPHRASE; nu se primește ca argument
// de linie de comandă (ar rămâne în istoricul shell-ului) și nu se scrie nicăieri. Format fișier:
//   "LIMSBK1\n" (8 octeți) | salt 16 | iv 12 | tag 16 | text criptat
// Cine pierde parola pierde copia: parola se păstrează separat de copie, într-un loc stabilit de laborator.
const crypto = require('crypto');
const fs = require('fs');

const MAGIC = Buffer.from('LIMSBK1\n', 'utf8');
const SALT = 16, IV = 12, TAG = 16;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function deriveKey(passphrase, salt) {
  if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Parola copiei (LIMS_BACKUP_PASSPHRASE) trebuie să aibă cel puțin 12 caractere.');
  return crypto.scryptSync(passphrase, salt, 32, SCRYPT);
}

function encryptFile(inPath, outPath, passphrase) {
  const salt = crypto.randomBytes(SALT); const iv = crypto.randomBytes(IV);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const enc = Buffer.concat([cipher.update(fs.readFileSync(inPath)), cipher.final()]);
  fs.writeFileSync(outPath, Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), enc]), { mode: 0o600 });
  return { bytes: fs.statSync(outPath).size };
}

function decryptFile(inPath, outPath, passphrase) {
  const buf = fs.readFileSync(inPath);
  if (buf.length < MAGIC.length + SALT + IV + TAG || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Fișierul nu este o copie criptată LIMS.');
  let o = MAGIC.length;
  const salt = buf.subarray(o, o += SALT); const iv = buf.subarray(o, o += IV); const tag = buf.subarray(o, o += TAG);
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  let plain;
  try { plain = Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()]); }
  catch (_) { throw new Error('Decriptare eșuată: parola este greșită sau fișierul a fost modificat.'); }
  fs.writeFileSync(outPath, plain, { mode: 0o600 });
  return { bytes: plain.length };
}

module.exports = { encryptFile, decryptFile, MAGIC };
