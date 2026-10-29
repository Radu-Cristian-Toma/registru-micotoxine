# Index al testelor automate

**Total: 190 teste în 23 fișiere; 190 trecute, 0 eșuate.**

Generat de `node scripts/list-tests.js --write` (rulează testele); nu se editează manual. Fiecare titlu este un test din `test/unit/*.test.js`. **Testele nu înlocuiesc protocolul de validare al laboratorului** (vezi `docs/VALIDARE_PILOT.md`); sunt probă de sprijin pentru calcul, decizie, integritate, acces și flux.

## archive-evaluation.test.js (18)

- ✓ arhiva operator: M1 este evaluat (peste/sub limită/lipsă)
- ✓ export CSV operator: M1 are coloane și status corect
- ✓ arhiva operator: DON este evaluat (peste/sub limită/lipsă)
- ✓ export CSV operator: DON are coloane și status corect
- ✓ arhiva operator: ZEA este evaluat (peste/sub limită/lipsă)
- ✓ export CSV operator: ZEA are coloane și status corect
- ✓ arhiva operator: FUM este evaluat (peste/sub limită/lipsă)
- ✓ export CSV operator: FUM are coloane și status corect
- ✓ arhiva beneficiar: M1 este evaluat (peste/sub limită/lipsă)
- ✓ export CSV beneficiar: M1 are coloane și status corect
- ✓ arhiva beneficiar: DON este evaluat (peste/sub limită/lipsă)
- ✓ export CSV beneficiar: DON are coloane și status corect
- ✓ arhiva beneficiar: ZEA este evaluat (peste/sub limită/lipsă)
- ✓ export CSV beneficiar: ZEA are coloane și status corect
- ✓ arhiva beneficiar: FUM este evaluat (peste/sub limită/lipsă)
- ✓ export CSV beneficiar: FUM are coloane și status corect
- ✓ arhiva operator: starea din arhivă coincide cu cea din coadă pentru toate probele
- ✓ probă cu QC respins rămâne „anulată” în arhivă (operator și beneficiar)

## audit-events.test.js (6)

- ✓ crearea contului de operator și de validator este jurnalizată (fără parolă)
- ✓ modificarea setărilor laboratorului: se jurnalizează numele câmpurilor, nu conținutul
- ✓ modificarea termenului de livrare este jurnalizată cu valoarea veche și cea nouă
- ✓ înregistrarea unui test de validare este jurnalizată
- ✓ incidentul fără probă este jurnalizat cu sample_id NULL
- ✓ VAL-06 are textul corectat

## audit-integrity.test.js (7)

- ✓ audit_log: sample_id acceptă NULL (evenimente fără probă)
- ✓ audit_log: UPDATE și DELETE sunt blocate
- ✓ result_versions: UPDATE și DELETE sunt blocate
- ✓ verify: bază curată → fără discrepanțe
- ✓ verify: suma de control greșită și golul de numerotare sunt detectate
- ✓ verify: lipsa unui declanșator este raportată
- ✓ migrarea: un audit_log vechi (sample_id NOT NULL) este reconstruit cu datele păstrate

## backup.test.js (8)

- ✓ copia are aceleași date ca sursa, inclusiv cele din WAL, și trece verificarea
- ✓ baza sursă nu este modificată de backup
- ✓ verifyDatabase respinge un fișier care nu este bază SQLite
- ✓ verifyDatabase semnalează încălcări de chei străine
- ✓ baza sursă inexistentă produce eroare, fără fișier de destinație
- ✓ copie criptată: fișierul nu conține datele în clar, se decriptează cu parola corectă și trece verificarea
- ✓ copie criptată: parolă greșită, fișier modificat și parolă prea scurtă sunt refuzate
- ✓ CLI: --encrypt și --decrypt cu parola din mediu (nu din argumente)

## bulletin-snapshot.test.js (13)

- ✓ la validare se stochează un instantaneu cu SHA-256 corect și conținut complet
- ✓ instantaneul nu poate fi modificat sau șters
- ✓ validarea și revizuirea scriu versiuni în istoric, cu motiv
- ✓ endpointul de instantaneu returnează conținutul și starea integrității
- ✓ verificarea publică este minimală implicit: fără rezultate, nume de produs sau limite
- ✓ cu LIMS_PUBLIC_VERIFY_RESULTS=1 verificarea publică revine la varianta completă
- ✓ verify-integrity: instantanee intacte → fără discrepanțe; buletin fără instantaneu → doar avertisment
- ✓ VAL-08 are textul corectat
- ✓ verificare publică: autentic fără amprentă prezentată și cu amprenta din QR; modificat cu amprentă greșită
- ✓ verificare publică: număr inexistent → lipsă (404 cu stare)
- ✓ verificare publică: instantaneu stocat alterat (declanșatoare ocolite) → modificat; fără instantaneu → neverificabil
- ✓ QR-ul buletinului conține amprenta (primele 16 caractere) a instantaneului emis
- ✓ export structurat al rezultatului: din instantaneul emis, cu integritate și stare de ciclu de viață

## capsicum-limits.test.js (16)

- ✓ limitele tuturor profilurilor existente sunt neschimbate
- ✓ lista de profiluri conține exact profilurile de referință plus Capsicum
- ✓ profilul Capsicum: OTA 20, restul limitelor copiate din spices-dried
- ✓ cuvintele-cheie Capsicum duc la profilul nou
- ✓ Capsicum are prioritate și când categoria generală „Mirodenii uscate” este aleasă explicit
- ✓ restul mirodeniilor rămân la spices-dried (OTA 15)
- ✓ boia cu OTA 18 µg/kg: conform
- ✓ boia cu OTA 22 µg/kg: neconform
- ✓ piper cu OTA 18 µg/kg: neconform
- ✓ alte potriviri nu sunt afectate (mapări reprezentative)
- ✓ amestecuri de mirodenii cu Capsicum: limita OTA 15 (spices-dried)
- ✓ „Amestec mirodenii cu boia” cu OTA 18: neconform
- ✓ „Mix chilli și piper” cu OTA 18: neconform
- ✓ „Boia dulce” cu OTA 18: conform; „Piper negru” cu 18: neconform
- ✓ cuvântul „amestec” fără Capsicum nu schimbă potrivirea altor produse
- ✓ citările source ale fructelor uscate și smochinelor conțin punctele de aflatoxine corectate

## decision-core.test.js (6)

- ✓ suma aflatoxinelor: valorile sub LOQ se iau ca zero (lower bound)
- ✓ suma lipsește dacă vreo aflatoxină nu este introdusă
- ✓ recuperarea corectează valoarea doar când este bifată
- ✓ corecția fără recuperare validă nu se aplică
- ✓ regula reg_2782_u folosește valoarea efectivă (corectată) minus U
- ✓ suma lower bound intră în verdictul de ansamblu

## decision-lot.test.js (11)

- ✓ none_exceeds: acceptare dacă nicio probă nu depășește limita
- ✓ none_exceeds: respingere dacă una singură depășește dincolo de îndoială (valoare − U > limită)
- ✓ none_exceeds: depășire în limita incertitudinii nu este nici acceptare, nici respingere
- ✓ none_exceeds: o respingere prevalează peste „în incertitudine”
- ✓ average: decizia se ia pe media probelor, nu pe fiecare probă
- ✓ regula „simple” în lot: orice depășire este neconformă (none_exceeds)
- ✓ valorile lipsă se ignoră; fără valori sau fără limită rezultatul este null
- ✓ mod de lot necunoscut este refuzat
- ✓ un lot cu o singură probă coincide cu judge() pe aceeași valoare
- ✓ suma aflatoxinelor: corecția pe fiecare toxină înainte de însumare = corecția sumei (recuperare comună grupului)
- ✓ suma aflatoxinelor: valorile sub LOQ se înlocuiesc cu zero înainte de corecție

## decision-rule.test.js (12)

- ✓ implicit (fără regulă): comportament neschimbat — OTA 3.2 > 3 → fail
- ✓ regula „simple” ignoră incertitudinea chiar dacă este introdusă
- ✓ reg_2782_u: valoare − U ≤ limită → acceptat, marcat „within_uncertainty”
- ✓ reg_2782_u: valoare − U > limită → respins
- ✓ reg_2782_u fără incertitudine introdusă pentru grup → cade pe comparația simplă (conservator)
- ✓ limita exactă rămâne conformă la ambele reguli
- ✓ suma aflatoxinelor folosește incertitudinea grupului „aflatoxins”
- ✓ „<LOQ”: valoarea sub LOQ este marcată; fără LOQ nu se marchează nimic
- ✓ regulă necunoscută → tratată ca „simple”
- ✓ rută: performanța metodei se validează și se salvează; valori invalide → 400
- ✓ rută: schimbarea regulii de decizie cere motiv; cu motiv schimbă verdictul și se jurnalizează
- ✓ rută: instantaneul buletinului păstrează regula și detaliul de decizie

## distribution.test.js (9)

- ✓ parola temporară: lungime, alfabet fără caractere ambigue, valori diferite
- ✓ primul administrator: creat cu parolă temporară și schimbare obligatorie; a doua rulare nu face nimic
- ✓ primul administrator: e-mail invalid sau ocupat de un cont non-admin este refuzat
- ✓ .env: creat din șablon cu SESSION_SECRET generat, fără a rescrie un secret existent; permisiuni restrânse
- ✓ fișier de secret: creat o dată, apoi păstrat
- ✓ LIMS_DEMO este refuzat în producție și acceptat în dezvoltare
- ✓ demo-seed refuză fără LIMS_DEMO=1 și în producție
- ✓ licențele dependențelor de execuție sunt permisive (compatibile AGPL-3.0-or-later)
- ✓ LICENSE conține AGPL-3.0 integral, iar package.json declară aceeași licență

## hash-chain.test.js (14)

- ✓ fiecare rând nou din audit_log și result_versions primește un element de lanț corect
- ✓ tabelele de lanț sunt append-only
- ✓ o conexiune externă fără funcția SHA-256 nu poate insera în audit_log
- ✓ modificarea unui rând de audit (declanșator eliminat) rupe lanțul
- ✓ ștergerea unui rând intermediar este detectată
- ✓ un rând inserat ocolind declanșatorul de lanț este detectat
- ✓ lanțul de versiuni: modificarea motivului unei versiuni este detectată
- ✓ atacatorul care recalculează tot lanțul trece de verificarea simplă, dar nu de rezumatul exportat
- ✓ rezumatul rămâne valid după adăugarea de evenimente noi
- ✓ rezumatul detectează modificarea unui instantaneu de buletin
- ✓ un fișier de rezumat alterat este refuzat
- ✓ exportul de rezumat este refuzat dacă lanțul are discrepanțe
- ✓ rânduri anterioare introducerii lanțului: avertisment, nu eroare
- ✓ CLI: export de rezumat, apoi verificare reușită și, după rescriere, eșuată

## i18n-en.test.js (7)

- ✓ fiecare cheie are text EN, fără diacritice românești
- ✓ terminologie unitară în engleză: „customer”, „test report”, „compliant”
- ✓ corecții de sens: „Așteaptă analizare” = Awaiting analysis; validează validatorul, nu operatorul
- ✓ sursele limitelor din profile sunt traduse integral în engleză
- ✓ matricea de validare VAL-01…15 are text EN pentru toate testele
- ✓ fiecare mesaj de eroare din rute are traducere în engleză, fără diacritice
- ✓ translateServerError: exact, șablon cu valori, necunoscut și limba română

## issued-branding.test.js (1)

- ✓ buletinul emis păstrează antetul și imaginile de la emitere după schimbarea setărilor

## lab-routes.test.js (12)

- ✓ L17: implicit strict — administratorul nu introduce, nu aprobă și nu validează; același validator nu aprobă și validează
- ✓ L17: relaxarea cere motiv și este jurnalizată; apoi același validator poate valida
- ✓ L14: registru de echipamente — creare, validare, cod unic, stare calibrare, jurnal
- ✓ L14: loturi — tip, grup, date; trimiterea cere calibrare valabilă și lot neexpirat
- ✓ L13: control QC — interval obligatoriu, verdict bilateral, istoric și stare
- ✓ L10: retragere și înlocuire — motiv obligatoriu, o singură schimbare, vizibile pe pagina publică, instantaneu neschimbat
- ✓ L16: starea la recepție se înregistrează; recepția fără descriere apare explicit ca neînregistrată
- ✓ L20: valoarea introdusă greșit se retrage doar cu motiv, trasabil în versiuni și jurnal
- ✓ L22: baza de raportare și substanța uscată — validare și stocare
- ✓ L15: date de prelevare declarate de beneficiar și date ale probei de laborator
- ✓ L12: export dosar — suma de control corespunde conținutului, jurnalizat, fără alte probe; retenție calculată
- ✓ L19: convenția marcajelor temporale este înregistrată; atestarea prelevării folosește ora locală, nu ISO UTC

## limits-profiles.test.js (11)

- ✓ făina: DON 600 (pct. 1.4.5), nu 750
- ✓ făina de porumb și de orez nu cade în profilul făinii de grâu
- ✓ cerealele întregi pentru consumatorul final rămân la DON 750
- ✓ fructele de vită-de-vie uscate: OTA 8 (pct. 1.2.1.1); alte fructe uscate: 2 (pct. 1.2.1.2)
- ✓ grâu dur și ovăz neprocesat: DON 1500 și 1750 (pct. 1.4.2, 1.4.3)
- ✓ semințele de floarea-soarelui, dovleac, soia: OTA 5 (pct. 1.2.8)
- ✓ fisticul are OTA propriu (pct. 1.2.3 și 1.2.4); migdalele rămân fără OTA
- ✓ cafeaua solubilă: OTA 5 (pct. 1.2.15); cafeaua prăjită: 3
- ✓ profilurile adăugate sunt accesibile prin eticheta exactă
- ✓ etichetele profilurilor sunt unice și niciuna nu o conține pe alta (potrivire exactă neambiguă)
- ✓ fiecare etichetă din server are traducere în i18n.js (categoryLabels)

## limits-provenance.test.js (7)

- ✓ profil recunoscut: se salvează profilul, sursa, referința și baza „profile”
- ✓ niciun profil recunoscut: baza „fallback” și eveniment în jurnalul de audit
- ✓ modificarea unei limite fără motiv este refuzată (400) și nu schimbă nimic
- ✓ modificarea cu motiv trece: baza devine „manual”, motivul și valorile vechi/noi se păstrează
- ✓ trimiterea acelorași limite (neschimbate) nu cere motiv și păstrează baza „profile”
- ✓ proba de reanaliză moștenește proveniența limitelor
- ✓ GET proba expune câmpurile de proveniență

## listen-host.test.js (4)

- ✓ implicit: 127.0.0.1
- ✓ LIMS_HOST gol sau cu spații: tot 127.0.0.1
- ✓ LIMS_HOST explicit este respectat
- ✓ serverul pornit fără configurare ascultă pe loopback și nu pe adresa de rețea

## lots.test.js (7)

- ✓ constituirea lotului: validări de intrare
- ✓ decizia de lot diferă după mod: none_exceeds → în incertitudine; average → conform
- ✓ respingere de lot: o probă depășește dincolo de îndoială
- ✓ motive de lipsă a verdictului: limite diferite și valori lipsă
- ✓ lotul se îngheață după validarea unei probe; beneficiarul vede decizia numai când lotul este final
- ✓ adăugarea și scoaterea de membri, desființarea lotului și jurnalul de audit
- ✓ dosarul probei conține lotul (cod, mod, coduri) fără valorile celorlalte probe și fără verdict până la validare

## owner-view.test.js (4)

- ✓ înainte de validare: lista beneficiarului nu arată valori, verdict sau observații
- ✓ înainte de validare: arhiva, exportul, detaliul, jurnalul și versiunile nu scurg valori
- ✓ personalul vede în continuare valorile și verdictul
- ✓ după validare beneficiarul vede valorile, verdictul, jurnalul și versiunile

## queue-bulletin-fields.test.js (1)

- ✓ coada include prelevat de, numărul și data buletinului și numele validatorului

## recovery-route.test.js (3)

- ✓ corecția cere recuperare validă
- ✓ bifarea corecției necesită motiv scris și schimbă verdictul
- ✓ necorectat: aceeași valoare rămâne conformă

## result-export.test.js (5)

- ✓ structura de bază: schemă, buletin, probă și măsurători
- ✓ valorile sub LOQ au comparatorul „<” cu valoarea LOQ
- ✓ incertitudinea extinsă: relativă și absolută la valoarea de decizie, k = 2, 95 %
- ✓ decizia folosește vocabularul fix; recuperarea corectată apare în export
- ✓ fără incertitudine introdusă, câmpul este null (nu se inventează o valoare)

## security.test.js (8)

- ✓ configurare de producție: refuză secretul lipsă, cel implicit și cel scurt; dezvoltarea rămâne neschimbată
- ✓ LIMS_TRUST_PROXY: număr, nume sau nesetat
- ✓ blocare pe cont: după 10 încercări eșuate din adrese diferite, chiar parola corectă este refuzată; se jurnalizează
- ✓ autentificare reușită: sesiune, jurnal și resetarea contoarelor
- ✓ schimbarea parolei: validări, efect, sesiuni și jurnal
- ✓ resetare de către administrator: parolă temporară, sesiuni închise, schimbare obligatorie
- ✓ producție: serverul refuză să pornească fără SESSION_SECRET valid
- ✓ producție: cu secret valid și proxy de încredere, cookie „Secure” și HSTS
