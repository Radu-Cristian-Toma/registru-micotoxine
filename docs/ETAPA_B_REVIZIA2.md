# Etapa B — implementarea lacunelor (revizia 2)

Ramură: `claude/etapa-b-rev2` (față de `main`; **neîmbinată**, în așteptarea aprobării). Referință: `docs/AUDIT_ETAPA_A.md` (numerotarea L1–L24 este păstrată).
Excluse prin regula proiectului: securizarea (secțiunea „Etapa finală: securizare” din audit). Parolele simple de test nu au fost atinse.

## Ce s-a implementat

| Pas | Lacune | Conținut | Fișiere principale |
|---|---|---|---|
| B1 | L23, L24 | Nouă profiluri de limite (făină/griș DON 600; stafide OTA 8; grâu dur; ovăz; semințe oleaginoase OTA 5; fistic; cafea solubilă) și rafinare pe cuvinte-cheie | `db/evaluation.js`, `public/i18n.js` |
| B2 | L5 | Profil, sursă, referință și bază (`profile`/`fallback`/`none`/`manual`) pe fiecare rezultat; semnalare a limitelor implicite; motiv scris obligatoriu la modificarea limitelor; sursă pe buletin | `db/database.js`, `routes/samples.js`, `routes/results.js`, `public/app.js` |
| B3 | L7, L8, L21 (parțial) | `audit_log`, `result_versions` append-only (declanșatoare); `audit_log.sample_id` nullable; jurnalizare conturi, setări laborator, termen, probe de control, teste de validare, incidente fără probă; `npm run verify-integrity`; text VAL-06 | `db/database.js`, `db/audit.js`, `scripts/verify-integrity.js` |
| B4 | L6, L18 | `bulletin_snapshots` (append-only, SHA-256) la emitere; versiuni la validare/revizuire; verificare publică minimală implicit (`LIMS_PUBLIC_VERIFY_RESULTS=1` revine la varianta completă); texte VAL-08, qMap8 | `routes/results.js`, `public/verify.html` |
| B5 | L2, L3, L4 (la nivel de date și evaluare) | Regulă de decizie per rezultat (`simple` implicit; `reg_2782_u`), performanța metodei pe grup (LOQ, recuperare, incertitudine extinsă relativă, k = 2), detaliu de decizie în instantaneul buletinului; qMap9 | `db/evaluation.js`, `routes/results.js` |

Teste noi (`test/unit/`): `limits-profiles`, `limits-provenance`, `audit-integrity`, `audit-events`, `bulletin-snapshot`, `decision-rule`. Rulează cu `npm test` (Node ≥ 22 și `better-sqlite3` instalat).

## Neimplementat sau doar parțial

- **Interfața pentru B5** (adăugată ulterior, ramura `claude/etapa-b-ui-b5`): formularul operatorului are regula de decizie și, per grup comandat, LOQ, recuperare și incertitudine extinsă relativă; buletinul afișează regula, U, recuperarea și „<LOQ”. Verificată într-un browser (Chromium) pe o bază temporară cu date inventate: afișare, refuz fără motiv, salvare cu motiv, escapare HTML. Nu s-a verificat tipărirea buletinului și nici afișarea pe ecrane mici.
- **Corecția pentru recuperare** nu este aplicată în calcul (se stochează doar valoarea). Tratarea „<LOQ” în suma aflatoxinelor (limita inferioară) nu este implementată; „<LOQ” este doar semnalat în detaliul de decizie.
- **Buletinul afișat în interfață** este încă randat din tabelele curente; instantaneul este înregistrarea de referință. Semnătura și ștampila afișate sunt cele curente din setări (instantaneul le păstrează doar ca amprentă).
- **Nu s-au abordat**: L10 (buletin corectat/retras), L11 (restaurare backup), L12 (retenție/export), L13 (controale QC), L14 (echipamente), L15 (date de prelevare/lot), L16 (starea probei la recepție), L17 (separarea rolurilor pentru admin), L19 (marcaje de timp), L20 (ștergerea valorilor prin COALESCE), L22 (unități/bază de calcul).
- **Arhivare**: `audit_log` nu mai poate fi curățat din aplicație; arhivarea la volum mare necesită un mecanism separat.

## Reconfirmări necesare înainte de utilizare reală

- Punctele din Anexa I la Reg. (UE) 2023/915 (versiunea consolidată 02023R0915-20250101) folosite la profile provin dintr-un rezumat automat: **[de reconfirmat pe EUR-Lex]**.
- Formularea regulii de acceptare din Reg. (UE) 2023/2782, anexa I (utilizată de `reg_2782_u`), și valorile incertitudinii **[de reverificat; valorile le stabilește laboratorul din validarea metodei]**.
- Aplicarea incertitudinii grupului „aflatoxins” la suma aflatoxinelor **[de verificat metrologic]**.

## Limite ale verificării

- Testele au rulat local cu un înlocuitor `node:sqlite` în locul `better-sqlite3` (compilarea nativă nu a fost posibilă în mediu). Două teste de backup (`backup.test.js`) nu pot rula cu înlocuitorul (lipsește `.backup`) și **nu au fost verificate**; trebuie rulate în mediul normal.
- Interfața (formular, buletin, pagina publică) a fost verificată sintactic, **nu într-un browser**.
- Nu s-au folosit date reale, chei sau fișiere `.env`; toate datele de test sunt inventate.
