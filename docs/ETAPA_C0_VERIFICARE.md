# Etapa C0 — verificare finală a părții de program

**Bază:** `main` la `e0a4879` (îmbinarea PR #7). **Data:** 2026-10-22.
**Amploare:** trei puncte aprobate: (1) verificare în browser a fluxurilor rămase; (2) teste de backup cu `better-sqlite3` real; (3) reverificarea punctelor [de verificat] din reglementări. Codul aplicației nu a fost modificat; au fost adăugate numai scripturile de verificare din `scripts/browser-verify/` și acest raport.

## 1. Metodă și mediu

- Node 22.22.0, Chromium (Playwright) în mod headless, `better-sqlite3` 13.0.3 (SQLite 3.53.4), module native reale.
- Fiecare rulare pornește serverul pe o **bază temporară** (`LIMS_DB_PATH`), cu conturi inventate (`*@verify.invalid`) ale căror parole se generează aleatoriu la fiecare rulare și nu se scriu nicăieri. Nicio dată reală, nicio cheie. Parolele simple de test din `test/*.cjs` nu au fost atinse; securizarea rămâne ultimul pas (§6).
- Starea de pornire se construiește prin API (probe, rezultate, aprobări, validări, retrageri), iar ecranele și acțiunile verificate se parcurg în interfață. Rulare: `NODE_PATH=<calea playwright> node scripts/browser-verify/run.cjs <director-iesire>`; scriptul scrie capturi (PNG), un PDF al buletinului și `rezultate.json`. Capturile nu sunt în depozit (fișiere binare); se regenerează cu comanda de mai sus.
- Valorile analitice, metoda și echipamentele sunt fictive („verificare”).

## 2. Rezultate în browser (30 de verificări: 28 trecute, 1 eșuată, 1 observație)

| Zonă | Verificare | Rezultat |
|---|---|---|
| Înlocuirea buletinului | beneficiarul vede „ÎNLOCUIT” cu trimitere la buletinul înlocuitor (V1); pagina publică, la 390 px, la fel, fără derulare orizontală (V5A) | trecut |
| Retragerea buletinului | bannerul „RETRAS” cu motiv, la beneficiar (V2) și pe pagina publică (V5C) | trecut |
| Buletin valid | pagina publică confirmă autenticitatea și nu afișează rezultate analitice (V5H) | trecut |
| Respingere la recepție | motivul este vizibil beneficiarului (V3); respingere condusă din interfața operatorului (V8); certificatul de respingere afișează motivul (V9) | trecut |
| Respingere la validare | validatorul respinge din interfață cu notă, operatorul vede nota și proba redevine editabilă (V7a, V7b, V11) | trecut |
| Validare și emitere | un al doilea validator validează din interfață și se emite buletinul (V12) | trecut |
| Stări QC | „ultimul control a eșuat”, „în termen”, „fără control” (V10a–c); „control prea vechi” (V10d) | trecut |
| Buletin cu secțiuni noi (ecran) | regula de decizie 2023/2782, incertitudine, recuperare corectată, LOQ, suma „lower bound”, baza de raportare, masa probei, starea la recepție (V6a) | trecut |
| Tipărire buletin | PDF în mediu „print”: toate secțiunile sunt prezente, 2 pagini (V6b, V6c) | trecut, cu observațiile O3 |
| Administrator | creare operator și validator din interfață (V14a, V14b); relaxarea separării sarcinilor refuzată fără motiv și acceptată cu motiv, retenție salvată (V14c, V14d); căutare probă pentru resetare (V14e) | trecut |
| Ecran de 390 px | validator (coadă, detaliu, laborator) și administrator (cinci file): fără derulare orizontală a paginii, fără erori în consolă (V13, V13e, V15, V15e) | trecut |
| Eticheta de acțiune pentru proba returnată | V16 | **eșuat** (F1) |
| Verdict afișat beneficiarului înainte de validare | V4 | observație (O1) |

Limite ale verificării: Chromium, nu și alte browsere; `window.print()` a fost înlocuit cu o funcție vidă, iar tipărirea a fost verificată prin PDF în mediu „print”, nu pe o imprimantă; starea „control prea vechi” a necesitat inserarea directă, în baza temporară, a unui control antedatat, deoarece tabelul `qc_controls` este append-only (modificarea este refuzată de baza de date, ceea ce confirmă protecția). Resetarea administrativă a unei probe a fost verificată doar până la căutarea probei (V14e), nu și până la confirmarea resetării.

## 3. Constatări care necesită decizie

**F1 (eșuat). Proba respinsă de validator apare ca „Pregătit pentru validare”.** După respingerea la revizuire (`review_status = rejected`), coada validatorului continuă să arate eticheta „Pregătit pentru validare”, cardul „Dosarul este pregătit pentru validare” și butonul „Mergi la validare”. Cauză probabilă: `nextActionForSample()` din `public/app.js` ia în calcul doar `status`, `qcStatus` și `validationStatus`, nu și `reviewStatus`. Efect: validatorul poate crede că proba așteaptă validarea, deși a fost returnată operatorului. Conform codului, ruta de validare cere `review_status = approved`, deci o probă respinsă nu poate fi validată (neexersat în această verificare); riscul este de înțelegere, nu de integritate. Efort estimat: mic.

**O1 (observație). Verdict preliminar vizibil beneficiarului.** În lista beneficiarului, probele nevalidate (inclusiv una respinsă la revizuire) apar cu eticheta „Conform”, calculată din valorile introduse. Documentația spune că buletinul nu se afișează înainte de validare; eticheta din listă nu este buletin, dar poate fi citită ca un rezultat final. Decizia aparține laboratorului: se ascunde verdictul până la validare sau se etichetează explicit „preliminar”.

**O2 (observație minoră). Aspect la 390 px.** În antetul validatorului, numele utilizatorului pare parțial acoperit de butonul „EN”; sub butonul „Salvează” din politici, titlul următor nu are spațiu vertical. Fără efect funcțional; neconfirmat pe dispozitiv real.

**O3 (observație). Tipărirea buletinului cu secțiuni noi.** Textul există, dar în blocurile „Regulă de decizie” și „Performanța metodei” fragmentele bilingve se rup pe rânduri separate (de exemplu „: Reg. (UE) 2023/2782…”, „; valoare folosită pentru decizie”, „)”), ceea ce dă o lectură greoaie în PDF. Pagina 2 are un fundal gri vizibil sub card când „imprimarea fundalurilor” este activă. Conținutul este corect; este o problemă de formatare.

## 4. Backup cu `better-sqlite3` real

- `node --test "test/unit/*.test.js"`: **117 din 117 trecute**, inclusiv cele 5 teste din `backup.test.js`, pe module native reale (nu înlocuitor).
- Verificare suplimentară, pe o bază în WAL, cu serverul pornit și date inventate: `scripts/backup-db.js` a produs o copie (258 048 octeți) care a trecut `integrity_check` și `foreign_key_check` (`--verify`); numărul de rânduri din `users`, `samples`, `results`, `audit_log`, `result_versions`, `bulletin_snapshots` și `qc_controls` coincide între sursă și copie. Fișierul WAL al sursei avea ~1,9 MB în momentul copiei, deci copia include date aflate încă în WAL.
- Rămâne în sarcina laboratorului frecvența copiilor, locul de păstrare și un test periodic de restaurare (§5).

## 5. Reglementări: reverificarea punctelor [de verificat]

Accesul direct la EUR-Lex din acest mediu nu este posibil (rezolvarea DNS eșuează); am folosit căutare web, care a returnat rezumate ale paginilor EUR-Lex și surse secundare. Rezultatul este deci o confirmare parțială, nu o citire a textului oficial.

| Punct | Constatare | Stare |
|---|---|---|
| Regula de respingere a unui lot | rezultatul analitic, corectat pentru recuperare dacă este cazul, minus incertitudinea extinsă, peste limită („dincolo de orice îndoială rezonabilă”); reluată în Reg. 2024/885. Concordă cu regula `reg_2782_u` din aplicație | confirmat din rezumat al textului consolidat 2023/2782 (sursă indirectă) |
| Intervalul de recuperare | media 70–120 %, excepțional 50–130 % cu criterii de precizie; concordă cu `docs/VERIFICARE_REGLEMENTARA.md` | confirmat parțial (sursă secundară, USDA AMS, care citează anexa II pct. 4.2.1.1) |
| Suma aflatoxinelor sub LOQ | sumele sunt „lower bound”: rezultatele sub LOQ se înlocuiesc cu zero; LOQ-ul fiecărei toxine ≤ 0,5·ML/n; corecția pentru recuperare se aplică fiecărei toxine înainte de însumare. Concordă cu „suma inferioară” din aplicație | confirmat din surse indirecte |
| Rezultat raportat corectat sau necorectat pentru recuperare (anexa II) | **nu a putut fi citit** | **[de verificat]** pe textul oficial |
| Aplicarea incertitudinii la suma aflatoxinelor | nicio sursă găsită; aplicația aplică U relativ al grupului la suma corectată | **[de verificat]** pe textul oficial sau în ghidul EURL |
| Limite și puncte din anexa I a Reg. 2023/915 | neconfruntate de mine; au fost verificate de Hermes (2026-10-17/21) | **[de reconfirmat de laborator]** |

Nu am modificat nicio valoare sau citare. Închiderea acestor două puncte rămase cere acces la textul oficial (de către Hermes sau laborator).

## 6. Ce rămâne în afara programului

- **Laborator:** protocolul VAL-01…08; frecvența și testul de restaurare al copiei de siguranță; perioada de retenție, intervalele QC și incertitudinile (valorile le stabilește laboratorul din validarea metodei).
- **Etapa finală: securizare** (neabordată aici, conform instrucțiunii): parole și politica lor, recuperarea parolei, gestionarea secretelor, HTTPS și cookie-uri `secure`, limitarea ratei, criptarea copiilor, revizuirea dependențelor.
- **Decizii deschise:** F1 (corecția etichetei), O1 (verdict preliminar), O3 (formatare la tipărire).
