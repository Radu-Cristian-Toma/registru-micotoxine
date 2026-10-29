// Pachet de distribuție (Etapa E): arhivă .tar.gz reproductibilă cu fișierele urmărite de git, fără materialele
// articolului (docs/articol/), plus SHA256SUMS. Se rulează dintr-un depozit git curat, pe versiunea de livrat.
//   node scripts/make-release.js [director-iesire]     (implicit dist/)
// Arhiva conține tot ce trebuie pentru instalare (Dockerfile, docker-compose, scripturi, documentație, LICENSE).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const EXCLUDE = [/^docs\/articol\//, /^acceptanta-final9\//, /^\.github\//];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function main() {
  const out = path.resolve(process.argv[2] || path.join(root, 'dist'));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  if (git('status', '--porcelain', '--untracked-files=no').trim()) throw new Error('Există modificări necomise; pachetul se face dintr-un depozit curat.');
  const name = `lims-micotoxine-${pkg.version}`;
  const files = git('ls-files', '-z').split('\0').filter(f => f && !EXCLUDE.some(re => re.test(f)));
  for (const need of ['LICENSE', 'NOTICE', 'Dockerfile', 'docker-compose.yml', 'package-lock.json']) {
    if (!files.includes(need)) throw new Error(`Lipsește din pachet: ${need}`);
  }
  const mtime = git('log', '-1', '--format=%ct').trim();
  fs.mkdirSync(out, { recursive: true });
  const list = path.join(out, `${name}.files`);
  fs.writeFileSync(list, files.join('\n') + '\n');
  const tar = path.join(out, `${name}.tar`);
  const gz = tar + '.gz';
  try {
    execFileSync('tar', ['--sort=name', `--mtime=@${mtime}`, '--owner=0', '--group=0', '--numeric-owner', `--transform=s|^|${name}/|`, '-cf', tar, '-T', list], { cwd: root });
    fs.writeFileSync(gz, execFileSync('gzip', ['-9', '-n', '-c', tar], { maxBuffer: 1 << 30 }));
  } finally {
    fs.rmSync(list, { force: true });
    fs.rmSync(tar, { force: true });
  }
  const sums = path.join(out, 'SHA256SUMS');
  fs.writeFileSync(sums, `${sha256(gz)}  ${path.basename(gz)}\n`);
  console.log(`Pachet: ${gz} (${fs.statSync(gz).size} octeți, ${files.length} fișiere)`);
  console.log(`SHA-256: ${sha256(gz)}  (în ${sums})`);
  console.log(`Commit: ${git('rev-parse', 'HEAD').trim()}`);
}

if (require.main === module) {
  try { main(); } catch (err) { console.error(`make-release: ${err.message}`); process.exit(1); }
}
module.exports = { EXCLUDE };
