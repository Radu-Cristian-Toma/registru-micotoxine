const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'lims.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------- Schema ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'admin', 'validator')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

// Migrare defensiva: rolul "validator" a fost adaugat dupa schema initiala.
// SQLite nu permite modificarea unui CHECK constraint prin ALTER TABLE -
// daca baza de date exista deja cu constrangerea veche (fara "validator"),
// reconstruim tabelul users pastrand toate conturile existente.
const usersTableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`).get();
if (usersTableInfo && !usersTableInfo.sql.includes("'validator'")) {
  db.exec(`
    DROP TABLE IF EXISTS users_new;
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'admin', 'validator')),
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );
    INSERT INTO users_new SELECT id, email, password_hash, full_name, role, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    owner_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    category TEXT,
    sample_date TEXT,
    sampled_by TEXT,
    haccp_intended_use TEXT,
    haccp_hazard TEXT,
    haccp_likelihood INTEGER,
    haccp_severity INTEGER,
    haccp_risk_score INTEGER,
    haccp_control_measure TEXT,
    haccp_ccp_relevance TEXT,
    haccp_corrective_action TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_analysis', 'ok', 'fail', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL UNIQUE,
    operator_id INTEGER,
    afb1 REAL,
    afb2 REAL,
    afg1 REAL,
    afg2 REAL,
    ota REAL,
    limit_afb1 REAL DEFAULT 2.0,
    limit_afla_sum REAL DEFAULT 4.0,
    limit_ota REAL DEFAULT 5.0,
    analysis_date TEXT,
    notes TEXT,
    method TEXT,
    equipment TEXT,
    qc_rejection_reason TEXT,
    intake_checked_at TEXT,
    validation_status TEXT NOT NULL DEFAULT 'draft' CHECK (validation_status IN ('draft', 'validated')),
    validated_by INTEGER,
    validated_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (operator_id) REFERENCES users(id),
    FOREIGN KEY (validated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nonconforming_work (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    opened_by INTEGER NOT NULL,
    reason TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
    action TEXT NOT NULL,
    impact_assessment TEXT,
    customer_notification TEXT,
    disposition TEXT NOT NULL DEFAULT 'open' CHECK (disposition IN ('open','accepted','retest','closed')),
    closed_by INTEGER,
    opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    closed_at TEXT,
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (opened_by) REFERENCES users(id),
    FOREIGN KEY (closed_by) REFERENCES users(id)
  );
`);

// Lightweight migrations for existing proof-of-concept databases.
const columns = db.prepare(`PRAGMA table_info(results)`).all().map(c => c.name);
if (!columns.includes('method')) db.exec(`ALTER TABLE results ADD COLUMN method TEXT`);
if (!columns.includes('qc_status')) db.exec(`ALTER TABLE results ADD COLUMN qc_status TEXT NOT NULL DEFAULT 'pending'`);
if (!columns.includes('validation_status')) db.exec(`ALTER TABLE results ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'draft'`);
if (!columns.includes('validated_by')) db.exec(`ALTER TABLE results ADD COLUMN validated_by INTEGER`);
if (!columns.includes('validated_at')) db.exec(`ALTER TABLE results ADD COLUMN validated_at TEXT`);
if (!columns.includes('bulletin_no')) db.exec(`ALTER TABLE results ADD COLUMN bulletin_no TEXT`);
if (!columns.includes('bulletin_issued_at')) db.exec(`ALTER TABLE results ADD COLUMN bulletin_issued_at TEXT`);
// Aflatoxina M1 este un contaminant separat, aplicabil doar laptelui (se
// formeaza in organismul animalului, nu in produsul vegetal) - de aceea are
// coloane proprii, distincte de AFB1/AFB2/AFG1/AFG2/OTA.
if (!columns.includes('m1')) db.exec(`ALTER TABLE results ADD COLUMN m1 REAL`);
if (!columns.includes('limit_m1')) db.exec(`ALTER TABLE results ADD COLUMN limit_m1 REAL`);
// Deoxinivalenol (DON), zearalenona si fumonizinele (suma B1+B2) sunt
// contaminanti fuzarieni independenti de aflatoxine/OTA/M1 - relevanti mai
// ales la cereale si porumb, cu limite proprii diferite pe categorie.
if (!columns.includes('don')) db.exec(`ALTER TABLE results ADD COLUMN don REAL`);
if (!columns.includes('limit_don')) db.exec(`ALTER TABLE results ADD COLUMN limit_don REAL`);
if (!columns.includes('zea')) db.exec(`ALTER TABLE results ADD COLUMN zea REAL`);
if (!columns.includes('limit_zea')) db.exec(`ALTER TABLE results ADD COLUMN limit_zea REAL`);
if (!columns.includes('fum')) db.exec(`ALTER TABLE results ADD COLUMN fum REAL`);
if (!columns.includes('limit_fum')) db.exec(`ALTER TABLE results ADD COLUMN limit_fum REAL`);
// Aprobare pe doua niveluri: un reviewer (diferit, ideal, de operatorul
// care a introdus rezultatele) confirma corectitudinea inainte ca proba sa
// poata fi validata/emisa ca buletin. Separat de validation_status.
if (!columns.includes('review_status')) db.exec(`ALTER TABLE results ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'`);
if (!columns.includes('reviewed_by')) db.exec(`ALTER TABLE results ADD COLUMN reviewed_by INTEGER REFERENCES users(id)`);
if (!columns.includes('reviewed_at')) db.exec(`ALTER TABLE results ADD COLUMN reviewed_at TEXT`);
if (!columns.includes('review_note')) db.exec(`ALTER TABLE results ADD COLUMN review_note TEXT`);
if (!columns.includes('equipment')) db.exec(`ALTER TABLE results ADD COLUMN equipment TEXT`);
if (!columns.includes('qc_rejection_reason')) db.exec(`ALTER TABLE results ADD COLUMN qc_rejection_reason TEXT`);
if (!columns.includes('intake_checked_at')) db.exec(`ALTER TABLE results ADD COLUMN intake_checked_at TEXT`);

// Migrare defensiva: schema initiala avea DEFAULT 2.0/4.0/5.0 pe
// limit_afb1/limit_afla_sum/limit_ota (limite de cereale) direct in
// structura tabelului - un rest periculos care ar putea reintroduce
// tacut limite gresite pentru orice categorie, daca vreodata un INSERT
// viitor omite explicit aceste coloane. Limitele corecte se calculeaza
// intotdeauna explicit, per categorie, la nivel de aplicatie (vezi
// routes/samples.js) - nu ar trebui sa existe niciodata un default de
// schema pentru ele. Reconstruim tabelul, pastrand toate datele, doar
// daca defaultul vechi mai e prezent.
const resultsTableInfo = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='results'`).get();
if (resultsTableInfo && resultsTableInfo.sql.includes('limit_afb1 REAL DEFAULT 2.0')) {
  db.exec(`
    DROP TABLE IF EXISTS results_new;
    CREATE TABLE results_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER NOT NULL UNIQUE,
      operator_id INTEGER,
      afb1 REAL, afb2 REAL, afg1 REAL, afg2 REAL, ota REAL,
      limit_afb1 REAL, limit_afla_sum REAL, limit_ota REAL,
      analysis_date TEXT, notes TEXT, method TEXT,
      qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending', 'accepted', 'not_required', 'rejected')),
      validation_status TEXT NOT NULL DEFAULT 'draft' CHECK (validation_status IN ('draft', 'validated')),
      validated_by INTEGER,
      validated_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      bulletin_no TEXT,
      bulletin_issued_at TEXT,
      m1 REAL, limit_m1 REAL, don REAL, limit_don REAL, zea REAL, limit_zea REAL, fum REAL, limit_fum REAL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      review_note TEXT,
      equipment TEXT,
      qc_rejection_reason TEXT,
      intake_checked_at TEXT,
      FOREIGN KEY (sample_id) REFERENCES samples(id)
    );
    INSERT INTO results_new (
      id, sample_id, operator_id, afb1, afb2, afg1, afg2, ota,
      limit_afb1, limit_afla_sum, limit_ota, analysis_date, notes, method, qc_status, validation_status,
      validated_by, validated_at, updated_at, bulletin_no, bulletin_issued_at, m1, limit_m1, don, limit_don,
      zea, limit_zea, fum, limit_fum, review_status, reviewed_by, reviewed_at, review_note, equipment, qc_rejection_reason, intake_checked_at
    )
    SELECT
      id, sample_id, operator_id, afb1, afb2, afg1, afg2, ota,
      limit_afb1, limit_afla_sum, limit_ota, analysis_date, notes, method, qc_status, validation_status,
      validated_by, validated_at, updated_at, bulletin_no, bulletin_issued_at, m1, limit_m1, don, limit_don,
      zea, limit_zea, fum, limit_fum, review_status, reviewed_by, reviewed_at, review_note, equipment, qc_rejection_reason, intake_checked_at
    FROM results;
    DROP TABLE results;
    ALTER TABLE results_new RENAME TO results;
  `);
}

const sampleColumns = db.prepare(`PRAGMA table_info(samples)`).all().map(c => c.name);
if (!sampleColumns.includes('haccp_intended_use')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_intended_use TEXT`);
if (!sampleColumns.includes('haccp_hazard')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_hazard TEXT`);
if (!sampleColumns.includes('haccp_likelihood')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_likelihood INTEGER`);
if (!sampleColumns.includes('haccp_severity')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_severity INTEGER`);
if (!sampleColumns.includes('haccp_risk_score')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_risk_score INTEGER`);
if (!sampleColumns.includes('haccp_control_measure')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_control_measure TEXT`);
if (!sampleColumns.includes('haccp_ccp_relevance')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_ccp_relevance TEXT`);
if (!sampleColumns.includes('haccp_corrective_action')) db.exec(`ALTER TABLE samples ADD COLUMN haccp_corrective_action TEXT`);
// Analizele comandate de proprietar la inregistrare (subset ales dintre cele
// disponibile pentru categoria probei) - lista JSON de chei de grup:
// "aflatoxins" (AFB1+AFB2+AFG1+AFG2+suma), "ota", "m1", "don", "zea", "fum".
// Aceasta este sursa de adevar pentru ce analize trebuie completate de
// operator - nu doar categoria in sine, ca sa permita si comenzi partiale
// (client care vrea doar o parte din analizele disponibile pentru categoria lui).
if (!sampleColumns.includes('requested_tests')) db.exec(`ALTER TABLE samples ADD COLUMN requested_tests TEXT`);
// Starea (status + validation_status) vazuta ultima oara de proprietar -
// folosita pentru notificarea in-app "Nou" cand statusul probei s-a
// schimbat de la ultima vizualizare, fara a necesita server de email.
if (!sampleColumns.includes('owner_seen_state')) db.exec(`ALTER TABLE samples ADD COLUMN owner_seen_state TEXT`);
// Aceeasi idee, dar pentru coada operator/validator - ATENTIE: spre
// deosebire de proprietar (un singur proprietar per proba), pot exista mai
// multi operatori/validatori care vad aceeasi coada. O singura coloana nu
// poate tine starea "vazut" separat per utilizator fara un tabel de
// legatura suplimentar (sample_id, user_id) - alegere deliberata pentru a
// pastra simplu: starea e comuna echipei (odata ce oricare operator sau
// validator a deschis proba, indicatorul "Nou" dispare pentru toti).
if (!sampleColumns.includes('operator_seen_state')) db.exec(`ALTER TABLE samples ADD COLUMN operator_seen_state TEXT`);
// Termenul estimat de livrare (TAT - turnaround time), stabilit la
// inregistrare sau editabil de operator - folosit pentru a semnala probele
// care depasesc termenul asumat.
if (!sampleColumns.includes('due_date')) db.exec(`ALTER TABLE samples ADD COLUMN due_date TEXT`);
// Legatura catre proba originala, pentru un flux formal de reanalizare -
// o proba noua, creata ca "repetare" a uneia anterioare, pastreaza
// trasabilitatea catre proba initiala.
if (!sampleColumns.includes('retest_of_sample_id')) db.exec(`ALTER TABLE samples ADD COLUMN retest_of_sample_id INTEGER REFERENCES samples(id)`);
// Marcheaza o proba ca fiind proba de control/etalon interna (material de
// referinta certificat), rulata periodic pentru verificarea metodei, nu o
// proba de client. Fara owner real - creata si urmarita de operator/admin.
if (!sampleColumns.includes('is_control_sample')) db.exec(`ALTER TABLE samples ADD COLUMN is_control_sample INTEGER NOT NULL DEFAULT 0`);
if (!sampleColumns.includes('control_expected_json')) db.exec(`ALTER TABLE samples ADD COLUMN control_expected_json TEXT`);

db.exec(`UPDATE results SET qc_status = 'pending' WHERE qc_status IS NULL`);
db.exec(`UPDATE results SET validation_status = 'draft' WHERE validation_status IS NULL`);

// Datele firmei beneficiarului - relevante doar pentru rolul "owner", dar
// pastrate direct pe users (nu intr-un tabel separat) pentru simplitate: un
// cont de beneficiar reprezinta, in acest PoC, o singura firma. Optionale -
// un beneficiar poate lucra si fara ele, dar odata completate, apar automat
// pe buletin, la operator/validator si in arhiva, ca sa se stie clar carei
// firme ii apartine o proba.
const usersColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!usersColumns.includes('company_name')) db.exec(`ALTER TABLE users ADD COLUMN company_name TEXT`);
if (!usersColumns.includes('company_reg_no')) db.exec(`ALTER TABLE users ADD COLUMN company_reg_no TEXT`);
if (!usersColumns.includes('company_address')) db.exec(`ALTER TABLE users ADD COLUMN company_address TEXT`);
if (!usersColumns.includes('company_contact')) db.exec(`ALTER TABLE users ADD COLUMN company_contact TEXT`);
// "firma" (implicit, pentru compatibilitate cu inregistrari existente),
// "pfa" (persoana fizica autorizata) sau "persoana_fizica" (fara nicio
// forma juridica) - eticheta si campurile relevante difera in interfata
// dupa aceasta alegere; codul fiscal/CUI nu se cere de la o persoana
// fizica (nu are unul), doar optional de la firma/PFA.
if (!usersColumns.includes('company_type')) db.exec(`ALTER TABLE users ADD COLUMN company_type TEXT NOT NULL DEFAULT 'firma'`);

db.exec(`
  CREATE TABLE IF NOT EXISTS result_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL,
    version_no INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    change_reason TEXT,
    changed_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE(sample_id, version_no),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (changed_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_result_versions_sample ON result_versions(sample_id, version_no DESC);



  CREATE TABLE IF NOT EXISTS system_incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('availability','application_error','data_error','calculation_error','unauthorized_access','transfer_error','other')),
    severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    reported_by INTEGER NOT NULL,
    description TEXT NOT NULL,
    impact TEXT,
    affected_sample_id INTEGER,
    immediate_action TEXT,
    resolution TEXT,
    verification TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
    opened_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    resolved_at TEXT,
    closed_at TEXT,
    FOREIGN KEY (reported_by) REFERENCES users(id),
    FOREIGN KEY (affected_sample_id) REFERENCES samples(id)
  );
  CREATE INDEX IF NOT EXISTS idx_system_incidents_status ON system_incidents(status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_system_incidents_sample ON system_incidents(affected_sample_id);

  -- Indecsi pe coloanele cel mai des filtrate/interogate - lipseau pana
  -- acum, desi results.sample_id are deja index implicit prin UNIQUE.
  CREATE INDEX IF NOT EXISTS idx_samples_owner ON samples(owner_id);
  CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
  CREATE INDEX IF NOT EXISTS idx_results_validation_status ON results(validation_status);
  CREATE INDEX IF NOT EXISTS idx_results_qc_status ON results(qc_status);
  CREATE INDEX IF NOT EXISTS idx_audit_log_sample ON audit_log(sample_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_nonconforming_sample ON nonconforming_work(sample_id);

  -- Plasa de siguranta la nivel de baza de date pentru numerele de buletin -
  -- indiferent cat de corecta e logica din aplicatie care le genereaza
  -- (reparata separat, vezi routes/results.js), un index unic aici
  -- garanteaza ca doua probe nu pot primi NICIODATA acelasi numar de
  -- buletin, respingand explicit orice incercare cu o eroare, nu doar
  -- silentios. Index partial (doar pe valorile ne-null), ca sa nu
  -- blocheze probele inca nevalidate (bulletin_no ramane NULL pana la
  -- validare - SQLite oricum trateaza NULL-urile ca distincte intre ele
  -- la UNIQUE, dar clauza WHERE face intentia explicita).
  CREATE UNIQUE INDEX IF NOT EXISTS idx_results_bulletin_no_unique ON results(bulletin_no) WHERE bulletin_no IS NOT NULL;

  CREATE TABLE IF NOT EXISTS system_validation_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    area TEXT NOT NULL,
    expected TEXT NOT NULL,
    result TEXT NOT NULL DEFAULT 'not_run' CHECK (result IN ('not_run','passed','failed')),
    note TEXT,
    executed_by INTEGER,
    executed_at TEXT,
    FOREIGN KEY (executed_by) REFERENCES users(id)
  );

  -- Randul unic de configurare a identitatii vizuale a laboratorului pe buletin
  -- (logo, denumire, adresa, semnatura grafica/stampila scanata). id fixat la 1
  -- fiindca exista un singur set de setari pentru intreaga aplicatie.
  CREATE TABLE IF NOT EXISTS lab_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    institution_name TEXT,
    institution_address TEXT,
    logo_data_url TEXT,
    signature_data_url TEXT,
    signature_name TEXT,
    signature_role TEXT,
    stamp_data_url TEXT,
    updated_by INTEGER,
    updated_at TEXT,
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );
`);

db.prepare(`INSERT OR IGNORE INTO lab_settings (id) VALUES (1)`).run();

// Adresa fizica si emailul de contact au fost initial un singur camp text -
// separate ulterior in doua campuri distincte, pentru claritate pe buletin
// si in formularul de administrare.
const labSettingsColumns = db.prepare(`PRAGMA table_info(lab_settings)`).all().map(c => c.name);
if (!labSettingsColumns.includes('institution_email')) db.exec(`ALTER TABLE lab_settings ADD COLUMN institution_email TEXT`);
// Telefon de contact al laboratorului - pentru o sesizare sau o intrebare
// despre o proba, un beneficiar are nevoie de o cale directa de contact,
// nu doar de statusul probei. Optional, alaturi de email.
if (!labSettingsColumns.includes('institution_phone')) db.exec(`ALTER TABLE lab_settings ADD COLUMN institution_phone TEXT`);

const validationSeed = [
  ['VAL-01', 'Autentificare și control pe roluri', 'Acces', 'Un beneficiar nu poate accesa funcțiile operatorului sau administratorului.'],
  ['VAL-02', 'Înregistrare probă', 'Recepție', 'O probă nouă primește identificator unic și poate fi urmărită ulterior.'],
  ['VAL-03', 'Calcul sumă aflatoxine', 'Calcul', 'Suma AFB1+AFB2+AFG1+AFG2 este calculată consistent cu valorile introduse.'],
  ['VAL-04', 'Evaluare față de limită', 'Reguli', 'Depășirea unei limite schimbă evaluarea probei în neconformă.'],
  ['VAL-05', 'Blocare validare incompletă', 'Validare', 'Rezultatul incomplet sau QC neacceptat nu poate fi validat.'],
  ['VAL-06', 'Trasabilitatea modificării', 'Integritatea datelor', 'O modificare după validare retrage validarea și păstrează evenimentul în audit trail.'],
  ['VAL-07', 'Lucrare neconformă', 'Calitate', 'Un caz de lucrare neconformă poate fi înregistrat și închis cu o decizie.'],
  ['VAL-08', 'Buletin și verificare', 'Raportare', 'Un buletin validat poate fi verificat prin identificatorul QR fără expunerea rezultatelor publice.']
];
const insertValidation = db.prepare(`INSERT OR IGNORE INTO system_validation_tests (code,title,area,expected) VALUES (?,?,?,?)`);
const seedValidation = db.transaction(() => validationSeed.forEach(row => insertValidation.run(...row)));
seedValidation();


module.exports = db;
