# Audit Etapa A — Registru Micotoxine față de cerințele industriei (revizia 2)

**Obiect:** depozitul `Radu-Cristian-Toma/lims-micotoxine`, ramura `main`, commit `2c1e052` (după PR #1–#3), versiunea declarată 1.53.5.
**Nișa de referință:** laborator de încercări acreditat conform ISO/IEC 17025 (valoare implicită; nișa din proiectul LIMS nu a fost furnizată) [de confirmat].
**Data auditului:** 2026-10-21.
**Revizuiește:** auditul din 2026-10-17 (commit `11e4747`, 22 de lacune). Numerotarea L1–L22 este păstrată, fiindcă commit-urile Etapei B o citează; lacunele noi primesc L23–L24. Ordinea de prioritate este dată de coloana „Rang", nu de număr.
**Metodă:** citirea codului de server (`server.js`, `config.js`, `db/*`, `routes/*`, `middleware/*`, `scripts/*`), interogări țintite în `public/app.js`, `public/i18n.js`, `public/verify.html`, `docs/*`, `test/*`, confruntarea limitelor din `db/evaluation.js` cu textul consolidat al Reg. (UE) 2023/915 și verificarea surselor normative pe net. Aplicația nu a fost rulată; nu s-au folosit date reale, chei sau parole. Niciun fișier de cod nu a fost modificat.

## Rezumat

- **Ce s-a schimbat față de revizia 1:** (a) textul Reg. (UE) 2023/2782 și versiunea consolidată a Reg. (UE) 2023/915 au putut fi citite pe EUR-Lex, deci majoritatea cerințelor din categoria „neconfirmat" sunt acum confirmate; (b) starea fiecărei lacune a fost reverificată față de `main`, după PR-urile Etapei B (B, B2, B3); (c) confruntarea celor 22 de profiluri de limite cu Anexa I a scos la iveală două discrepanțe încă prezente (L23) și lacune de acoperire (L24); (d) rezultatele analitice nu poartă nici incertitudine, nici recuperare, nici LOQ, deci regula de acceptare din Reg. (UE) 2023/2782 nu poate fi aplicată (L2–L4).
- **Total:** 24 de lacune: 1 remediată (L1), 3 parțial remediate (L5, L9, L11), 20 deschise.
- **Cea mai urgentă pentru pilot:** L23 (două erori de limită, una cu efect „conform" fals), apoi L5, L2, L4, L3.

## 0. Limitele auditului

1. **Reglementări UE.** Textul Reg. (UE) 2023/2782 și versiunea consolidată `02023R0915-20250101` au fost citite pe EUR-Lex (pagina HTML) prin instrumentul de citire web, care rezumă automat textul lung. Valorile numerice din 2023/915 provin din acest rezumat și trebuie reconfirmate manual înainte de decizii reale de conformitate. Pentru 2023/2782 textul a fost accesibil numai până la pct. 4.2.1.1 din Anexa II; pct. 4.3 și 4.4 provin dintr-o sursă secundară (marcate **VS**). Accesul direct la EUR-Lex din shell a fost refuzat de proxy și nu a fost ocolit. Nu s-a putut stabili dacă există o versiune consolidată ulterioară datei 2025-01-01 [de verificat].
2. **Standarde ISO.** ISO/IEC 17025:2017 este un standard cu plată. Titlurile clauzelor 6.4, 6.5, 7.2.2, 7.5, 7.6, 7.7, 7.8, 7.8.2 și 7.8.6 sunt confirmate prin documentul NATA indicat la §1; clauzele 7.1.3, 7.8.6.1 și 7.8.6.2 sunt confirmate așa cum le citează ILAC G8. Clauzele 7.4, 7.8.3, 7.8.8, 7.10, 7.11 și 8.4 rămân **[de verificat]** pe exemplarul standardului. În revizia 1, titlul 8.4 era notat ca „confirmat în NATA"; în documentul NATA consultat acum nu apare, deci confirmarea este retrasă.
3. **Teste.** `test/unit/capsicum-limits.test.js` a rulat cu `node --test`, fără dependențe: 16 din 16 trecute. Celelalte trei fișiere (`archive-evaluation`, `backup`, `listen-host`) nu au putut fi executate în această sesiune: instalarea `better-sqlite3` (compilare nativă) a eșuat, fiindcă descărcarea antetelor Node a fost refuzată de proxy (cod 403), iar `express` lipsește. Aceste trei fișiere sunt deci neverificate aici.
4. **Rolul auditului.** Documentul evaluează acoperirea software-ului, nu conformitatea laboratorului. Validarea LIMS pentru utilizarea intenționată rămâne responsabilitatea laboratorului.
5. **Domeniul Reg. (UE) 2023/2782.** Titlul reglementării vizează „controlul nivelurilor de micotoxine în alimente"; măsura în care se aplică obligatoriu unui laborator care nu efectuează controale oficiale trebuie stabilită cu laboratorul [de confirmat]. README tratează reglementarea ca reper pentru procedura de laborator.

## 1. Cerințe relevante și sursele lor

Legendă „Verificare": **V** = confirmat în sursa indicată, în această sesiune; **VS** = confirmat numai într-o sursă secundară; **N** = neconfirmat, **[de verificat]**.

| ID | Cerință | Sursă | Verificare |
|---|---|---|---|
| C1 | Limite maxime pentru micotoxine în alimente (aflatoxine, OTA, DON, ZEA, fumonizine, AFM1), pe categorii de produs | Reg. (UE) 2023/915, Anexa I, versiunea consolidată 2025-01-01 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02023R0915-20250101)); modificări incluse: 2023/1510, 2024/1002, 2024/1003, 2024/1022, 2024/1038, 2024/1683, 2024/1756, 2024/1808; pentru OTA la cereale, ZEA și fumonizine: [Reg. 2024/1756](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1756) | **V** pentru valori și puncte din Anexa I (rezumat automat; vezi Anexa A). Data de aplicare a 2023/915 (25.05.2023, conform revizie 1): **VS**. Versiune consolidată ulterioară: **N** |
| C2 | Metode de prelevare și analiză pentru micotoxine; abrogă Reg. (CE) 401/2006; se aplică din 1.04.2024; cerințele pct. 4.3 din Anexa II la 401/2006 rămân valabile pentru metodele validate înainte, până la 1.01.2029 | Reg. de punere în aplicare (UE) 2023/2782, art. 2–5 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R2782)) | **V** |
| C2a | Prelevare: probe elementare repartizate în lot/sublot, probă agregată; numărul de probe elementare și masele variază pe categorii (de exemplu 100 de probe elementare pentru cereale) | Reg. 2023/2782, Anexa I, partea I (pct. A.1.2, A.1.4) și partea II (tabele pe categorii) | **V** |
| C2b | Tratarea probei de laborator: omogenizare „cu extremă grijă", excluderea luminii pentru aflatoxine, proporția coajă/miez la nuci, replici din proba agregată omogenizată | Reg. 2023/2782, Anexa II, pct. 1–3 | **V** |
| C2c | Criterii de performanță ale metodelor confirmatorii: recuperare medie 70–120 % (excepțional 50–130 %), RSDr ≤ 20 %, RSDwR ≤ 20 %, RSDR ≤ 25 %; LOQ ≤ 0,5·LM, preferabil ≤ 0,2·LM; pentru sume, LOQ-ul fiecărui component ≤ 0,5·LM/n; adevăr verificat cu material de referință certificat și/sau teste de aptitudine | Reg. 2023/2782, Anexa II, pct. 4.1 și 4.2.1.1 | **V** pentru recuperare, RSD și pct. 4.1; **VS** pentru LOQ ([LawPlayer](https://lawplayer.com/eu/article/32023R2782/anx_II)) |
| C2d | Raportarea: corecție pentru recuperare când este cazul (nu este necesară la recuperare 90–110 %); rezultat „x ± U" cu factor de acoperire 2; incertitudine implicită 50 % numai cu condiții; pentru sume, abordare „lower-bound" (valorile sub LOQ se înlocuiesc cu zero); componentele individuale se raportează | Reg. 2023/2782, Anexa II, pct. 4.3.1 | **VS** ([LawPlayer](https://lawplayer.com/eu/article/32023R2782/anx_II)); **[de verificat]** pe EUR-Lex |
| C2e | Regula de acceptare a lotului: lotul se acceptă dacă proba de laborator este conformă „ținând cont de corecția pentru recuperare și de incertitudinea de măsurare"; se respinge dacă rezultatul corectat pentru recuperare minus incertitudinea extinsă depășește limita maximă | Reg. 2023/2782, Anexa I, partea I (pct. A.6) și punctele echivalente din partea II (II.B.7, II.C.8, II.D.8, II.E.7, II.F.3, II.G.7) | **V** pentru conținut, după rezumatul instrumentului; numerotarea exactă **[de verificat]** |
| C3 | Evaluarea incertitudinii de măsurare | ISO/IEC 17025:2017, cl. 7.6 „Evaluation of measurement uncertainty" ([NATA](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)) | **V** pentru titlu; **N** pentru text |
| C4 | Regula de decizie și declarația de conformitate: regula se definește și se convine cu clientul (cl. 7.1.3), se documentează cu luarea în considerare a riscului de acceptare/respingere falsă (7.8.6.1) și se identifică în raport (7.8.6.2), cu excepția cazului în care este inerentă specificației. „Acceptarea simplă" are bandă de gardă zero (G8, pct. 1.9 și 4.1) | [ILAC G8:09/2019](https://www.nite.go.jp/data/000118179.pdf) (copie găzduită de NITE); [Eurachem/CITAC, „Use of uncertainty information in compliance assessment", ed. 2, 2021](https://eurachem.org/index.php/publications/guides/uncertcompliance) | **V** (clauzele sunt citate de G8; textul ISO nu a fost consultat direct) |
| C5 | Selecția, verificarea și validarea metodelor | ISO/IEC 17025:2017, cl. 7.2.2 „Validation of methods" ([NATA](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)); Reg. 2023/2782, Anexa II, pct. 4.2.1 | **V** pentru titlu și Anexa II; **N** pentru textul ISO |
| C6 | Echipamente și trasabilitate metrologică | ISO/IEC 17025:2017, cl. 6.4 „Equipment" și 6.5 „Metrological traceability" ([NATA](https://nata.com.au/files/2024/10/ISO-IEC-17025-Standard-Application-Document.pdf)) | **V** pentru titluri; **N** pentru text |
| C7 | Asigurarea validității rezultatelor (controale interne, monitorizare) | ISO/IEC 17025:2017, cl. 7.7 „Assuring the validity of results" (NATA, ca mai sus); Reg. 2023/2782, Anexa II, pct. 4.1 (material de referință, teste de aptitudine) | **V** pentru titlu și pct. 4.1; **N** pentru text ISO |
| C8 | Înregistrări tehnice cu modificări trasabile; controlul datelor și informațiilor (LIMS validat înainte de introducere); controlul înregistrărilor | ISO/IEC 17025:2017, cl. 7.5 „Technical records" (NATA); cl. 7.11 și 8.4 | **V** pentru titlul 7.5; **[de verificat]** pentru 7.11 și 8.4 |
| C9 | Conținutul raportului și modificarea rapoartelor emise | ISO/IEC 17025:2017, cl. 7.8 „Reporting of results" și 7.8.2 (NATA); cl. 7.8.3 și 7.8.8 | **V** pentru 7.8 și 7.8.2; **[de verificat]** pentru 7.8.3 și 7.8.8 |
| C10 | Primirea probelor și abaterile constatate la recepție | ISO/IEC 17025:2017, cl. 7.4 (7.4.3 citat în aplicație) | **[de verificat]** |
| C11 | Lucrări neconforme | ISO/IEC 17025:2017, cl. 7.10 (citat în aplicație) | **[de verificat]** |
| C12 | Laboratoarele oficiale funcționează conform EN ISO/IEC 17025 și sunt acreditate; domeniul acreditării acoperă metodele folosite; Reg. 2023/2782, pct. 4.4, trimite la art. 37 alin. (4)–(5) | Reg. (UE) 2017/625, art. 37 alin. (4) lit. (e) și alin. (5) ([legislation.gov.uk, text original](https://www.legislation.gov.uk/eur/2017/625/article/37/data.htm)) | **V** pentru art. 37; trimiterea din 2023/2782 pct. 4.4: **VS** |
| C13 | Integritatea datelor: ALCOA/ALCOA+; jurnal de audit definit ca metadată cu înregistrare sigură a creării, adăugărilor, ștergerilor, modificărilor; revizuire documentată bazată pe risc; modificări datate și cu oră, cu fusul orar acolo unde este cazul; ceasuri controlate | MHRA, „GxP Data Integrity Guidance and Definitions", rev. 1, martie 2018: pct. 3.10 (ALCOA), 6.13 (audit trail, mărci temporale), 6.15, 5.1 ([PDF GOV.UK](https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/687246/MHRA_GxP_data_integrity_guide_March_edited_Final.pdf)) | **V**. Ghidul vizează domeniul GxP; aici este grilă de bune practici, nu obligație legală. Pagina FDA consultată nu definește ALCOA și nu este folosită ca sursă |
| C14 | Control de versiuni al rezultatelor și al rapoartelor emise (păstrarea stării emise; corecții prin raport modificat) | Derivată din C8, C9, C13 | **N** (sursă normativă directă neconfirmată) |
| C15 | Confidențialitatea informațiilor clientului | ISO/IEC 17025:2017, cl. 4.2 | **[de verificat]** |

## 2. Acoperirea cerințelor de către cod

Legendă: **A** = acoperită, **P** = parțială, **L** = lipsă. Dovezile indică fișierul și funcția sau ruta, în starea din `main`.

| ID | Stare | Dovezi în cod | Observații |
|---|---|---|---|
| C1 limite | **P** | `db/evaluation.js`: `RULE_PROFILES` (22 de profiluri), `getRuleProfile()`, `DEFAULT_LIMITS`, `availableGroupsForProfile()`; `routes/samples.js` `POST /` (`limitFor`) | După B2/B3, toate punctele citate în profiluri coincid cu versiunea consolidată (Anexa A). Rămân: două discrepanțe de valoare (L23), lacune de acoperire (L24), fără versiune/dată a reglementării pe rezultat, fallback tăcut la `DEFAULT_LIMITS`, alegere prin cuvinte-cheie, suprascriere de către operator fără motiv (L5) |
| C2a prelevare | **P** | `routes/samples.js` `POST /` (`samplingAttested`, `sample_date`, jurnal `sampling_attested`); `public/i18n.js` `samplingDisclaimer` | Doar atestarea beneficiarului. Fără dimensiunea lotului/sublotului, număr de probe elementare, masă (L15) |
| C2b tratarea probei | **L** | — | Nicio înregistrare a omogenizării, a masei probei de laborator, a proporției coajă/miez, a replicilor (L15) |
| C2c performanța metodei | **L** | `results.method` (text liber) | Fără recuperare, RSD, LOQ, stare de validare, legătură cu un registru de metode (L3) |
| C2d raportare (U, recuperare, sume) | **L** | `db/evaluation.js` `evaluateResult()` | Nicio coloană pentru incertitudine, recuperare sau „< LOQ"; câmpurile acceptă doar numere nenegative; fără abordarea „lower-bound" pentru sume (L2, L3) |
| C2e regula de acceptare | **L** | `db/evaluation.js` `evaluateResult()` | Compară valoarea brută cu limita: „depășire" dacă valoarea > limită. Regulamentul respinge numai dacă valoarea corectată minus U depășește limita, deci aplicația poate declara „depășire" pentru loturi acceptabile conform 2023/2782 (L4, L2) |
| C3 incertitudine | **L** | — | Nicio coloană, niciun calcul, nicio afișare pe buletin (L2) |
| C4 regulă de decizie | **L** | `db/evaluation.js` `evaluateResult()` (acceptare simplă, implicită) | Nu există câmp, tabel sau cerere de revizuire a cererii care să stocheze regula; matricea `qMap9` din `public/i18n.js` afirmă că „regula se păstrează cu rezultatul" (L4, L21) |
| C5 validarea metodelor | **L** | `results.method` | Vezi C2c (L3) |
| C6 echipamente, trasabilitate | **L** | `results.equipment` (text liber) | Fără registru, stare de calibrare, etaloane, loturi de reactivi. Aplicația declară domeniul în afara sa (`qMap13`) (L14) |
| C7 validitatea rezultatelor | **P** | `routes/samples.js` `POST /control`; `samples.is_control_sample`, `control_expected_json`; `results.qc_status` | Proba de control este „fail" numai dacă valoarea > țintă, deci o recuperare scăzută nu este detectată; `qc_status` este ales manual; `control_expected_json` este scris, dar nu este citit pentru nicio decizie (L13) |
| C8 înregistrări tehnice | **P** | `result_versions` (`routes/results.js` `PUT /:sampleId`: instantaneu + SHA-256 + motiv); `audit_log`; blocarea modificării după validare; `GET /:sampleId/versions` | Vezi L6–L8, L20 |
| C9 raport | **P** | `routes/results.js` `POST /:sampleId/validate` (număr unic, index `idx_results_bulletin_no_unique`); `public/app.js` `renderBulletinReadOnly()`; `GET /public/verify/:bulletinNo`; `routes/samples.js` `POST /:id/retest` | Buletinul se redă din tabelele curente; fără raport modificat cu trimitere la original (L6, L10) |
| C10 primire probe | **P** | `results.intake_checked_at`, `qc_rejection_reason`; `GET /:sampleId/rejection-certificate`; `GET /stats/intake-time` | Confirmare și respingere cu motiv; fără starea probei la recepție (L16) |
| C11 lucrări neconforme | **P** | `nonconforming_work`; rutele `/:sampleId/nonconforming` | Flux minimal, declarat ca atare; fără CAPA |
| C12 acreditare | — | — | Ține de laborator, nu de software |
| C13 integritate, jurnal | **P** | `audit_log`; roluri impuse pe server (`middleware/auth.js`); separarea operator/aprobator (`POST /:sampleId/review`) | Jurnal fără protecție la modificare; evenimente neînregistrate; mărci temporale neuniforme (L7, L8, L19) |
| C14 versiuni | **P** | `result_versions`, `snapshot_hash` | Hash-ul se scrie și se afișează, dar nu se verifică nicăieri și nu este înlănțuit; validarea, aprobarea și resetarea nu creează versiuni (L6, L7) |
| C15 confidențialitate | **P** | `middleware/auth.js` `requireSampleAccess()`; `GET /api/samples/mine` (filtrat pe `owner_id`) | Izolarea pe beneficiar este impusă pe server. Pagina publică de verificare returnează însă valorile și codul probei oricui cunoaște numărul buletinului, care este secvențial (L18) |

**Constatări transversale de consecvență (documentație față de cod):**
- Testul `VAL-06` din `db/database.js` (`validationSeed`) afirmă că „o modificare după validare retrage validarea"; codul interzice orice modificare după validare (HTTP 403 în `PUT /:sampleId`).
- Testul `VAL-08` afirmă verificare publică „fără expunerea rezultatelor publice"; `GET /api/results/public/verify/:bulletinNo` returnează valorile, metoda și echipamentul, iar `public/verify.html` le afișează.
- Matricea `qMap7` descrie fluxul operator → verificator → validator; implementarea are două roluri de execuție, iar validatorul face atât aprobarea, cât și validarea; rolul `admin` poate introduce rezultate și poate valida.
- Matricea `qMap8` menționează „report versions"; nu există tabel de versiuni ale raportului.

## 3. Lacune, ordonate după importanța pentru pilot

Criteriul de ordonare: efectul asupra corectitudinii deciziei de conformitate și asupra posibilității de a susține rezultatul în fața unui evaluator. Efort: **mic** (sub ~1 zi), **mediu** (câteva zile), **mare** (săptămâni sau dependență de decizii ale laboratorului). Stare față de `main`: **Deschisă**, **Parțial remediată**, **Remediată**.

| Rang | Nr. | Categorie | Lacună | Stare | Efort |
|---|---|---|---|---|---|
| 1 | L23 | Corectitudine | **Două erori de valoare în profilurile de limite, confirmate pe Anexa I.** (a) Profilul „Cereale / produse derivate pentru consumatorul final" include cuvântul-cheie „făină" și aplică DON 750 µg/kg; pentru produsele de măcinare a cerealelor, pct. 1.4.5 indică 600 µg/kg, deci o făină între 600 și 750 µg/kg apare „conformă" (efect de tip acceptare falsă). (b) Profilul „Fructe uscate pentru consumatorul final" include „stafide" și aplică OTA 2,0 µg/kg; pentru fructele de vită-de-vie uscate (coarinte, stafide, sultanine) pct. 1.2.1.1 indică 8,0 µg/kg, deci o probă între 2 și 8 µg/kg apare „depășire" (respingere falsă). Același 2,0 se aplică și în profilul „înainte de sortare", unde 1.2.1.1 nu este modelat. Valori reconfirmate în Anexa A; reconfirmare manuală pe textul oficial înainte de corecție | Deschisă | mic |
| 2 | L5 | Corectitudine | **Guvernanța limitelor.** Citările de puncte au fost corectate în B2/B3 și s-a adăugat profilul Capsicum. Rămân: valorile sunt în cod, fără versiune și dată de aplicare stocate pe rezultat; fallback tăcut la `DEFAULT_LIMITS` (AFB1 2, sumă 4, OTA 3) pentru categorii nerecunoscute, cu verdict „conform/depășire" pe buletin; potrivire prin cuvinte-cheie în text liber (de exemplu „alune" este ambiguu între arahide și alune de pădure); suprascriere de către operator fără motiv obligatoriu; buletinul nu indică reglementarea aplicată. Cerința C1 | Parțial remediată | mediu |
| 3 | L2 | Metrologie | **Incertitudinea de măsurare lipsește** (câmp, calcul, afișare pe buletin, utilizare în evaluare). Fără ea nu se poate aplica regula de acceptare din Reg. 2023/2782. Cerințe C2d, C2e, C3 | Deschisă | mare |
| 4 | L4 | Conformitate | **Regula de decizie nu este stocată sau convenită cu clientul.** Evaluarea este acceptare simplă (bandă de gardă zero) și poate declara „depășire" acolo unde regulamentul acceptă lotul. Buletinul nu declară regula aplicată. Cerințele C2e, C4 | Deschisă | mediu |
| 5 | L3 | Validarea metodelor | **Fără parametri de performanță și fără LOQ/LOD.** Metoda este text liber; nu există recuperare, RSD, LOQ, stare de validare, nici reprezentare pentru „< LOQ" (câmpurile acceptă doar numere nenegative), deci nu se poate aplica abordarea „lower-bound" pentru sumă. Cerințe C2c, C2d, C5 | Deschisă | mare |
| 6 | L18 | Confidențialitate | **Pagina publică de verificare expune toate valorile** și codul probei, fără autentificare, pe baza unui număr de buletin secvențial (`BUL-AAAA-NNNNN`); rezultatele tuturor beneficiarilor pot fi enumerate. Contrar testului `VAL-08`. Alegerea între „doar validitate" și „rezultate complete" aparține laboratorului. Se tratează aici ca decizie de confidențialitate (C15), nu ca aspect de securizare tehnică | Deschisă | mic |
| 7 | L6 | Versiuni / raport | **Buletinul nu este un instantaneu al stării emise.** Se redă din tabele curente, inclusiv din `lab_settings` (denumire, semnătură, ștampilă), modificabile după emitere; semnătura afișată este setarea globală a laboratorului, nu a validatorului care a emis. Validarea, aprobarea și resetarea nu creează versiuni în `result_versions`. Cerințe C9, C14 | Deschisă | mediu |
| 8 | L10 | Raport | **Fără mecanism de buletin modificat sau retras.** Corecția după validare impune probă nouă (`retest_of_sample_id`); buletinul inițial rămâne „valid" pe pagina publică, fără stare „înlocuit/retras". Conținutul obligatoriu al raportului (cl. 7.8) nu a fost confruntat cu textul standardului. Cerința C9 | Deschisă | mediu |
| 9 | L7 | Audit | **Jurnal fără protecție la modificare.** `audit_log` și `result_versions` pot fi modificate sau șterse direct în baza de date; fără înlănțuire de hash-uri sau declanșatoare care să interzică `UPDATE`/`DELETE`; `snapshot_hash` nu se verifică nicăieri. Cerințele C13, C14 | Deschisă | mediu |
| 10 | L8 | Audit | **Evenimente neînregistrate:** crearea conturilor de operator/validator, modificarea setărilor laboratorului, modificarea termenului (`PUT /:id/due-date`), crearea probei de control, executarea testelor de validare a sistemului, incidente fără probă asociată. `audit_log.sample_id` este `NOT NULL`, deci evenimentele fără probă nu pot fi înregistrate. Cerința C13 | Deschisă | mediu |
| 11 | L9 | Testare | **Validarea sistemului este în mare parte declarativă.** `npm test` rulează 29 de cazuri în 4 fișiere (`archive-evaluation`, `backup`, `capsicum-limits`, `listen-host`); lipsesc teste pentru `evaluateResult` (calcul, sumă, QC), numerotarea buletinelor, `mannKendall`, fluxul operator → aprobare → validare. Cele opt teste `VAL-01..08` se bifează manual, fără pași și dovezi, iar rezultatul se suprascrie fără istoric. `scripts/release-check.js` verifică doar fișiere, versiuni și sintaxă. Scripturile `test/acceptanta-*.cjs` sunt separate. Cerința C8 | Parțial remediată | mediu |
| 12 | L24 | Corectitudine | **Lacune de acoperire în profilurile de limite** (confirmate pe Anexa I): DON pentru grâu dur și porumb neprocesat 1500 (pct. 1.4.2) și ovăz neprocesat 1750 (pct. 1.4.3) nu sunt modelate, iar „grâu" neprocesat poate primi limitele pentru consumatorul final; OTA 5,0 pentru semințe de floarea-soarelui, dovleac, pepene, cânepă și soia (pct. 1.2.8) lipsește din profilul oleaginoaselor, deși cuvintele-cheie le includ; OTA pentru fistic (pct. 1.2.3–1.2.4) lipsește; cafeaua solubilă (5,0, pct. 1.2.15) primește 3,0; lipsesc produsele de panificație, paste, cereale pentru micul dejun, produsele din porumb prelucrate și alimentele pentru sugari. Efect: aplicația fie nu evaluează un analit aplicabil, fie aplică o limită mai strictă. Cerința C1 | Deschisă | mediu |
| 13 | L13 | Controlul calității | **Controalele nu alimentează decizia de QC.** Evaluarea probelor de control este unilaterală (fail doar la depășire); fără interval de acceptare, istoric/grafic, valoare certificată cu incertitudinea ei, loturi de material de referință; fără legătură cu `qc_status`. Cerința C7 | Deschisă | mediu |
| 14 | L15 | Prelevare | **Date de prelevare și de pregătire a probei lipsă** (dimensiunea lotului/sublotului, număr de probe elementare, masa probei de laborator, omogenizare, replici). Doar atestarea beneficiarului. Cerințele C2a, C2b | Deschisă | mediu |
| 15 | L14 | Metrologie | **Echipamente, etaloane, reactivi:** text liber, fără registru, fără stare de calibrare, fără loturi de materiale de referință. Aplicația declară domeniul în afara sa. Cerința C6 | Deschisă | mare |
| 16 | L11 | Operațional | **Backup și restaurare.** `scripts/backup-db.js` (`npm run backup`) face copie cu API-ul de backup SQLite și o verifică (`integrity_check`, `foreign_key_check`); README descrie restaurarea. Rămân de stabilit de laborator frecvența, locul de păstrare, retenția și testele periodice de restaurare [de completat]. Teste în `test/unit/backup.test.js`, neexecutate aici | Parțial remediată | mic |
| 17 | L12 | Operațional | **Retenție și arhivare.** Fără politică sau funcție de export complet al dosarului probei și al buletinului emis (PDF/arhivă). Exportul CSV conține acum și M1, DON, ZEA, fumonizine (B), dar nu versiunile, jurnalul de audit sau buletinul. Cerința C8 | Deschisă | mediu |
| 18 | L16 | Recepție | **Starea probei la recepție neînregistrată** (ambalaj, cantitate, condiții de transport); există doar confirmare și respingere cu motiv. `intake_checked_at` se asociază cu `operator_id`, care se suprascrie la fiecare salvare, deci nu identifică sigur cine a primit proba. Cerința C10 | Deschisă | mic |
| 19 | L17 | Separarea sarcinilor | Rolul `admin` poate introduce rezultate și poate valida; același validator aprobă și validează. Poate fi acceptabil într-un laborator mic, dar trebuie decis și documentat | Deschisă | mic |
| 20 | L19 | Date | **Mărci temporale neuniforme:** `datetime('now','localtime')` (fără decalaj) în majoritatea tabelelor, șiruri ISO UTC în `routes/incidents.js` și în jurnalul `sampling_attested`; ambiguitate la schimbarea orei. Cerința C13 (MHRA 6.13, 5.1) | Deschisă | mic |
| 21 | L20 | Date | **Imposibilitatea retragerii unei valori introduse greșit:** `UPDATE ... COALESCE(?, coloană)` permite doar suprascrierea, nu resetarea la gol; nu există mecanism trasabil de „valoare retrasă" | Deschisă | mic |
| 22 | L21 | Documentare | **Neconcordanțe între documentație și cod** (`VAL-06`, `VAL-08`, `qMap7`, `qMap8`, `qMap9`; vezi §2) | Deschisă | mic |
| 23 | L22 | Unități | Unitatea (µg/kg) este fixă în interfață; baza de raportare (masă proaspătă/uscată) nu se poate înregistra; pentru alimentele pentru sugari, limitele se referă la substanța uscată (conform rezumatului pct. 1.1.18, 1.2.23, 1.4.9). Relevanța pentru pilot depinde de nișă | Deschisă | mic |
| — | L1 | Corectitudine | **Evaluarea din arhive și exporturi ignora M1, DON, ZEA, FUM.** Remediată în commit `667da3c`: `evaluateArchiveRow()` în `db/evaluation.js`, folosită de arhiva și exportul din `routes/results.js` și `routes/samples.js`; exporturile CSV conțin coloanele noi. Testul `archive-evaluation.test.js` există, dar nu a putut fi executat aici | Remediată | mic |

**Număr de lacune pe categorii (total 24; între paranteze, cele încă active):**

| Categorie | Număr | Lacune |
|---|---|---|
| Corectitudine și conformitate (evaluare, limite, regulă de decizie) | 5 (4) | L1 (remediată), L4, L5, L23, L24 |
| Metrologie și validarea metodelor | 4 | L2, L3, L13, L14 |
| Trasabilitate, audit și versiuni | 5 | L6, L7, L8, L19, L20 |
| Raportare, recepție și confidențialitate | 5 | L10, L15, L16, L18, L22 |
| Validarea sistemului și documentare | 2 | L9, L21 |
| Operațional (backup, retenție) | 2 | L11, L12 |
| Separarea sarcinilor | 1 | L17 |
| **Total** | **24 (23 active)** | |

Pe efort: mic — 10 (L1, L11, L16, L17, L18, L19, L20, L21, L22, L23); mediu — 11 (L4, L5, L6, L7, L8, L9, L10, L12, L13, L15, L24); mare — 3 (L2, L3, L14). Total 24.

**Recomandare de ordine pentru pilot (etapa următoare):** L23 (corecție mică, efect direct asupra deciziilor), apoi L5 și L24 (guvernanța și acoperirea limitelor), L18 (decizie de confidențialitate), apoi L6–L8 (integritatea înregistrărilor) și L9 (plan de validare). L2, L3 și L4 depind de stabilirea, împreună cu laboratorul, a metodei analitice, a parametrilor ei de validare și a regulii de decizie; ele se pot proiecta (câmpuri, regulă de acceptare configurabilă) înainte de a avea valorile.

## 4. Întrebări deschise pentru laborator

1. Metoda analitică folosită în pilot și dosarul ei de validare (LOQ, recuperare, RSD, incertitudine)?
2. Regula de decizie convenită cu clienții (acceptare simplă sau cu bandă de gardă) și, dacă se aplică Reg. 2023/2782, regula „valoare corectată minus U > limită"?
3. Laboratorul efectuează controale oficiale (art. 37 din Reg. 2017/625) sau lucrează pentru clienți privați? De aceasta depinde caracterul obligatoriu al Reg. 2023/2782.
4. Cine semnează buletinul (validator, administrator) și există limitări de competență [de completat]?
5. Politica de retenție a înregistrărilor și frecvența copiilor de siguranță [de completat]?
6. Pagina publică de verificare trebuie să arate rezultatele sau doar validitatea buletinului?
7. Care este versiunea consolidată a Reg. (UE) 2023/915 pe care laboratorul o consideră de referință la data pilotului [de completat]?

## 5. Etapa finală: securizare

Conform instrucțiunii, aspectele de securizare sunt amânate pentru ultimul pas al proiectului și nu fac obiectul acestui audit. Sunt consemnate doar existența lor, fără valori și fără recomandări de modificare acum:

- în `test/acceptanta-figuri-final6.cjs`…`final9.cjs` și `test/captura-fig1.cjs` sunt scrise parole de test, în clar, pentru conturile de acceptanță; fișierul `acceptanta-final9/rezultate.json` conține adrese de test (domeniul `.local`), fără parole;
- în `server.js` există o valoare implicită pentru secretul de sesiune, folosită când variabila de mediu lipsește;
- politica de parole (lungime minimă la crearea conturilor de operator/validator și la înregistrare) și absența unei proceduri de recuperare a parolei;
- cookie-ul de sesiune este marcat `secure` numai în producție; limitarea încercărilor de autentificare este pe adresă IP;
- adresa de ascultare a serverului a fost deja schimbată în Etapa B (commit `667da3c`, `config.js`: implicit `127.0.0.1`, modificabilă prin `LIMS_HOST`). Aceasta este o modificare de securizare executată înaintea ultimului pas; se consemnează pentru decizia utilizatorului, fără a fi propusă o altă schimbare.

## Anexa A. Confruntarea profilurilor din `db/evaluation.js` cu Anexa I a Reg. (UE) 2023/915

Sursă: versiunea consolidată 2025-01-01 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:02023R0915-20250101)), citită prin instrument care rezumă automat; pentru OTA la cereale, ZEA și fumonizine, completată cu [Reg. 2024/1756](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1756). Valorile sunt în µg/kg. **OK** = valoarea și punctul citat în cod coincid cu sursa. Reconfirmare manuală necesară înainte de orice decizie reală.

| Profil (`id`) | Valori în cod (AFB1 / Σ aflatoxine / OTA / DON / ZEA / FUM / M1) | Puncte verificate | Stare |
|---|---|---|---|
| `cereals-final-consumer` | 2 / 4 / 3 / 750 / 75 / — | 1.1.12; 1.2.10; 1.4.4; 1.5.3 | OK pentru cereale; **discrepanță pentru „făină"**: DON 600 la 1.4.5 (L23) |
| `unprocessed-cereals` | 2 / 4 / 5 / 1000 / 100 / — | 1.1.12; 1.2.9; 1.4.1; 1.5.1 | OK; excepțiile 1.4.2 (grâu dur, porumb: 1500) și 1.4.3 (ovăz: 1750) nemodelate (L24) |
| `maize-final-consumer` | 2 / 4 / 3 / 750 / 100 / 1000 | 1.1.12; 1.2.10; 1.4.4 și 1.4.6.1; 1.5.5; 1.6.2 | OK |
| `maize-unprocessed` | 2 / 4 / 5 / 1500 / 350 / 4000 | 1.1.12; 1.2.9; 1.4.2; 1.5.2; 1.6.1 | OK |
| `maize-rice-sorting` | 5 / 10 / 5 / — / — / — | 1.1.13; OTA 1.2.9 | OK pentru aflatoxine; aplicabilitatea 1.2.9 la această categorie **[de verificat]**; DON/ZEA/FUM neevaluate |
| `rice-final-consumer` | 2 / 4 / 3 / — / — / — | 1.1.12; 1.2.10; orezul exclus din 1.4.x și 1.5.x | OK |
| `dried-fruit-final` | 2 / 4 / 2 / — | 1.1.2; OTA 1.2.1.2 (alte fructe uscate: 2,0) | OK, cu excepția „stafide" (1.2.1.1: 8,0) (L23) |
| `dried-fruit-sorting` | 5 / 10 / 2 / — | 1.1.1; OTA 1.2.1.2 | OK pentru aflatoxine; fructele de vită-de-vie 8,0 nemodelate (L23) |
| `dried-figs-final` | 6 / 10 / 8 / — | 1.1.3; 1.2.1.1 | OK |
| `peanuts-oilseeds-final` | 2 / 4 / — / — | 1.1.5 | OK pentru aflatoxine; OTA 5,0 (1.2.8) pentru semințe de floarea-soarelui, dovleac, pepene, cânepă, soia lipsește (L24) |
| `peanuts-oilseeds-sorting` | 8 / 15 / — / — | 1.1.4 | OK |
| `tree-nuts-final` | 2 / 4 / — / — | 1.1.7 | OK; cuvântul-cheie „alune" este ambiguu (L5) |
| `tree-nuts-sorting` | 5 / 10 / — / — | 1.1.6 | OK |
| `almonds-pistachios-apricot-sorting` | 12 / 15 / — / — | 1.1.8 | OK pentru aflatoxine; OTA fistic 10,0 (1.2.3) nemodelat (L24) |
| `almonds-pistachios-apricot-final` | 8 / 10 / — / — | 1.1.9 | OK pentru aflatoxine; OTA fistic 5,0 (1.2.4) nemodelat (L24) |
| `hazelnuts-brazil-sorting` | 8 / 15 / — / — | 1.1.10 | OK |
| `hazelnuts-brazil-final` | 5 / 10 / — / — | 1.1.11 | OK |
| `capsicum-dried` | 5 / 10 / 20 / — | 1.1.14; 1.2.18 | OK |
| `spices-dried` | 5 / 10 / 15 / — | 1.1.14; 1.2.17 (condimente uscate, exclusiv Capsicum) | OK |
| `roasted-coffee` | — / — / 3 / — | 1.2.14 | OK; cafeaua solubilă (5,0, 1.2.15) primește 3,0 (L24) |
| `wine` | — / — / 2 / — | 1.2.20 (și 1.2.22 pentru must/suc de struguri: 2,0) | OK |
| `raw-milk` | M1 0,050 | 1.1.16 | OK |
| `DEFAULT_LIMITS` (fallback) | 2 / 4 / 3 | 1.1.12; 1.2.10 | Corect ca valori pentru cereale; aplicat tăcut oricărui produs nerecunoscut (L5) |
