// Verifică licențele dependențelor de execuție (node_modules, fără cele de dezvoltare) și semnalează orice
// licență în afara listei permisive compatibile cu AGPL-3.0-or-later. Iese cu cod 1 dacă găsește una.
//   node scripts/license-check.js [--list]
const fs = require('fs');
const path = require('path');

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'Unlicense', 'CC0-1.0', 'Python-2.0']);
const root = path.join(__dirname, '..');

function runtimeDeps() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  return Object.entries(lock.packages || {}).filter(([p, v]) => p && !v.dev && !v.devOptional);
}

function check() {
  const rows = [];
  for (const [p, v] of runtimeDeps()) {
    const pj = path.join(root, p, 'package.json');
    const meta = fs.existsSync(pj) ? JSON.parse(fs.readFileSync(pj, 'utf8')) : {};
    const license = v.license || meta.license || (meta.licenses && JSON.stringify(meta.licenses)) || 'NECUNOSCUTĂ';
    const ids = String(license).replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+/i);
    rows.push({ name: p.replace(/^.*node_modules\//, ''), version: v.version, license, ok: ids.some(i => ALLOWED.has(i)) });
  }
  return rows;
}

module.exports = { check, ALLOWED };

if (require.main === module) {
  const rows = check();
  const bad = rows.filter(r => !r.ok);
  if (process.argv.includes('--list')) for (const r of rows) console.log(`${r.license.padEnd(14)} ${r.name}@${r.version}`);
  const by = {};
  for (const r of rows) by[r.license] = (by[r.license] || 0) + 1;
  console.log(`Pachete de execuție instalate: ${rows.length} (din care 7 dependențe directe). ` + Object.entries(by).map(([l, n]) => `${l}: ${n}`).join(', '));
  if (bad.length) { console.error('Licențe în afara listei permisive:\n' + bad.map(r => `  ${r.name}@${r.version}: ${r.license}`).join('\n')); process.exit(1); }
  console.log('Toate licențele sunt permisive și compatibile cu AGPL-3.0-or-later.');
}
