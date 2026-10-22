const Database = require('better-sqlite3');
const path = require('path');

// LIMS_DB_PATH permite teste si scripturi (backup) pe o baza temporara;
// implicit ramane db/lims.db.
const DB_PATH = process.env.LIMS_DB_PATH || path.join(__dirname, 'lims.db');
const db = new Database(DB_PATH);

// Functie SHA-256 pusa la dispozitia declansatoarelor care inlantuie amprentele
// (audit_log, result_versions). Trebuie inregistrata pe fiecare conexiune care
// scrie in aceste tabele; o conexiune externa fara ea nu poate insera in ele.
db.function('lims_sha256', { deterministic: true }, (text) => require('crypto').createHash('sha256').update(String(text)).digest('hex'));

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

// Etapa B2 (L5): provenienta limitelor aplicate fiecarui rezultat. Profilul,
// sursa si baza (profile / fallback / none / manual) raman scrise pe rezultat,
// ca decizia de conformitate sa poata fi reconstituita ulterior chiar daca
// profilurile din cod se schimba. Randurile vechi raman NULL (nedocumentat).
const resultsColumnsB2 = db.prepare(`PRAGMA table_info(results)`).all().map(c => c.name);
for (const col of ['limit_profile_id', 'limit_source', 'limit_regulation_ref', 'limit_basis', 'limit_override_reason']) {
  if (!resultsColumnsB2.includes(col)) db.exec(`ALTER TABLE results ADD COLUMN ${col} TEXT`);
}

// Etapa B5 (L2-L4): regula de decizie si performanta metodei pe rezultat.
// decision_rule NULL = 'simple' (comportamentul anterior, neschimbat).
const resultsColumnsB5 = db.prepare(`PRAGMA table_info(results)`).all().map(c => c.name);
for (const col of ['decision_rule', 'method_performance_json']) {
  if (!resultsColumnsB5.includes(col)) db.exec(`ALTER TABLE results ADD COLUMN ${col} TEXT`);
}

// Etapa C3 (L16, L20, L22): starea probei la receptie si cine a receptionat-o,
// baza de raportare (masa proaspata / substanta uscata) si continutul de substanta uscata.
const resultsColumnsC3 = db.prepare(`PRAGMA table_info(results)`).all().map(c => c.name);
if (!resultsColumnsC3.includes('intake_condition_json')) db.exec(`ALTER TABLE results ADD COLUMN intake_condition_json TEXT`);
if (!resultsColumnsC3.includes('intake_checked_by')) db.exec(`ALTER TABLE results ADD COLUMN intake_checked_by INTEGER REFERENCES users(id)`);
if (!resultsColumnsC3.includes('reporting_basis')) db.exec(`ALTER TABLE results ADD COLUMN reporting_basis TEXT`);
if (!resultsColumnsC3.includes('dry_matter_pct')) db.exec(`ALTER TABLE results ADD COLUMN dry_matter_pct REAL`);
// Etapa C4 (L15): datele probei la laborator (masa probei de laborator, omogenizare, replici).
for (const col of ['lab_sample_mass_g REAL', 'homogenization TEXT', 'replicates INTEGER']) {
  if (!resultsColumnsC3.includes(col.split(' ')[0])) db.exec(`ALTER TABLE results ADD COLUMN ${col}`);
}
// Etapa C4 (L14): echipamente si loturi de reactivi / materiale de referinta folosite (liste JSON de id-uri).
for (const col of ['equipment_ids_json TEXT', 'reagent_lot_ids_json TEXT']) {
  if (!resultsColumnsC3.includes(col.split(' ')[0])) db.exec(`ALTER TABLE results ADD COLUMN ${col}`);
}

db.exec(`
  -- Etapa C3: o singura conventie pentru marcajele temporale (ora locala a serverului),
  -- cu fusul orar inregistrat; schimbarea fusului este detectata de verify-integrity.
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- Etapa C3 (L10): starea unui buletin emis (retras / inlocuit), append-only.
  -- Buletinul initial si instantaneul lui nu se modifica; starea apare pe pagina publica si pe buletin.
  CREATE TABLE IF NOT EXISTS bulletin_status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL UNIQUE,
    bulletin_no TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('withdrawn', 'superseded')),
    reason TEXT NOT NULL,
    replaced_by_sample_id INTEGER,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (replaced_by_sample_id) REFERENCES samples(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE TRIGGER IF NOT EXISTS bulletin_status_events_no_update BEFORE UPDATE ON bulletin_status_events
  BEGIN SELECT RAISE(ABORT, 'bulletin_status_events este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS bulletin_status_events_no_delete BEFORE DELETE ON bulletin_status_events
  BEGIN SELECT RAISE(ABORT, 'bulletin_status_events este append-only: stergerea este interzisa'); END;

  -- Etapa C4 (L14): registru de echipamente si de loturi de reactivi / materiale de referinta.
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    equipment_type TEXT,
    serial_no TEXT,
    location TEXT,
    calibration_date TEXT,
    calibration_due TEXT,
    calibration_ref TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    notes TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS reagent_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('reagent', 'reference_material', 'standard', 'kit')),
    lot_no TEXT NOT NULL,
    supplier TEXT,
    expiry_date TEXT,
    analyte_group TEXT,
    certified_value REAL,
    certified_u REAL,
    unit TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
    notes TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Etapa C4 (L13): rezultatele controalelor de calitate (material de referinta / proba de control).
  CREATE TABLE IF NOT EXISTS qc_controls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    analyte_group TEXT NOT NULL CHECK (analyte_group IN ('aflatoxins', 'ota', 'm1', 'don', 'zea', 'fum')),
    reagent_lot_id INTEGER,
    sample_id INTEGER,
    measured_value REAL NOT NULL,
    expected_value REAL NOT NULL,
    accept_low_pct REAL NOT NULL,
    accept_high_pct REAL NOT NULL,
    recovery_pct REAL NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail')),
    notes TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (reagent_lot_id) REFERENCES reagent_lots(id),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
  CREATE TRIGGER IF NOT EXISTS qc_controls_no_update BEFORE UPDATE ON qc_controls
  BEGIN SELECT RAISE(ABORT, 'qc_controls este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS qc_controls_no_delete BEFORE DELETE ON qc_controls
  BEGIN SELECT RAISE(ABORT, 'qc_controls este append-only: stergerea este interzisa'); END;
`);

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
// Etapa C4 (L15): datele de prelevare declarate de beneficiar (dimensiunea lotului,
// numarul de probe elementare, metoda / planul de prelevare). Laboratorul nu raspunde de prelevare.
for (const col of ['lot_size_kg REAL', 'increments_count INTEGER', 'sampling_method TEXT']) {
  if (!sampleColumns.includes(col.split(' ')[0])) db.exec(`ALTER TABLE samples ADD COLUMN ${col}`);
}
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
// Etapa C3 (L17): separarea sarcinilor. Implicit strict: administratorul nu introduce
// rezultate si nu valideaza, iar cine a aprobat o proba nu o si valideaza.
if (!labSettingsColumns.includes('strict_roles')) db.exec(`ALTER TABLE lab_settings ADD COLUMN strict_roles INTEGER NOT NULL DEFAULT 1`);
// Etapa C4 (L12): politica de retentie a dosarelor (ani) si interval maxim de la ultimul control QC (zile; 0 = fara avertisment).
if (!labSettingsColumns.includes('retention_years')) db.exec(`ALTER TABLE lab_settings ADD COLUMN retention_years INTEGER`);
if (!labSettingsColumns.includes('qc_max_age_days')) db.exec(`ALTER TABLE lab_settings ADD COLUMN qc_max_age_days INTEGER NOT NULL DEFAULT 7`);

// Etapa C3 (L19): fusul orar al serverului la prima pornire; marcajele temporale sunt ora locala a acestuia.
db.prepare(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('timestamp_convention', 'local-server-time')`).run();
db.prepare(`INSERT OR IGNORE INTO app_meta (key, value) VALUES ('server_timezone', ?)`).run(Intl.DateTimeFormat().resolvedOptions().timeZone || 'necunoscut');

// Etapa B3 (L7, L8): jurnalul de audit si istoricul versiunilor devin
// append-only la nivel de baza de date, iar evenimentele fara proba (conturi,
// setari, teste de validare) pot fi jurnalizate (sample_id NULL). SQLite nu
// poate elimina NOT NULL dintr-o coloana, deci tabelul se reconstruieste o
// singura data (idempotent: daca sample_id e deja nullable, nu se face nimic).
const auditInfo = db.prepare(`PRAGMA table_info(audit_log)`).all();
const auditSampleCol = auditInfo.find(c => c.name === 'sample_id');
if (auditSampleCol && auditSampleCol.notnull === 1) {
  try {
  db.exec(`
    DROP TRIGGER IF EXISTS audit_log_no_update;
    DROP TRIGGER IF EXISTS audit_log_no_delete;
    DROP TABLE IF EXISTS audit_log_new;
    BEGIN;
    CREATE TABLE audit_log_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (sample_id) REFERENCES samples(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    INSERT INTO audit_log_new (id, sample_id, user_id, action, details, created_at)
      SELECT id, sample_id, user_id, action, details, created_at FROM audit_log;
    DROP TABLE audit_log;
    ALTER TABLE audit_log_new RENAME TO audit_log;
    CREATE INDEX IF NOT EXISTS idx_audit_log_sample ON audit_log(sample_id, created_at DESC);
    COMMIT;
  `);
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) { /* nicio tranzactie deschisa */ }
    throw e;
  }
}
db.exec(`
  CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log este append-only: stergerea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS result_versions_no_update BEFORE UPDATE ON result_versions
  BEGIN SELECT RAISE(ABORT, 'result_versions este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS result_versions_no_delete BEFORE DELETE ON result_versions
  BEGIN SELECT RAISE(ABORT, 'result_versions este append-only: stergerea este interzisa'); END;
`);

// Etapa D (model de amenintare, nivel N2): inlantuirea amprentelor. Fiecare rand nou din
// audit_log si result_versions primeste, in tabele separate append-only, o amprenta SHA-256
// care include amprenta randului anterior. Modificarea sau stergerea unui rand intermediar
// rupe lantul si este detectata de scripts/verify-integrity.js. Randurile anterioare
// introducerii lantului nu au amprenta (avertisment la verificare). Lantul singur nu rezista
// unui atacator care il recalculeaza integral: pentru aceasta se foloseste rezumatul periodic
// exportat in afara bazei (scripts/export-digest.js).
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_chain (
    id INTEGER PRIMARY KEY,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS result_versions_chain (
    id INTEGER PRIMARY KEY,
    prev_hash TEXT NOT NULL,
    row_hash TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS audit_chain_no_update BEFORE UPDATE ON audit_chain
  BEGIN SELECT RAISE(ABORT, 'audit_chain este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS audit_chain_no_delete BEFORE DELETE ON audit_chain
  BEGIN SELECT RAISE(ABORT, 'audit_chain este append-only: stergerea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS result_versions_chain_no_update BEFORE UPDATE ON result_versions_chain
  BEGIN SELECT RAISE(ABORT, 'result_versions_chain este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS result_versions_chain_no_delete BEFORE DELETE ON result_versions_chain
  BEGIN SELECT RAISE(ABORT, 'result_versions_chain este append-only: stergerea este interzisa'); END;

  CREATE TRIGGER IF NOT EXISTS audit_log_chain AFTER INSERT ON audit_log
  BEGIN
    INSERT INTO audit_chain (id, prev_hash, row_hash)
    SELECT NEW.id, p.h, lims_sha256(p.h || '|' || json_array(NEW.id, NEW.sample_id, NEW.user_id, NEW.action, NEW.details, NEW.created_at))
    FROM (SELECT COALESCE((SELECT row_hash FROM audit_chain ORDER BY id DESC LIMIT 1), 'GENESIS') AS h) p;
  END;
  CREATE TRIGGER IF NOT EXISTS result_versions_chain_ins AFTER INSERT ON result_versions
  BEGIN
    INSERT INTO result_versions_chain (id, prev_hash, row_hash)
    SELECT NEW.id, p.h, lims_sha256(p.h || '|' || json_array(NEW.id, NEW.sample_id, NEW.version_no, NEW.snapshot_hash, NEW.change_reason, NEW.changed_by, NEW.created_at))
    FROM (SELECT COALESCE((SELECT row_hash FROM result_versions_chain ORDER BY id DESC LIMIT 1), 'GENESIS') AS h) p;
  END;
`);

// Etapa B4 (L6): instantaneul buletinului la emitere. Continutul emis ramane
// fixat (JSON + SHA-256), independent de tabelele "vii"; append-only.
db.exec(`
  CREATE TABLE IF NOT EXISTS bulletin_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sample_id INTEGER NOT NULL UNIQUE,
    bulletin_no TEXT NOT NULL UNIQUE,
    snapshot_json TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    issued_by INTEGER,
    issued_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (sample_id) REFERENCES samples(id),
    FOREIGN KEY (issued_by) REFERENCES users(id)
  );
  CREATE TRIGGER IF NOT EXISTS bulletin_snapshots_no_update BEFORE UPDATE ON bulletin_snapshots
  BEGIN SELECT RAISE(ABORT, 'bulletin_snapshots este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS bulletin_snapshots_no_delete BEFORE DELETE ON bulletin_snapshots
  BEGIN SELECT RAISE(ABORT, 'bulletin_snapshots este append-only: stergerea este interzisa'); END;

  -- Etapa C2: imaginile (logo, semnatura, stampila) folosite la emiterea unui buletin,
  -- adresate prin amprenta SHA-256 din instantaneu, ca buletinul emis sa poata fi
  -- redat identic si dupa schimbarea setarilor laboratorului.
  CREATE TABLE IF NOT EXISTS branding_assets (
    sha256 TEXT PRIMARY KEY,
    data_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE TRIGGER IF NOT EXISTS branding_assets_no_update BEFORE UPDATE ON branding_assets
  BEGIN SELECT RAISE(ABORT, 'branding_assets este append-only: modificarea este interzisa'); END;
  CREATE TRIGGER IF NOT EXISTS branding_assets_no_delete BEFORE DELETE ON branding_assets
  BEGIN SELECT RAISE(ABORT, 'branding_assets este append-only: stergerea este interzisa'); END;
`);

const validationSeed = [
  ['VAL-01', 'Autentificare și control pe roluri', 'Acces', 'Un beneficiar nu poate accesa funcțiile operatorului sau administratorului.'],
  ['VAL-02', 'Înregistrare probă', 'Recepție', 'O probă nouă primește identificator unic și poate fi urmărită ulterior.'],
  ['VAL-03', 'Calcul sumă aflatoxine', 'Calcul', 'Suma AFB1+AFB2+AFG1+AFG2 este calculată consistent cu valorile introduse.'],
  ['VAL-04', 'Evaluare față de limită', 'Reguli', 'Depășirea unei limite schimbă evaluarea probei în neconformă.'],
  ['VAL-05', 'Blocare validare incompletă', 'Validare', 'Rezultatul incomplet sau QC neacceptat nu poate fi validat.'],
  ['VAL-06', 'Trasabilitatea modificării', 'Integritatea datelor', 'Un rezultat validat nu mai poate fi modificat; fiecare modificare a unui rezultat nevalidat se păstrează ca versiune în istoric (cu motiv și sumă de control SHA-256) și ca eveniment în jurnalul de audit.'],
  ['VAL-07', 'Lucrare neconformă', 'Calitate', 'Un caz de lucrare neconformă poate fi înregistrat și închis cu o decizie.'],
  ['VAL-08', 'Buletin și verificare', 'Raportare', 'Un buletin validat poate fi verificat prin identificatorul QR; pagina publică confirmă autenticitatea (număr, date, amprentă SHA-256) fără a expune rezultatele analitice.']
];
const insertValidation = db.prepare(`INSERT OR IGNORE INTO system_validation_tests (code,title,area,expected) VALUES (?,?,?,?)`);
const seedValidation = db.transaction(() => validationSeed.forEach(row => insertValidation.run(...row)));
seedValidation();
db.prepare(`UPDATE system_validation_tests SET expected = ? WHERE code = 'VAL-08' AND expected = ?`)
  .run(validationSeed.find(r => r[0] === 'VAL-08')[3], 'Un buletin validat poate fi verificat prin identificatorul QR fără expunerea rezultatelor publice.');
// Textul VAL-06 a fost corectat (descria un comportament inexistent). INSERT OR
// IGNORE nu actualizeaza randuri existente, deci inlocuim doar textul vechi
// exact, fara sa atingem rezultatul sau nota testului.
db.prepare(`UPDATE system_validation_tests SET expected = ? WHERE code = 'VAL-06' AND expected = ?`)
  .run(validationSeed.find(r => r[0] === 'VAL-06')[3], 'O modificare după validare retrage validarea și păstrează evenimentul în audit trail.');


module.exports = db;
