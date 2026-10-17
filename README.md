# Registru Micotoxine — v1.53.5

LIMS pentru gestionarea probelor, rezultatelor și raportării controlate a analizelor de micotoxine, în dezvoltare activă către un pilot de laborator.

## Scop

Produsul demonstrează un flux LIMS orientat pe trasabilitatea probei și a rezultatului analitic:

Probă → Analiză → Rezultat → Verificare independentă → Validare → Buletin → Verificare publică

Interfața este separată pentru patru roluri:

- **Beneficiar** — înregistrează probe, urmărește stadiul, accesează buletinul validat.
- **Operator** — introduce rezultatele analitice, confirmă controlul de calitate al aparatului. Nu are acces la aprobare sau validare.
- **Validator** — rol distinct de operator: aprobă rezultatele (revizuire independentă, de un coleg diferit de cel care le-a introdus) și validează/emite buletinul, cu semnătură/ștampilă.
- **Administrator** — gestionează conturile de operator/validator, personalizarea buletinului, și panoul de calitate (evidență de testare, incidente de sistem, matricea de pregătire ISO/IEC 17025).

Interfața este bilingvă (română/engleză), cu comutator de limbă disponibil pentru toate cele patru roluri.

## Funcționalități demonstrate

- autentificare și control server-side al accesului pe rol
- înregistrare și urmărire probe, cu selecție de analize à la carte
- coadă și arhivă operator, cu paginare
- introducere rezultate analitice
- calcul automat pentru suma aflatoxinelor
- evaluare față de limite, corelate cu Reg. (UE) 2023/915 (inclusiv actualizările prin regulamentele de modificare ulterioare)
- QC și aprobare pe două niveluri (operator introduce, un coleg diferit aprobă independent, apoi validează)
- numerotare de buletin cu unicitate garantată la nivel de bază de date
- reguli de decizie și declarație de conformitate, atunci când sunt utilizate
- versionarea rezultatelor și a buletinelor
- trasabilitate și audit trail
- lucrări neconforme
- incidente de sistem
- matrice de validare funcțională
- verificare QR publică a buletinului
- limitare a încercărilor de autentificare (5 încercări greșite / 15 minute, per IP)
- sesiuni de autentificare persistente (supraviețuiesc repornirii serverului)
- notificare in-app pentru probe noi/actualizate, pentru beneficiar și pentru echipa operator/validator
- probe de control/etalon, separate de secvența de numerotare a clienților
- asumarea explicită, de către beneficiar, a corectitudinii prelevării (conform Reg. (UE) 2023/2782), plus nota standard ISO/IEC 17025 pe buletin

## Limitele actuale

Acesta este un produs în dezvoltare activă și nu este prezentat ca sistem acreditat sau validat pentru utilizare de rutină într-un laborator.

Nu sunt simulate și nu sunt revendicate ca implementate:

- integrarea cu analizoare sau alte echipamente de laborator
- semnătura electronică calificată (eIDAS) — semnătura din buletin e simplă (imagine + nume + rol), utilă pentru identificare vizuală, nu echivalentă legal cu o semnătură calificată
- backup și disaster recovery de producție
- infrastructură enterprise de monitorizare și securitate
- sistem QMS complet
- CAPA complet
- HACCP

HACCP nu este introdus în fluxul LIMS și nu este inclus în buletin. Poate exista separat în cadrul sistemului de management al unei organizații, dacă domeniul de activitate o cere.

Metodele de eșantionare și analiză pentru micotoxine sunt reglementate separat prin Reg. de punere în aplicare (UE) 2023/2782 (înlocuiește Reg. 401/2006) — relevant pentru procedura de laborator, nu implementat ca funcționalitate software.

## Utilizarea intenționată

Produsul este destinat unui pilot de laborator, cu scopul de a valida arhitectura funcțională și fluxul de lucru în condiții reale, restrânse.

Înaintea unei utilizări reale extinse trebuie realizate, între altele: analiza cerințelor laboratorului, calificarea infrastructurii, validarea software pentru utilizarea intenționată (conform Reg. de punere în aplicare (UE) 2023/2782 și practicii de laborator), procedurile operaționale, managementul utilizatorilor, backup/restore și testarea de acceptanță.

## Repere de calitate

ISO/IEC 17025:2017 este reperul principal pentru cerințele laboratorului de încercări. Produsul folosește aceste cerințe ca grilă de proiectare pentru funcțiile software relevante, fără a confunda funcționalitatea software cu conformitatea laboratorului.

Pentru declarațiile de conformitate și regulile de decizie, produsul folosește conceptele relevante din ILAC G8.

Pentru integritatea datelor, proiectarea urmărește principiile ALCOA+ ca grilă practică de verificare.

Limitele legale pentru micotoxine sunt corelate cu Reg. (UE) 2023/915 (inclusiv actualizările ulterioare prin regulamentele de modificare — vezi sursele citate direct în `db/evaluation.js`). Aceste limite se modifică periodic; înainte de folosirea platformei pentru decizii reale de conformitate, ele trebuie re-verificate pe versiunea consolidată curentă de pe EUR-Lex, nu doar preluate din acest fișier ca sursă finală.

## Pornire locală

1. `npm install`
2. copiați `.env.example` în `.env`
3. setați `SESSION_SECRET` cu o valoare aleatoare suficient de lungă
4. `npm start` — implicit, serverul ascultă numai pe `127.0.0.1` (local)
5. pentru contul inițial de administrator: `npm run seed-admin -- admin@example.com parola NumeAdmin`

### Adresa de ascultare

Implicit, serverul ascultă numai pe `127.0.0.1`, deci aplicația este accesibilă doar de pe calculatorul pe care rulează. Variabila de mediu `LIMS_HOST` (în `.env`) schimbă adresa; de exemplu `LIMS_HOST=0.0.0.0` deschide aplicația în rețeaua locală.

**Avertisment:** aplicația folosește în această etapă parole simple de test. Nu o expuneți într-o rețea sau pe internet cu date reale. Codul QR al buletinului codifică adresa de rețea locală a serverului; cu ascultarea implicită (numai local) el nu poate fi deschis de pe alt dispozitiv.

## Copie de siguranță și restaurare

Copie de siguranță (metoda de backup a SQLite, consistentă și în modul WAL; copia este verificată automat prin `integrity_check` și `foreign_key_check`, iar o copie nevalidă este ștearsă):

`npm run backup` (director implicit `backup/`, exclus din git) sau `node scripts/backup-db.js <director>`

Baza sursă se poate indica prin `LIMS_DB_PATH` (implicit `db/lims.db`).

Restaurare:

1. opriți serverul;
2. verificați copia: `node scripts/backup-db.js --verify <copie.db>`;
3. păstrați baza curentă separat (`db/lims.db`, `db/lims.db-wal`, `db/lims.db-shm`);
4. ștergeți din `db/` fișierele `lims.db-wal` și `lims.db-shm`, apoi copiați copia verificată ca `db/lims.db`;
5. porniți serverul și verificați probele recente.

Frecvența copiilor, locul de păstrare, retenția și testele periodice de restaurare rămân de stabilit de laborator [de completat].

## Teste automate

`npm test` rulează testele din `test/unit/` (`node:test`, fără dependențe noi; baze de date temporare, date inventate). Scripturile `test/*.cjs` sunt scripturi de acceptanță separate.

## Documentație

`docs/Ghid_utilizare_v1.53.3.pdf` — ghid de utilizare bilingv (română/engleză), cu pași și capturi de ecran reale pentru fiecare dintre cele patru roluri (beneficiar, operator, validator, administrator), reflectând comportamentul curent al aplicației.

`docs/DEMO_SCRIPT.md` — scenariu scurt de demonstrație, pe roluri.

## Verificare release

Rulați:

`npm run release-check`

Verificarea confirmă structura fișierelor, sincronizarea versiunilor (`package.json`/`package-lock.json`/README) și sintaxa JavaScript.

## Statut

v1.53.5 a corectat termenul de livrare (TAT) afișat pentru o probă deja încheiată: pentru o probă anulată la controlul de calitate, coada operatorului continua să arate „⚠ Termen: ..." cu stilul de avertizare de termen depășit, ca și cum analiza ar mai fi în curs — deși situația era deja definitiv închisă. Funcția care calculează starea termenului verifica doar dacă proba fusese validată (buletin emis), nu și dacă fusese anulată. Corectată să trateze ambele situații de final identic — nu mai afișează termenul de livrare pentru nicio probă încheiată (validată sau anulată), doar pentru cele încă în lucru, unde continuă să avertizeze corect la termen apropiat sau depășit.

v1.53.4 a eliminat butonul „Demonstrație" din antetul comun tuturor celor patru roluri — modul de demonstrație ghidată (date sintetice, izolate de baza de date) își pierduse rostul odată cu apariția ghidului de utilizare bilingv, cu capturi de ecran reale (`docs/Ghid_utilizare_v1.53.3.pdf`); funcția și codul ei mort au fost eliminate complet, nu doar ascunse. A corectat și un defect real de aspect, semnalat direct: la validator (și, mai general, la operator), pe măsură ce coada de probe se umplea, zona centrală de detaliu se alungea vizual fără motiv, cu spațiu gol sub conținutul efectiv. Cauza: containerul cu două coloane (coadă + detaliu) folosea `min-height` în loc de `height`, iar rândul implicit de grid se dimensiona după conținutul cel mai înalt (lista de probe, nelimitată), nu după înălțimea containerului — corectat prin fixarea înălțimii containerului și a rândului de grid, astfel încât atât coada, cât și panoul de detaliu, defilează intern, în limitele ferestrei, exact cum fusese proiectat inițial (`overflow-y: auto` pe ambele).

v1.53.3 a corectat bara detaliată de progres a beneficiarului pentru o probă anulată la controlul de calitate: rămânea vizual blocată la treapta „În procesare la laborator", ca și cum analiza ar mai continua, în loc să ajungă la treapta finală „Rezultat disponibil" — situația fiind de fapt încheiată (chiar dacă rezultatul e o anulare, nu un buletin). Toate cele 4 trepte apar acum finalizate, cu treptele 3 și 4 marcate explicit „Anulat".

v1.53.2 a corectat un text afișat beneficiarului care presupunea, greșit, că el ar trebui să introducă rezultate ("Introdu rezultate" / "Completează datele analizei și valorile rezultate") — text de fapt destinat operatorului, reutilizat din greșeală și pe cardul de status al beneficiarului. Cardul arată acum, în timpul etapelor de analiză și control de calitate, un text pasiv, corect pentru rolul de beneficiar ("Analiză în laborator" / "Laboratorul introduce rezultatele analizei. Nu trebuie să faci nimic în acest moment."), fără să lase impresia că beneficiarul are vreo acțiune de făcut.

v1.53.1 a corectat o eroare de pornire pe o bază de date deja existentă la care o migrare anterioară a fost întreruptă (proces terminat forțat/oprire neașteptată în timpul migrării de schemă a rolului „validator" sau a limitelor implicite de la tabelul `results`): pornirea repeta la nesfârșit aceeași migrare eșuată (`SqliteError: table users_new already exists`), fără nicio recuperare posibilă. Migrarea este acum idempotentă — un tabel temporar rămas dintr-o încercare anterioară întreruptă este eliminat automat înainte de reîncercare, fără pierdere de date.

v1.53.0 este în dezvoltare activă, pe traiectorie spre un pilot de laborator. Spre deosebire de declarația de înghețare a versiunii anterioare (v1.50.0), dezvoltarea continuă pe baza testării reale și a feedback-ului de utilizare — inclusiv separarea rolului de validator, suportul bilingv, sesiuni persistente și corectarea numerotării buletinului (unicitate garantată la nivel de bază de date). Orice evoluție ulterioară trebuie să rămână ancorată în cerințe reale ale pilotului, nu doar extindere funcțională de dragul extinderii.

v1.52.0 a corectat sincronizarea chip-urilor de progres pentru operator și validator (pasul "Primire probă" rămâne pasul curent afișat până când operatorul confirmă efectiv primirea fizică a probei, nu instantaneu de la înregistrarea online a cererii) și a introdus o schemă de progres independentă, dedicată beneficiarului (4 trepte orientate spre ce îl interesează pe client — cerere trimisă / probă recepționată / în procesare / rezultat disponibil — nu spre pașii interni ai laboratorului). Buletinul necompletat nu mai este afișat beneficiarului înainte de validare — este înlocuit de un card de status, după practica portalurilor reale de analize (ex. rezultate de laborator medical, care nu arată un formular gol înainte de existența unui rezultat final).

v1.53.0 a corectat accesul validatorului la certificatul de respingere al unei probe anulate la poarta de intrare (omis anterior din lista de roluri permise a rutei), a blocat explicit controlul „Propune după produs" în modul de revizuire al validatorului (rămăsese singurul câmp încă editabil dintr-un formular altfel needitabil), a înlocuit mesajul generic de pe butonul de trimitere spre validare cu lista exactă a câmpurilor obligatorii încă necompletate, a corectat alinierea bifă/text la lista de analize solicitate și la atestarea de prelevare (o regulă CSS cu specificitate mai mare forța afișarea pe rânduri separate), a înlocuit halo-ul de focus implicit al bifelor cu un inel mai discret, potrivit formei lor, și a compactat semnificativ formatul de printare al buletinului, pentru a evita revărsarea inutilă pe o a doua pagină la probe cu puține analize.
