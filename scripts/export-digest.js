#!/usr/bin/env node
// Rezumat periodic al lanturilor de amprente (Etapa D, nivel de amenintare N2).
// Citeste baza fara a o modifica si scrie un fisier JSON mic cu: ultima amprenta si numarul de randuri
// din audit_chain si result_versions_chain, plus amprenta ansamblului de instantanee de buletin.
// Fisierul trebuie pastrat IN AFARA bazei si a accesului celui care administreaza baza (semnat de un
// validator, tiparit sau arhivat pe alt sistem). Confruntare ulterioara:
//   node scripts/verify-integrity.js --digest <fisier>
// Utilizare: node scripts/export-digest.js [director-destinatie]   (implicit ./digest)
// Variabile de mediu: LIMS_DB_PATH (implicit db/lims.db).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { verifyChain, snapshotsSetHash, AUDIT_CHAIN, VERSIONS_CHAIN, sha256 } = require('./verify-integrity');

function pad(n) { return String(n).padStart(2, '0'); }

function buildDigest(db, now = new Date()) {
  const audit = verifyChain(db, AUDIT_CHAIN);
  const versions = verifyChain(db, VERSIONS_CHAIN);
  if (audit.problems.length || versions.problems.length) {
    const e = new Error('Lanțurile de amprente au discrepanțe; rezumatul nu se exportă. Rulați scripts/verify-integrity.js.');
    e.problems = [...audit.problems, ...versions.problems];
    throw e;
  }
  const snaps = db.prepare('SELECT COUNT(*) AS n FROM bulletin_snapshots').get().n;
  const content = {
    schema: 1,
    exportedAt: now.toISOString(),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    audit: audit.head,
    versions: versions.head,
    snapshots: snapshotsSetHash(db, snaps),
    note: 'Pastrati acest fisier in afara bazei de date (semnat, tiparit sau pe alt sistem). Confruntare: node scripts/verify-integrity.js --digest <fisier>.',
  };
  return { ...content, digestSha256: sha256(JSON.stringify(content)) };
}

function exportDigest(dbPath, destDir, now = new Date()) {
  if (!fs.existsSync(dbPath)) throw new Error(`Baza nu există: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const digest = buildDigest(db, now);
    fs.mkdirSync(destDir, { recursive: true });
    const name = `digest-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
    const file = path.join(destDir, name);
    if (fs.existsSync(file)) throw new Error(`Fișierul există deja: ${file}`);
    fs.writeFileSync(file, JSON.stringify(digest, null, 2) + '\n', { flag: 'wx' });
    return { file, digest };
  } finally {
    db.close();
  }
}

module.exports = { buildDigest, exportDigest };

if (require.main === module) {
  try {
    const dbPath = process.env.LIMS_DB_PATH || path.join(__dirname, '..', 'db', 'lims.db');
    const dest = process.argv[2] || path.join(__dirname, '..', 'digest');
    const { file, digest } = exportDigest(dbPath, dest);
    console.log(`Rezumat exportat: ${file}`);
    console.log(`Audit: ${digest.audit.count} rânduri, ultima amprentă ${String(digest.audit.headHash).slice(0, 16)}…; versiuni: ${digest.versions.count}; instantanee: ${digest.snapshots.count}.`);
    console.log(`SHA-256 al rezumatului: ${digest.digestSha256}. Păstrați-l în afara bazei de date.`);
  } catch (e) {
    console.error(`Export eșuat: ${e.message}`);
    if (e.problems) for (const p of e.problems) console.error(JSON.stringify(p));
    process.exit(1);
  }
}
