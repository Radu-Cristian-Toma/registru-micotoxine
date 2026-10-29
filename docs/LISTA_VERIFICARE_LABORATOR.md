# Listă de verificare a laboratorului înainte de utilizarea cu date reale

Aplicația nu conține valori ale laboratorului (incertitudini, recuperări, intervale QC, perioade de retenție). Le stabilește laboratorul și le introduce prin interfață. Bifați și completați; **nimic de aici nu a fost completat de dezvoltator**.

## A. Limite legale și profiluri
- [ ] Profilurile de limite (31) corespund produselor analizate de laborator; fiecare profil este confruntat cu textul consolidat al Reg. (UE) 2023/915 în vigoare [dată, persoană].
- [ ] Pentru produsele cu mai multe variante (de exemplu înainte/după sortare, consum final), laboratorul a ales profilul potrivit; aplicația nu îl alege în locul lui.
- [ ] Orice limită modificată manual are motiv scris și sursă.
- [ ] Textul regulii de decizie din Reg. (UE) 2023/2782 (anexa I, partea II; anexa II, pct. 4.3.1) este citit de laborator; regula pe probă (`reg_2782_u`) și regulile de lot (`none_exceeds`, `average`) corespund procedurii laboratorului.

## B. Performanța metodei, pe grup de analiți (aflatoxine, OTA, M1, DON, ZEA, fumonizine)
- [ ] LOQ validat: [valoare, document de validare].
- [ ] Recuperare medie și intervalul acceptat (70–120 %; 50–130 % excepțional, cu precizia respectată) [valori].
- [ ] Decizia de a corecta sau nu pentru recuperare (nu e necesară între 90 și 110 %) [politica laboratorului].
- [ ] Incertitudinea extinsă relativă (k = 2) din validarea proprie. O valoare implicită de 50 % se poate raporta numai dacă RSDr și RSDwR ≤ 20 % și |z| ≤ 2 la testele de competență (Anexa II, 4.3.1); aplicația **nu are** o valoare implicită și nu o introduce.
- [ ] Pentru sume de aflatoxine: recuperarea este comună grupului; dacă laboratorul folosește recuperări diferite pe toxină, aplicația nu le acoperă (sumă corectată cu recuperarea grupului).

## C. Control al calității și echipamente
- [ ] Registrul de echipamente completat; date de calibrare și scadențe.
- [ ] Registrul de loturi de reactivi și materiale de referință completat.
- [ ] Intervalele de acceptare QC stabilite din validare (aplicația nu propune valori).
- [ ] Intervalul maxim de la ultimul control QC (implicit 7 zile) confirmat sau modificat.

## D. Politici și conturi
- [ ] Separarea sarcinilor activă (recomandat); dacă se relaxează, motivul este scris.
- [ ] Perioada de retenție a dosarelor [ani, document].
- [ ] Conturi reale create; **toate conturile și parolele de test șterse sau parolele schimbate**.
- [ ] Persoanele cu rol de validator sunt cele autorizate de laborator să semneze buletine.
- [ ] Antet, semnătură și ștampilă încărcate în „Buletin”; verificate pe un buletin de probă.

## E. Lot cu mai multe probe
- [ ] Procedura laboratorului pentru loturile de smochine și nuci (număr de probe de laborator, probă agregată de peste/sub 12 kg) corespunde cu ce se poate constitui în aplicație (2–10 probe, același beneficiar).
- [ ] Decizia de lot **nu apare pe buletinul tipărit** (apare în fila „Laborator” și în dosar); laboratorul decide cum o comunică beneficiarului.

## F. Integritate și copii
- [ ] Copii criptate programate; parola păstrată separat; test de restaurare efectuat și consemnat.
- [ ] Rezumatul exportat se semnează și se arhivează pe alt suport; persoana responsabilă și frecvența [de completat].
- [ ] Se știe că lanțul de amprente arată nemodificarea, nu corectitudinea datelor.

## G. Validarea sistemului
- [ ] Protocolul din `docs/VALIDARE_PILOT.md` parcurs și semnat; matricea de validare din fila „Calitate” (VAL-01…VAL-15) completată cu rezultate și note.
