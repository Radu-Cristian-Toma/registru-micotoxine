const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'server.js',
  'middleware/auth.js',
  'middleware/rate-limit.js',
  'middleware/csrf.js',
  'middleware/password-gate.js',
  'routes/auth.js',
  'routes/admin.js',
  'routes/samples.js',
  'routes/results.js',
  'routes/dashboard.js',
  'routes/validation.js',
  'routes/incidents.js',
  'routes/lab.js',
  'routes/lots.js',
  'db/database.js',
  'db/evaluation.js',
  'db/owner-view.js',
  'db/lots.js',
  'db/result-export.js',
  'db/session-store.js',
  'config.js',
  'scripts/backup-db.js',
  'scripts/backup-crypto.js',
  'scripts/list-tests.js',
  'scripts/export-digest.js',
  'scripts/verify-integrity.js',
  'scripts/verify-integrity.js',
  'db/audit.js',
  'db/clock.js',
  'db/policy.js',
  'db/bulletin-state.js',
  'public/index.html',
  'public/app.js',
  'public/i18n.js',
  'public/server-errors-en.js',
  'public/decision-core.js',
  'public/lab.js',
  'public/style.css',
  'public/verify.html',
  'README.md',
  '.env.example',
  'LICENSE',
  'NOTICE',
  'CITATION.cff',
  'SECURITY.md',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.demo.yml',
  'docker/entrypoint.sh',
  'docker/Caddyfile',
  'docker/env.example',
  'scripts/first-run.js',
  'scripts/demo-seed.js',
  'scripts/license-check.js',
  'scripts/make-release.js'
];

const errors = [];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) errors.push(`Lipsește fișierul obligatoriu: ${file}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (pkg.version !== '1.55.0') errors.push(`package.json are versiunea ${pkg.version}`);
if (lock.version !== '1.55.0' || lock.packages?.['']?.version !== '1.55.0') errors.push('package-lock.json nu este sincronizat cu v1.55.0');

for (const file of required.filter(f => f.endsWith('.js'))) {
  const full = path.join(root, file);
  const r = cp.spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
  if (r.status !== 0) errors.push(`Sintaxă invalidă: ${file}\n${r.stderr.trim()}`);
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
if (!readme.includes('v1.55.0')) errors.push('README.md nu identifică release-ul v1.55.');

if (errors.length) {
  console.error('RELEASE CHECK: FAILED');
  errors.forEach(e => console.error(`- ${e}`));
  process.exit(1);
}

console.log('RELEASE CHECK: PASSED');
console.log('v1.55.0: structură, versiuni și sintaxa JavaScript sunt coerente.');
