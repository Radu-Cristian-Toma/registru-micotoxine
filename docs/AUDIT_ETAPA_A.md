# Audit Etapa A — Registru Micotoxine v1.53.5 față de cerințele industriei

**Obiect:** depozitul `lims-micotoxine`, commit `9b47e81` (ramura `main`), versiunea 1.53.5.
**Nișa de referință:** laborator de încercări acreditat conform ISO/IEC 17025 (valoare implicită; nișa din proiectul LIMS nu a fost furnizată) [de confirmat].
**Data auditului:** 2026-10-17.
**Metodă:** citirea integrală a codului de server (`server.js`, `db/*`, `routes/*`, `middleware/*`) și interogări țintite în `public/app.js`, `public/i18n.js`, `public/verify.html`, `docs/*`, `test/*`. Aplicația nu a fost rulată; nu s-au folosit date reale, chei sau parole. Niciun fișier de cod nu a fost modificat.

## 0. Limitele auditului

1. **Surse normative.** Accesul direct la EUR-Lex a eșuat din mediul de execuție (eroare de rezolvare DNS). Datele despre reglementările UE provin din rezultate de căutare și din surse secundare (rezumate, oglinzi de legislație). Orice număr de punct, anexă sau valoare numerică ce nu apare mai jos ca „verificat" este **[de verificat]** pe textul consolidat de pe EUR-Lex.
2. **Standarde ISO.** ISO/IEC 17025:2017 este un standard cu plată. Numerotarea clauzelor a fost confirmată doar acolo unde apare în surse publice (indicate la §1). Restul este marcat **[de verificat]** pe exemplarul standardului.
3. **Limitele din `db/evaluation.js`.** Nu au putut fi confruntate cu textul oficial. Comentariile din cod afirmă că au fost verificate pe versiunea consolidată `02023R0915-20250101`; această afirmație nu a fost reprodusă în audit.
4. **Rolul auditului.** Documentul evaluează acoperirea software-ului, nu conformitatea laboratorului. Validarea LIMS pentru utilizarea intenționată rămâne responsabilitatea laboratorului.

## 1. Cerințe relevante și sursele lor

Legendă pentru coloana „Verificare": **V** = confirmat în sursa indicată; **VS** = confirmat doar din sursă secundară; **N** = neconfirmat, de verificat.

| ID | Cerință | Sursă | Verificare |
|---|---|---|---|
| C1 | Limite maxime pentru micotoxine în alimente (aflatoxine, OTA, DON, ZEA, fumonizine, AFM1) | Reg. (UE) 2023/915 din 25.04.2023, JO L 119, 5.5.2023; abrogă Reg. (CE) 1881/2006; se aplică din 25.05.2023 ([AGRINFO](https://agrinfo.eu/book-of-reports/regulation-on-maximum-levels-for-certain-contaminants-in-food/), [FAOLEX/ECOLEX](https://www.ecolex.org/details/legislation/commission-regulation-eu-2023915-on-maximum-levels-for-certain-contaminants-in-food-and-repealing-regulation-ec-no-18812006-lex-faoc217510/)) | VS pentru date și abrogare; **N** pentru valori și puncte din Anexa I |
| C2 | Metode de prelevare (Anexa I) și criterii pentru prepararea probei și metodele de analiză (Anexa II) | Reg. de punere în aplicare (UE) 2023/2782 din 14.12.2023; abrogă Reg. (CE) 401/2006; se aplică din 1.04.2024; art. 4: cerințele pct. 4.3 din Anexa II la 401/2006 rămân aplicabile metodelor validate înainte de aplicare, până la 1.01.2029 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg_impl/2023/2782), rezumat prin motor de căutare; [Wessling](https://de.wessling-group.com/en/new-sampling-and-analysis-regulation-on-mycotoxins-and-plant-toxins-in-food-planned-and-adopted)) | VS; **N** pentru conținutul Anexei II (recuperare, LOQ, incertitudine) și pentru regula de acceptare a lotului |
| C3 | Incertitudinea de măsurare: laboratorul o evaluează și o aplică | ISO/IEC 17025:2017, titlul cl. 7.6 „Evaluation of measurement uncertainty" ([NATA, document de aplicare](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)) | VS pentru titlul clauzei; **N** pentru text |
| C4 | Regula de decizie și declarația de conformitate: regula se convine cu clientul în faza de contract (cl. 7.1.3) și se identifică în raport (cl. 7.8.6), cu luarea în considerare a riscului de acceptare/respingere falsă, dacă regula nu este impusă de reglementare | ISO/IEC 17025:2017 cl. 7.1.3, 7.8.6.1, 7.8.6.2 ([Quality Magazine](https://www.qualitymag.com/articles/97291-the-elephant-in-the-room-or-the-impact-of-measurement-uncertainty-on-risk)); ghid [ILAC G8:09/2019](https://ilac.org/latest_ilac_news/revised-ilac-g8-published/) | VS; text integral al G8 **N** |
| C5 | Validarea metodelor (selecție, verificare, validare) | ISO/IEC 17025:2017, cl. 7.2.2 (titlu) ([NATA](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)) | VS pentru titlu; **N** pentru text |
| C6 | Trasabilitate metrologică (echipamente, etaloane) | ISO/IEC 17025:2017, cl. 6.5 ([PECB](https://pecb.com/article/what-are-the-key-changes-between-the-2005-and-2017-versions-of-the-isoiec-17025-standard)); cl. 6.4 echipamente **[de verificat]** | VS |
| C7 | Asigurarea validității rezultatelor (controale de calitate interne, monitorizare) | ISO/IEC 17025:2017, cl. 7.7 (titlu) ([NATA](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)) | VS pentru titlu; **N** pentru text |
| C8 | Înregistrări tehnice cu modificări trasabile; controlul înregistrărilor; controlul datelor și informațiilor (LIMS validat înainte de introducere) | ISO/IEC 17025:2017 cl. 7.5, 7.11, 8.4 (titlu 8.4 confirmat în NATA); numerotarea 7.5 și 7.11 provine din textul aplicației | VS pentru 8.4; **N** pentru 7.5 și 7.11 |
| C9 | Conținutul raportului, inclusiv corecturi/modificări ale rapoartelor emise | ISO/IEC 17025:2017 cl. 7.8 (7.8.8 pentru modificări — numerotare **[de verificat]**) | **N** |
| C10 | Primirea probelor și abaterile constatate la recepție | ISO/IEC 17025:2017 cl. 7.4 (7.4.3 citat în aplicație) | **N** |
| C11 | Lucrări neconforme | ISO/IEC 17025:2017 cl. 7.10 (citat în aplicație) | **N** |
| C12 | Laboratoarele oficiale pentru controale oficiale trebuie să lucreze conform EN ISO/IEC 17025 și să fie acreditate, iar acreditarea acoperă metodele folosite | Reg. (UE) 2017/625, art. 37 alin. (4) lit. (e) și alin. (5) ([legislation.gov.uk, text original](https://www.legislation.gov.uk/eur/2017/625/article/37/data.htm)) | VS |
| C13 | Integritatea datelor: principii ALCOA/ALCOA+, jurnal de audit (definiție în glosar) | MHRA, „GxP Data Integrity Guidance and Definitions", rev. 1, martie 2018, glosar pct. 6.13 pentru „audit trail" ([PDF GOV.UK](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/687246/MHRA_GxP_data_integrity_guide_March_edited_Final.pdf)) | VS pentru existență și poziția definiției; formularea ALCOA **N**. Ghidul vizează domeniul GxP; aici este folosit ca grilă de bune practici, nu ca obligație legală |
| C14 | Control de versiuni al rezultatelor și al rapoartelor emise (păstrarea stării emise; corecții prin raport modificat) | Derivat din C8, C9, C13; sursă normativă directă neconfirmată | **N** |

## 2. Acoperirea cerințelor de către cod

Legendă: **A** = acoperită, **P** = parțială, **L** = lipsă.

| ID | Stare | Dovezi în cod | Observații |
|---|---|---|---|
| C1 limite | **P** | `db/evaluation.js`: `RULE_PROFILES`, `getRuleProfile()`, `DEFAULT_LIMITS`; `routes/samples.js` `POST /` (`limitFor`) | 20 de profiluri codificate în sursă, cu citare textuală a punctelor. Fără versiune sau dată de intrare în vigoare stocată la nivel de rezultat. Alegerea profilului se face prin cuvinte-cheie în text liber. Pentru categorii nerecunoscute se aplică silențios limite implicite (`DEFAULT_LIMITS`), fără semnalare pe buletin. Operatorul poate suprascrie limitele (`routes/results.js` `PUT /:sampleId`), fără motiv obligatoriu. Valorile **[de verificat]** |
| C2 prelevare și analiză | **P** | `routes/samples.js` `POST /` (`samplingAttested`, `sample_date`, jurnal `sampling_attested`); `routes/results.js` `PUT` (metodă, echipament, dată obligatorii la trimitere) | Doar atestarea prelevării. Nu există dimensiunea lotului, numărul de probe elementare, masa probei, pregătirea probei, LOQ/LOD, recuperare. README declară explicit că nu este implementat |
| C3 incertitudine | **L** | — | Nicio coloană, niciun calcul, nicio afișare. `evaluateResult()` compară valoarea brută cu limita |
| C4 regulă de decizie | **L** | `db/evaluation.js` `evaluateResult()` (acceptare simplă: depășire dacă valoarea > limită) | README și matricea din `public/i18n.js` (`qMap9`) afirmă că regula „se păstrează cu rezultatul"; în cod nu există câmp, tabel sau cerere de revizuire a cererii care să o stocheze |
| C5 validarea metodelor | **L** | `results.method` (text liber) | Nicio legătură cu un registru de metode, cu parametri de performanță sau cu starea validării |
| C6 trasabilitate metrologică | **L** | `results.equipment` (text liber) | Fără registru de echipamente, stare de calibrare, etaloane, loturi de reactivi. Aplicația declară că este în afara domeniului (`qMap13`) |
| C7 validitatea rezultatelor | **P** | `routes/samples.js` `POST /control`; `is_control_sample`, `control_expected_json`; `qc_status` | Probele de control există, dar evaluarea marchează „fail" numai dacă valoarea măsurată > țintă, deci o recuperare scăzută nu este detectată. `qc_status` este ales manual de operator și nu este derivat din controale. Fără grafice de control sau reguli de acceptare a seriei |
| C8 înregistrări tehnice și control date | **P** | `result_versions` (`routes/results.js` `PUT`: snapshot + SHA-256 + motiv); `audit_log`; blocarea editării după validare; `GET /:sampleId/versions` | Vezi lacunele L6–L8 |
| C9 raport și corecturi | **P** | `routes/results.js` `POST /:sampleId/validate` (număr buletin unic, index `idx_results_bulletin_no_unique`); `public/app.js` `renderBulletinReadOnly`; `GET /public/verify/:bulletinNo`; `routes/samples.js` `POST /:id/retest` | Buletinul se redă din tabele curente, nu dintr-un instantaneu al stării emise. Nu există mecanism de buletin modificat cu trimitere la original; corecția = probă nouă legată prin `retest_of_sample_id` |
| C10 primire probe | **P** | `results.intake_checked_at`, `qc_rejection_reason`; `GET /:sampleId/rejection-certificate`; `GET /stats/intake-time` | Confirmare și respingere cu motiv. Fără starea probei la recepție (ambalaj, temperatură, cantitate) |
| C11 lucrări neconforme | **P** | `nonconforming_work`; `routes/results.js` rutele `/:sampleId/nonconforming` | Flux minimal, declarat ca atare; fără CAPA |
| C12 acreditare | — | — | Ține de laborator, nu de software |
| C13 integritate / jurnal | **P** | `audit_log` (utilizator, acțiune, detalii, moment); roluri impuse server-side (`middleware/auth.js`); separarea operator/aprobator (`POST /:sampleId/review`) | Jurnal fără protecție la modificare; evenimente importante neînregistrate. Vezi L7, L8, L9 |
| C14 control de versiuni | **P** | `result_versions`, `snapshot_hash` | Vezi L6, L10 |

**Constatări transversale de consecvență** (documentație față de cod):
- Testul `VAL-06` din `db/database.js` (`validationSeed`) afirmă că „o modificare după validare retrage validarea", dar codul interzice orice modificare după validare (HTTP 403 în `PUT /:sampleId`).
- Testul `VAL-08` afirmă verificare publică „fără expunerea rezultatelor publice", dar `GET /api/results/public/verify/:bulletinNo` returnează toate valorile, metoda, echipamentul și codul probei, iar `public/verify.html` le afișează.
- Matricea `qMap7` descrie fluxul operator → verificator → validator (trei roluri); implementarea are două roluri de execuție, iar validatorul efectuează atât aprobarea, cât și validarea. Rolul `admin` poate introduce rezultate și poate valida (separare neimpusă pentru administrator).
- Matricea `qMap8` menționează „report versions"; nu există tabel de versiuni ale raportului.

## 3. Lacune, ordonate după importanța pentru pilot

Criteriul de ordonare: efectul asupra corectitudinii deciziei de conformitate și asupra posibilității de a susține rezultatul în fața unui evaluator. Efort: **mic** (sub ~1 zi), **mediu** (câteva zile), **mare** (săptămâni sau dependență de decizii ale laboratorului).

| Nr. | Categorie | Lacună | Efort |
|---|---|---|---|
| L1 | Corectitudine | **Evaluarea din arhive și exporturi ignoră M1, DON, ZEA, FUM.** `GET /archive` și `GET /archive/export` (în `routes/results.js` și `routes/samples.js`) apelează `evaluateResult()` fără acești analiți: pentru lapte statusul rămâne „în așteptare", iar o depășire de DON/ZEA/FUM apare ca „conform". Exporturile CSV nu conțin aceste coloane. Coada și detaliul folosesc evaluarea completă, deci apar rezultate contradictorii între ecrane | mic |
| L2 | Metrologie | **Incertitudinea de măsurare lipsește** (câmp, calcul, afișare pe buletin, utilizare în evaluare). Cerință C3 | mare |
| L3 | Validarea metodelor | **Fără parametri de performanță și LOQ/LOD.** Metoda este text liber; nu există recuperare, repetabilitate, LOQ, stare de validare, nici reprezentare pentru „< LOQ"/„nedetectat" (câmpurile acceptă doar numere nenegative). Efect asupra calculului sumei aflatoxinelor când o componentă este sub LOQ. Regula aplicabilă din Reg. 2023/2782 **[de verificat]**. Cerințe C2, C5 | mare |
| L4 | Conformitate | **Regula de decizie nu este stocată sau convenită cu clientul.** Evaluarea este acceptare simplă, fără declarație de regulă pe buletin; matricea internă afirmă contrariul. Cerința C4 | mediu |
| L5 | Limite | **Guvernanța limitelor.** Valorile sunt în cod, fără versiune și dată de aplicare pe rezultat; fallback silențios la `DEFAULT_LIMITS` pentru categorii nerecunoscute; potrivire prin cuvinte-cheie (risc de profil greșit); suprascriere de către operator fără motiv; valorile nu au putut fi reconfirmate pe EUR-Lex în acest audit. Cerința C1 | mediu |
| L6 | Versiuni / raport | **Buletinul nu este un instantaneu al stării emise.** Se redă din tabele curente, inclusiv din `lab_settings` (denumire, semnătură, ștampilă), modificabile după emitere; reimprimarea unui buletin vechi poate arăta altă identitate vizuală. Validarea, aprobarea și resetarea nu creează versiuni în `result_versions`. Cerințe C9, C14 | mediu |
| L7 | Audit | **Jurnal fără protecție la modificare.** `audit_log` și `result_versions` pot fi modificate sau șterse direct în baza de date; fără înlănțuire de hash-uri sau declanșatoare care să interzică `UPDATE`/`DELETE`; hash-ul din `snapshot_hash` nu se verifică nicăieri. Cerința C13 | mediu |
| L8 | Audit | **Evenimente neînregistrate:** crearea conturilor de operator/validator, modificarea setărilor laboratorului, modificarea termenului (`PUT /:id/due-date`), executarea testelor de validare a sistemului, incidente fără probă asociată. `audit_log.sample_id` este `NOT NULL`, deci evenimentele fără probă nu pot fi înregistrate. Nu există dezactivare de cont (doar imposibilitatea ștergerii, fără stare „inactiv") | mediu |
| L9 | Testare | **Validarea sistemului este doar declarativă.** Cele opt teste `VAL-01..08` se bifează manual și nu au pași sau dovezi atașate; nu există teste automate (unitare pentru `evaluateResult`, `mannKendall`, numerotare); `scripts/release-check.js` verifică doar fișiere, versiuni și sintaxă; scripturile din `test/` depind de căi locale ale unui calculator personal și nu rulează în depozit. Cerința C8 (validarea LIMS) | mediu |
| L10 | Raport | **Fără mecanism de buletin modificat.** Corecția după validare impune probă nouă; nu există emiterea unui buletin modificat cu trimitere la cel inițial. Conținutul obligatoriu al raportului (cl. 7.8) nu a fost confruntat cu standardul **[de verificat]** | mediu |
| L11 | Operațional | **Fără backup și restaurare.** Baza de date este un fișier SQLite în depozit (cu WAL); nu există script de copiere, verificare de integritate sau procedură de restaurare. README recunoaște lipsa | mic |
| L12 | Operațional | **Retenție și arhivare.** Fără politică sau funcție de export complet al dosarului probei și al buletinului emis (PDF/arhivă), în afara exportului CSV incomplet (vezi L1). Cerința C8 (8.4) | mediu |
| L13 | Controlul calității | **Controalele nu alimentează decizia de QC.** Evaluarea probelor de control e unilaterală (fail doar la depășire); fără interval de acceptare, fără istoric/grafic, fără legătură cu `qc_status`. Cerința C7 | mediu |
| L14 | Metrologie | **Echipamente, etaloane, reactivi:** text liber, fără registru, fără stare de calibrare, fără loturi de materiale de referință. Aplicația declară domeniul în afara sa. Cerința C6 | mare |
| L15 | Prelevare | **Date de prelevare și lot lipsă** (dimensiunea lotului, sublot, număr de probe elementare, masa probei de laborator). Doar atestarea beneficiarului. Cerința C2 | mediu |
| L16 | Recepție | **Starea probei la recepție neînregistrată** (ambalaj, cantitate, condiții de transport); există doar confirmare și respingere cu motiv. Cerința C10 | mic |
| L17 | Separarea sarcinilor | Rolul `admin` poate introduce rezultate și poate valida; același validator aprobă și validează. Poate fi acceptabil într-un laborator mic, dar trebuie decis și documentat | mic |
| L18 | Public | **Pagina publică de verificare expune toate valorile** și codul probei, contrar `VAL-08`. Alegerea între „doar validitate" și „rezultate complete" aparține laboratorului | mic |
| L19 | Date | **Mărci temporale neuniforme:** `datetime('now','localtime')` (fără decalaj) în majoritatea tabelelor, șiruri ISO UTC în `incidents.js` și în `sampling_attested`; ambiguitate la schimbarea orei; mici riscuri la calculul duratelor | mic |
| L20 | Date | **Imposibilitatea ștergerii unei valori introduse greșit:** `UPDATE ... COALESCE(?, coloană)` nu permite resetarea la gol, doar suprascrierea; nu există mecanism trasabil de „valoare retrasă" | mic |
| L21 | Documentare | **Neconcordanțe între documentație și cod** (`VAL-06`, `VAL-08`, `qMap7`, `qMap8`, `qMap9`; vezi §2) | mic |
| L22 | Unități | Unitatea (µg/kg) este fixă în interfață; baza de raportare (masă proaspătă/uscată) și alte unități nu se pot înregistra. Relevanța pentru reglementare **[de verificat]** | mic |

**Număr de lacune pe categorii:**

| Categorie | Număr | Lacune |
|---|---|---|
| Corectitudine și conformitate (evaluare, limite, regulă de decizie) | 3 | L1, L4, L5 |
| Metrologie și validarea metodelor | 4 | L2, L3, L13, L14 |
| Trasabilitate, audit și versiuni | 5 | L6, L7, L8, L19, L20 |
| Raportare și recepție | 5 | L10, L15, L16, L18, L22 |
| Validarea sistemului și documentare | 2 | L9, L21 |
| Operațional (backup, retenție) | 2 | L11, L12 |
| Separarea sarcinilor | 1 | L17 |
| **Total** | **22** | |

Pe efort: mic — 9 (L1, L11, L16, L17, L18, L19, L20, L21, L22); mediu — 10 (L4, L5, L6, L7, L8, L9, L10, L12, L13, L15); mare — 3 (L2, L3, L14). Total 22.

**Recomandare de ordine pentru pilot (pentru etapa următoare):** L1 (corecție rapidă, efect direct asupra deciziilor), apoi L11 (backup), L5 și L4 (decizii de guvernanță luate împreună cu laboratorul), L6–L8 (integritatea înregistrărilor), L9 (plan de validare), iar L2 și L3 după stabilirea împreună cu laboratorul a metodei analitice și a parametrilor ei de validare.

## 4. Întrebări deschise pentru laborator

1. Metoda analitică folosită în pilot și dosarul ei de validare (LOQ, recuperare, incertitudine)?
2. Regula de decizie convenită cu clienții (acceptare simplă sau cu bandă de gardă)?
3. Cine semnează buletinul (validator, administrator) și există limitări de competență [de completat]?
4. Politica de retenție a înregistrărilor [de completat]?

## 5. Etapa finală: securizare

Conform instrucțiunii, aspectele de securizare sunt **amânate pentru ultimul pas al proiectului** și nu fac obiectul acestui audit. Sunt consemnate doar existența lor, fără valori și fără recomandări de modificare acum:

- în `test/acceptanta-figuri-final*.cjs` sunt scrise parole de test, în clar, pentru conturile de acceptanță;
- în `server.js` există o valoare implicită pentru secretul de sesiune, utilizată când variabila de mediu lipsește;
- politica de parole (lungime minimă) și absența unei proceduri de recuperare a parolei;
- aplicația ascultă pe toate interfețele de rețea (`0.0.0.0`) și cookie-ul de sesiune este marcat `secure` numai în producție.
