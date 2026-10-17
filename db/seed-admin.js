// Ruleaza o singura data pentru a crea contul de admin initial:
//   node db/seed-admin.js admin@usamv.ro parola-ta NumeAdmin
const bcrypt = require('bcryptjs');
const db = require('./database');

const [,, email, password, fullName] = process.argv;

if (!email || !password) {
  console.log('Utilizare: node db/seed-admin.js <email> <parola> [nume complet]');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  console.log('Exista deja un utilizator cu acest email.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
db.prepare(`
  INSERT INTO users (email, password_hash, full_name, role)
  VALUES (?, ?, ?, 'admin')
`).run(email, hash, fullName || 'Administrator');

console.log(`Cont admin creat: ${email}`);
