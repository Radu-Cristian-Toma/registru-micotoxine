// Copie de siguranta a bazei SQLite, folosind API-ul de backup al SQLite
// (consistent si in mod WAL, spre deosebire de copierea simpla a fisierului),
// urmata de verificarea de integritate a copiei.
//
// Utilizare: node scripts/backup-db.js [director-destinatie]
//            node scripts/backup-db.js --encrypt [director-destinatie]   (copie criptata .db.enc; parola din LIMS_BACKUP_PASSPHRASE)
//            node scripts/backup-db.js --decrypt <fisier.db.enc> <iesire.db>   (decriptare + verificare)
//            node scripts/backup-db.js --verify <fisier.db>   (doar verificare)
// Variabile de mediu: LIMS_DB_PATH (baza sursa; implicit db/lims.db).
// Iesire: cod 0 daca copia este valida, 1 in caz contrar.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { encryptFile, decryptFile } = require('./backup-crypto');

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Verifica integritatea unei baze: integrity_check si foreign_key_check.
function verifyDatabase(file) {
  let db;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const integrity = db.pragma('integrity_check');
    const ok = integrity.length === 1 && integrity[0].integrity_check === 'ok';
    const fkViolations = db.pragma('foreign_key_check');
    return { ok: ok && fkViolations.length === 0, integrity, foreignKeyViolations: fkViolations.length };
  } catch (err) {
    // Fisier inexistent, corupt sau care nu este o baza SQLite.
    return { ok: false, integrity: [{ integrity_check: err.message }], foreignKeyViolations: 0 };
  } finally {
    if (db) db.close();
  }
}

async function backupDatabase(sourcePath, destDir) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Baza sursă nu există: ${sourcePath}`);
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, `lims-backup-${timestamp()}.db`);
  if (fs.existsSync(destPath)) throw new Error(`Fișierul de destinație există deja: ${destPath}`);

  const src = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await src.backup(destPath);
  } finally {
    src.close();
  }

  const check = verifyDatabase(destPath);
  if (!check.ok) {
    fs.unlinkSync(destPath);
    throw new Error('Copia nu a trecut verificarea de integritate și a fost ștearsă.');
  }
  return { destPath, bytes: fs.statSync(destPath).size, check };
}

// Sterge un fisier .db si fisierele-satelit SQLite (-wal, -shm, -journal) create la verificare.
function removeWithSidecars(file) {
  for (const f of [file, file + '-wal', file + '-shm', file + '-journal']) {
    try { fs.unlinkSync(f); } catch (_) { /* inexistent */ }
  }
}

// Copie criptata: se face copia verificata, se cripteaza, iar copia in clar se sterge.
async function backupEncrypted(sourcePath, destDir, passphrase) {
  const r = await backupDatabase(sourcePath, destDir);
  const encPath = r.destPath + '.enc';
  try {
    encryptFile(r.destPath, encPath, passphrase);
  } catch (err) {
    removeWithSidecars(r.destPath);
    throw err;
  }
  removeWithSidecars(r.destPath);
  return { destPath: encPath, bytes: fs.statSync(encPath).size, check: r.check };
}

module.exports = { backupDatabase, verifyDatabase, backupEncrypted };

if (require.main === module && process.argv[2] === '--decrypt') {
  const [inFile, outFile] = [process.argv[3], process.argv[4]];
  if (!inFile || !outFile) { console.error('Utilizare: node scripts/backup-db.js --decrypt <fisier.db.enc> <iesire.db>'); process.exit(1); }
  try {
    decryptFile(inFile, outFile, process.env.LIMS_BACKUP_PASSPHRASE);
    const r = verifyDatabase(outFile);
    if (!r.ok) { fs.unlinkSync(outFile); throw new Error('Copia decriptată nu a trecut verificarea de integritate și a fost ștearsă.'); }
    console.log(`Decriptat și verificat: ${outFile}`);
  } catch (err) { console.error(`Decriptare eșuată: ${err.message}`); process.exit(1); }
} else if (require.main === module && process.argv[2] === '--encrypt') {
  const source = process.env.LIMS_DB_PATH || path.join(__dirname, '..', 'db', 'lims.db');
  const destDir = process.argv[3] || path.join(__dirname, '..', 'backup');
  backupEncrypted(source, destDir, process.env.LIMS_BACKUP_PASSPHRASE)
    .then(r => console.log(`Backup criptat și verificat înainte de criptare: ${r.destPath} (${r.bytes} octeți)`))
    .catch(err => { console.error(`Backup criptat eșuat: ${err.message}`); process.exit(1); });
} else if (require.main === module && process.argv[2] === '--verify') {
  const file = process.argv[3];
  if (!file) { console.error('Utilizare: node scripts/backup-db.js --verify <fisier.db>'); process.exit(1); }
  const r = verifyDatabase(file);
  console.log(r.ok ? `Verificare reușită: ${file}` : `Verificare ESUATĂ: ${file} (${JSON.stringify(r.integrity)}, încălcări chei străine: ${r.foreignKeyViolations})`);
  process.exit(r.ok ? 0 : 1);
} else if (require.main === module) {
  const source = process.env.LIMS_DB_PATH || path.join(__dirname, '..', 'db', 'lims.db');
  const destDir = process.argv[2] || path.join(__dirname, '..', 'backup');
  backupDatabase(source, destDir)
    .then(r => console.log(`Backup realizat și verificat: ${r.destPath} (${r.bytes} octeți)`))
    .catch(err => { console.error(`Backup eșuat: ${err.message}`); process.exit(1); });
}
