# Scenariu de demonstrație

Pentru pașii detaliați, cu capturi de ecran pentru fiecare rol, vezi
`docs/Ghid_utilizare_v1.53.2.pdf` (bilingv RO/EN).

## 1. Beneficiar

1. Autentificare (sau creare cont — liberă, fără aprobare de administrator).
2. Înregistrare probă.
3. Vizualizare status — progres propriu, pe 4 trepte orientate spre beneficiar
   (Cerere trimisă → Probă recepționată → În procesare la laborator →
   Rezultat disponibil), diferit de cele 5 trepte interne de laborator.
   Treapta „Probă recepționată" nu avansează decât după confirmarea fizică
   de către operator, nu la simpla înregistrare online a cererii.
4. Buletinul necompletat NU este vizibil înainte de validare — este înlocuit
   de un card de status (după practica portalurilor reale de analize
   medicale). Deschidere buletin abia după validare.
5. Verificare document prin QR.
6. Dacă proba e respinsă la recepție (control de calitate), beneficiarul
   vede automat motivul și poate descărca certificatul de respingere.

Întrebarea demonstrată: „Unde este proba mea și ce pot vedea despre rezultat?”

## 2. Operator

1. Deschiderea cozii.
2. Selectarea probei — confirmarea explicită a primirii fizice la poarta de
   intrare (sau respingerea, cu motiv obligatoriu) înainte de a putea
   introduce vreun rezultat.
3. Completarea rezultatelor (metodă, echipament, valori).
4. Verificarea QC. Dacă rămân câmpuri obligatorii necompletate, butonul de
   trimitere spre validare rămâne dezactivat și arată explicit lista exactă
   a câmpurilor lipsă — nu un mesaj generic.
5. Trimiterea rezultatelor spre aprobare.

Operatorul **nu** are acces la aprobare sau validare — rol distinct de validator, per separarea de roluri.

Întrebarea demonstrată: „Ce trebuie să fac acum și ce date intră în rezultat?”

## 3. Validator

1. Deschiderea cozii (rezultate trimise spre aprobare).
2. Revizuirea rezultatelor introduse de operator — toate câmpurile
   (inclusiv categoria de produs și sugestia de profil legislativ) sunt
   needitabile în modul de revizuire.
3. Aprobarea (revizuire independentă — un coleg diferit de cel care a introdus rezultatele) sau respingerea.
4. Validarea și emiterea buletinului.
5. Validatorul are acces complet la o probă anulată la controlul de
   calitate al operatorului, inclusiv la certificatul de respingere și
   motivația — necesar pentru trasabilitatea deciziilor de laborator.

Validatorul **nu** introduce rezultate analitice și nu confirmă QC — rol distinct de operator.

Întrebarea demonstrată: „Rezultatele sunt corecte și pot fi emise ca buletin oficial?”

## 4. Administrator

1. Dashboard.
2. Control acces — creare conturi operator și validator, separat.
3. Personalizare buletin (antet instituțional, semnătură, ștampilă).
4. Audit trail.
5. Lucrări neconforme.
6. Incidente de sistem.
7. Evidență validare software (teste funcționale).
8. Matrice cerință → funcție → dovadă → limită, orientată ISO/IEC 17025.

Întrebarea demonstrată: „Pot reconstrui cine a făcut ce și pot demonstra cum este controlată aplicația?”

## 5. Scenariu de corecție

1. Se pornește de la un rezultat validat.
2. Se modifică o valoare.
3. Sistemul solicită motivul corecției.
4. Validarea anterioară este retrasă.
5. Se creează o nouă versiune a rezultatului.
6. Se reia fluxul de aprobare și validare.
7. Buletinul anterior rămâne identificabil ca versiune înlocuită.

## 6. Comutator de limbă

Interfața e bilingvă (română/engleză) pentru toate cele patru roluri — util pentru a demonstra accesibilitatea pentru un evaluator sau colaborator care nu vorbește română.
