// Etapa D4: indexul testelor automate (fișier, titluri, rezultat), ca probă de acoperire în dosarul de validare.
// Rulează fiecare fișier de test cu raportorul TAP și citește titlurile reale (inclusiv testele generate în buclă).
// Utilizare: node scripts/list-tests.js [--write]   (cu --write rescrie docs/INDEX_TESTE.md)
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'test', 'unit');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort();

function runFile(file) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(dir, file)], { cwd: root, encoding: 'utf8', timeout: 240000 });
  const tests = [];
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/^(not )?ok \d+ - (.*)$/); // doar nivelul de sus (fără indentare)
    if (m) tests.push({ title: m[2].trim(), pass: !m[1] });
  }
  return tests;
}

function build() {
  let total = 0, failed = 0;
  const sections = [];
  for (const f of files) {
    const t = runFile(f);
    total += t.length; failed += t.filter(x => !x.pass).length;
    sections.push(`## ${f} (${t.length})`, '', ...t.map(x => `- ${x.pass ? '✓' : '✗ NEEȘUAT:'} ${x.title}`), '');
  }
  const head = ['# Index al testelor automate', '',
    `**Total: ${total} teste în ${files.length} fișiere; ${total - failed} trecute, ${failed} eșuate.**`, '',
    'Generat de `node scripts/list-tests.js --write` (rulează testele); nu se editează manual. Fiecare titlu este un test din `test/unit/*.test.js`. **Testele nu înlocuiesc protocolul de validare al laboratorului** (vezi `docs/VALIDARE_PILOT.md`); sunt probă de sprijin pentru calcul, decizie, integritate, acces și flux.', ''];
  return { text: [...head, ...sections].join('\n'), total, failed };
}

if (require.main === module) {
  const { text, total, failed } = build();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(path.join(root, 'docs', 'INDEX_TESTE.md'), text);
    console.log(`docs/INDEX_TESTE.md rescris: ${total} teste în ${files.length} fișiere (${failed} eșuate)`);
  } else {
    console.log(text);
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { build };
