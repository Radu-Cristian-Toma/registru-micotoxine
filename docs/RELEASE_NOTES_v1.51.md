# v1.51.0 — Continuarea dezvoltării, pe traiectorie de pilot

## Obiectiv

Spre deosebire de declarația de înghețare din v1.50.0, dezvoltarea a continuat pe baza testării reale și a feedback-ului de utilizare, cu scopul de a pregăti produsul pentru un pilot de laborator.

## Ce s-a schimbat față de v1.50.0

### Separarea rolului de Validator

Rolul unic „Operator" din v1.50.0 (care introducea rezultate ȘI valida/emitea buletinul) a fost separat în două roluri distincte:

- **Operator** — introduce rezultatele analitice, confirmă controlul de calitate al aparatului. Nu are acces la aprobare sau validare.
- **Validator** — aprobă rezultatele (revizuire independentă, obligatoriu un coleg diferit de cel care le-a introdus) și validează/emite buletinul.

Separarea e impusă server-side, nu doar în interfață — inclusiv interdicția explicită ca un validator să-și aprobe propriile rezultate introduse ca backup.

### Interfață bilingvă completă

Toate cele patru roluri (Beneficiar, Operator, Validator, Administrator) au acum interfața complet tradusă română/engleză, cu comutator de limbă persistent pe sesiune.

### Performanță și infrastructură

- indecși de bază de date pe coloanele cel mai des interogate
- paginare pe arhivele proprietarului și operatorului/validatorului
- sesiuni de autentificare persistente pe SQLite (supraviețuiesc repornirii serverului, spre deosebire de store-ul implicit în memorie)
- curățare CSS: eliminarea duplicării de reguli (peste 100KB → sub 95KB, zero selectoare duplicate la nivel superior)

### Corectare de integritate — numerotarea buletinului

Descoperit și reparat un bug real: numărul de buletin se determina pe baza ordinii de **creare** a probei, nu a ordinii de **emitere** a buletinului — putea produce **numere de buletin duplicate** când probele nu se validau în ordinea înregistrării (scenariu realist, demonstrat concret cu o simulare). Reparat în două straturi: logica de calcul, plus un index `UNIQUE` la nivel de bază de date, ca plasă de siguranță suplimentară.

### Securitate

- limitare a încercărilor de autentificare (5 încercări greșite / 15 minute, per IP)
- reset de sesiune (session regenerate) la login și la register — protecție împotriva fixării sesiunii
- validare server-side strictă a tipului de fișier la încărcarea imaginilor de branding (PNG/JPEG explicit, nu orice `image/*`)

### Reparări de interfață, găsite prin testare reală

- sincronizarea corectă a tab-ului activ din meniul de navigare (rămânea blocat vizual pe primul tab, indiferent unde naviga utilizatorul)
- caseta de sus a proprietarului reflectă acum stadiul real al probei deschise, nu rămâne fixată pe „Înregistrare"
- lățimi consistente între zona de sus și conținutul de dedesubt, pentru proprietar și operator/validator
- limba paginii de logare resetată la română după fiecare delogare
- demonstrațiile ghidate (operator/validator) reajustate să reflecte separarea reală de roluri

### Corectare limite regulatorii

Toate limitele de micotoxine din `db/evaluation.js` verificate direct pe textul consolidat oficial (EUR-Lex, Reg. (UE) 2023/915). Corectată o eroare reală (DON pentru porumb neprocesat: 1500 µg/kg, nu 1750 — valoare confundată cu cea pentru ovăz), adăugate două categorii lipsă, și actualizate citările să reflecte exact regulamentele de modificare aplicabile (2024/1022, 2024/1756).

### Uniformizare, aliniere și asumarea prelevării corecte

- eticheta de rol a beneficiarului uniformizată la „Beneficiar" (anterior „Proprietar" în antet, inconsecvent cu restul interfeței)
- corectată o nepotrivire vizuală reală: caseta „Status probă" avea o lățime diferită față de bara de flux (Înregistrare/Analiză/QC/Validare) de sub ea — cauza era dublă (o regulă de bază și o regulă mai specifică, activă doar într-un anumit context), ambele reparate
- adăugată o bifă obligatorie la înregistrarea probei, prin care beneficiarul își asumă explicit că prelevarea a fost reprezentativă pentru lot, conform bunelor practici de eșantionare (Reg. de punere în aplicare (UE) 2023/2782) — micotoxinele sunt distribuite eterogen în lot, iar o prelevare nereprezentativă poate produce un rezultat înșelător, atât în detrimentul beneficiarului, cât și al unor eventuali cumpărători. Impusă și server-side (nu doar în interfață) — descoperit la auditul final că o cerere directă către API, ocolind formularul, ar fi putut sări peste atestare; reparat și verificat. Momentul și utilizatorul care a făcut atestarea rămân înregistrate în `audit_log`, cu dată și oră — nu doar o poartă la trimitere, ci o urmă verificabilă ulterior.
- adăugată pe buletin (atât la beneficiar, cât și pe pagina publică de verificare) nota standard prevăzută de ISO/IEC 17025:2017, pct. 7.8.3, pentru cazul în care laboratorul nu a fost responsabil de etapa de prelevare

### Terminologie: PoC → pilot

Interfața folosea încă, în peste 40 de locuri, termenul „PoC" (proof of concept) — rămas din etapa inițială de dezvoltare, inconsecvent cu statutul actual de pilot. Corectat sistematic: unde termenul se referea generic la software, înlocuit cu „aplicația"; unde marca deliberat etapa produsului (notificarea principală din panoul de calitate), actualizat la „Pilot, nu acreditare." Verificat cu browser real, pe panoul de calitate și pe demonstrația ghidată — zero apariții rămase, vizibil pentru utilizator.

### Protecție CSRF

Implementată protecție împotriva atacurilor de tip CSRF (cross-site request forgery) — singurul gol de securitate rămas documentat explicit după runda anterioară de audit. Soluție proprie, fără dependință nouă (tipar „synchronizer token", legat de sesiune), consecventă cu restul infrastructurii de securitate a proiectului (store de sesiuni propriu, limitare de autentificare proprie). Acoperă toate rutele care modifică starea, inclusiv autentificarea însăși — un „login CSRF" (păcălirea unui utilizator să se autentifice, fără voie, în contul altcuiva) e un atac real, documentat, nu doar teoretic. Token-ul se reînnoiește automat la login, register și logout, exact în momentele în care sesiunea însăși se schimbă. Verificat cu șase teste directe prin API (lipsă token, token greșit, token corect, invalidare după regenerare) plus un flux complet prin browser real, incluzând delogare urmată de o nouă autentificare.

### Audit general

O trecere sistematică, pe faze, peste toată aplicația: verificare structurală completă (sintaxă, echilibru CSS), verificare exhaustivă a schemei bazei de date (toate cele 21 de coloane adăugate vreodată prin migrare confirmate prezente în starea finală, nu doar cele descoperite anterior), verificare a controlului de acces pe toate cele 29 de rute ale aplicației, un flux funcțional integrat de 16 verificări care acoperă toate cele patru roluri și funcționalitățile adăugate recent (atestare, echipament, respingere QC, QR, CSRF) — toate trecute. Găsit și reparat un export JavaScript duplicat, inofensiv funcțional dar confuz pentru citire (`middleware/auth.js`), și curățate ultimele comentarii interne de cod care mai menționau „PoC".

## Testare executată pentru acest release

Aceleași verificări structurale ca la v1.50.0 (fișiere, sincronizare versiuni, sintaxă JavaScript), plus:

- verificare funcțională a logicii critice prin simulare directă pe SQLite (numerotare buletin, notificări „Nou", limitare autentificare)
- verificare încrucișată a fiecărei chei de traducere folosite în interfață față de dicționarul de traduceri

Testarea prin interacțiune reală într-un browser rămâne netăcută explicit — `better-sqlite3` nu a putut fi compilat în mediul de dezvoltare folosit pentru aceste modificări. Recomandat înainte de pilot: un test de acceptanță real, pe toate cele patru roluri.
