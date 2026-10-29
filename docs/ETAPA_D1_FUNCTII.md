# Etapa D1: funcții rămase

**Ce se adaugă.** (1) Lot cu mai multe probe de laborator, cu decizie de lot după Reg. (UE) 2023/2782, anexa I, partea II (verificat pe textul consolidat din 24.03.2024); (2) verificare publică a buletinului în stări; (3) export structurat (JSON) al rezultatului; (4) corectarea tipăririi bilingve a rezumatului deciziei (O3). Nu se modifică valorile limitelor, regula de decizie pe probă, conturile de test, secretul de sesiune sau politica de parole.

## 1. Lot cu mai multe probe de laborator
- **Model:** tabela `sample_lots` (cod, denumire, mod, observații) și coloana `samples.lot_id`. O probă rămâne o singură probă de laborator; lotul grupează probele **aceluiași beneficiar**, între 2 și 10, excluzând probele de control și pe cele anulate.
- **Moduri** (`judgeLot()` din `public/decision-core.js`): `none_exceeds` (smochine, C.8; arahide, sâmburi de caise, fructe cu coajă și mirodenii cu particule mari pentru consum final sau ca ingredient, D.8) și `average` (aceleași produse supuse sortării, D.8). Alegerea modului este a laboratorului, după produs; aplicația nu o deduce.
- **Calcul:** `db/lots.js`, pe valorile efective ale probelor (corectate pentru recuperare doar dacă laboratorul a cerut-o). Dacă probele au limite, reguli sau incertitudini diferite, ori lipsește o valoare, **nu se emite verdict** pentru analitul respectiv, iar motivul se afișează.
- **Constituire și înghețare:** `POST /api/lots` (operator, administrator); lotul se poate modifica sau desființa numai cât timp nicio probă nu este validată; după aceea este înghețat. Fiecare acțiune se jurnalizează (`lot_created`, `lot_member_added`, `lot_member_removed`, `lot_dissolved`).
- **Vizibilitate:** personalul vede decizia provizorie; **beneficiarul vede decizia de lot numai după validarea tuturor probelor** (nu un verdict preliminar). Dosarul probei conține codul lotului, modul, codurile probelor și verdictul doar când lotul este final, **fără valorile celorlalte probe**.
- **Interfață:** secțiunea „Loturi cu mai multe probe de laborator” din fila „Laborator” (constituire, detaliu cu valori efective, limită, U, verdict, motive; desființare) și un rând în zona „Laborator” a buletinului probei.
- **Limite:** decizia de lot **nu este încă inclusă în instantaneul buletinului** și nu apare pe buletinul tipărit al probei; se vede în fila „Laborator” și în dosar. Alegerea modului după produs nu este automatizată. Regula pentru probe agregate de cel mult 12 kg (o singură probă) se aplică prin simplul fapt că proba nu este grupată într-un lot.

## 2. Verificare publică în stări
`GET /api/results/public/verify/:bulletinNo[?h=<amprentă>]` întoarce `verification.state`: **authentic**, **modified** (instantaneul stocat nu mai corespunde amprentei lui, ori amprenta din QR diferă de cea emisă), **missing** (număr neemis, cu răspuns 404) sau **unverifiable** (buletin emis înainte de instantanee). Codul QR al buletinului include acum primele 16 caractere hex ale amprentei instantaneului. „Autentic” nu înseamnă „valabil”: retragerea și înlocuirea se raportează separat, ca până acum.

## 3. Export structurat al rezultatului
`GET /api/results/:sampleId/export` (beneficiarul probei și personalul), din instantaneul emis: valoare cu comparator (`<` sub LOQ), unitate, incertitudine extinsă (relativă și absolută, k = 2, probabilitate 0,95, sau `null` dacă laboratorul nu a introdus-o), recuperare, regulă de decizie, limită și decizie cu vocabular fix (`conform`, `neconform`, `in_incertitudine`, `fara_limita`), plus amprenta instantaneului și starea buletinului. Fără identificatori chimici, până la validarea lor de laborator. Buton „Exportă rezultatul (JSON)” la buletin.

## 4. Tipărire (O3)
Fragmentele bilingve din rezumatul deciziei și al performanței metodei se afișează acum în rând („română (engleză)”), nu pe rânduri separate; verificat în PDF, mediu „print”.

## 5. Verificare
`npm test`: 159 de teste, toate trecute (7 noi pentru loturi, 4 pentru verificarea în stări, 1 pentru export prin rută, 5 pentru funcția de export). Verificare în browser (date inventate): 42 de verificări, 41 trecute, 0 eșuate, 1 observație deschisă (O1, tratată în etapa D2). Verificările noi: V17 (lot din interfață), V18 (stări de verificare publică), V19 (export JSON), V20 (tipărire).
