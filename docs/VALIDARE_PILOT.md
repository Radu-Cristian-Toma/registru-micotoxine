# Protocol de validare pentru pilot (șablon)

**Scop:** dovada că aplicația îndeplinește utilizarea intenționată a laboratorului. Acest document este un **șablon**: pașii, criteriile și semnăturile le stabilește și le completează laboratorul. Testele automate (`docs/INDEX_TESTE.md`) și verificarea în browser (`scripts/browser-verify/`) sunt probe de sprijin, nu un protocol de validare complet; rulează pe date inventate și într-un mediu de dezvoltare.

## 1. Utilizarea intenționată [de completat de laborator]
Descrierea fluxului în care se folosește aplicația (ce analize, ce roluri, ce decizii se iau în aplicație și care rămân în afara ei).

## 2. Mediu de validare
| Element | Valoare [de completat] |
|---|---|
| Versiune aplicație (etichetă) | |
| Node.js, sistem de operare | |
| Bază de date folosită (copie de test, fără date reale sau cu date reale anonimizate) | |
| Persoane (rol, nume, data) | |

## 3. Matricea cerințelor, a testelor automate și a verificărilor manuale
Testele automate sunt numai punctul de plecare; **laboratorul execută verificările manuale pe instanța pilotului** și le consemnează în fila „Calitate” (VAL-01…VAL-15).

| Cod | Cerință | Teste automate relevante (`test/unit/…`) | Verificare manuală de executat de laborator | Rezultat / semnătură |
|---|---|---|---|---|
| VAL-01 | Autentificare și acces pe roluri | `lab-routes`, `owner-view`, `security` | încercarea unor acțiuni interzise cu fiecare rol | |
| VAL-02 | Înregistrare și urmărire probă | `lab-routes`, `queue-bulletin-fields` | înregistrare probă, urmărire | |
| VAL-03 | Calcul sumă aflatoxine (lower bound) | `decision-core`, `decision-lot` | 3 seturi de valori confruntate cu un calcul independent | |
| VAL-04 | Evaluare față de limită | `decision-rule`, `limits-profiles`, `archive-evaluation` | verificarea profilurilor folosite de laborator | |
| VAL-05 | Blocarea validării incomplete | `lab-routes`, `bulletin-snapshot` | încercare de validare cu QC neacceptat / valori lipsă | |
| VAL-06 | Trasabilitatea modificărilor | `audit-events`, `audit-integrity` | modificare cu motiv; consultare istoric | |
| VAL-07 | Lucrări neconforme | `lab-routes` | înregistrare și închidere | |
| VAL-08 | Buletin și verificare publică | `bulletin-snapshot`, `issued-branding` | emitere, scanare QR, verificare | |
| VAL-09 | Decizie cu incertitudine | `decision-core`, `decision-rule` | 3 cazuri: conform, în incertitudine, neconform, confruntate manual | |
| VAL-10 | Lot cu mai multe probe | `decision-lot`, `lots` | constituire lot pentru un produs real (date anonimizate), ambele reguli | |
| VAL-11 | Beneficiarul nu vede rezultate înainte de validare | `owner-view` | cont de beneficiar: lista, detaliul, jurnalul | |
| VAL-12 | Verificare publică în stări | `bulletin-snapshot` | QR corect, QR alterat, număr inexistent | |
| VAL-13 | Parole: schimbare, resetare, blocare | `security` | schimbare, resetare de administrator, blocare | |
| VAL-14 | Copie criptată și restaurare | `backup` | copie, decriptare, pornire pe baza restaurată | |
| VAL-15 | Lanț de amprente și rezumat | `hash-chain`, `audit-integrity` | `verify-integrity`, export și verificare rezumat | |

## 4. Criterii de acceptare [de completat de laborator]
Ex. toate verificările din tabel trecute; nicio neconformitate deschisă; abaterile documentate cu decizie.

## 5. Abateri și decizii
| Nr. | Descriere | Decizie | Responsabil | Închis la |
|---|---|---|---|---|

## 6. Concluzie și semnături
Aplicația este / nu este aptă pentru utilizarea intenționată descrisă la §1 [decizia laboratorului]. Semnături: [de completat].

## 7. Revalidare
Se repetă la modificări ale versiunii, ale limitelor legale, ale regulii de decizie sau ale infrastructurii [criteriu de completat].
