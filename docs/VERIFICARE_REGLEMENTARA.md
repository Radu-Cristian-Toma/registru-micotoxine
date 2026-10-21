# Verificarea limitelor și regulilor față de textul EUR-Lex

Data verificării: 2026-10-21. Metodă: citirea automată a textului HTML consolidat, prin `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:…`, cu confruntarea fiecărui profil din `db/evaluation.js`. Aceasta **nu înlocuiește confirmarea juridică a laboratorului** pe textul oficial publicat în Jurnalul Oficial.

## Reg. (UE) 2023/915, versiunea consolidată 02023R0915-20250101, anexa I

| Punct | Produs (pe scurt) | Valori citite | Profil din aplicație | Rezultat |
|---|---|---|---|---|
| 1.1.1 / 1.1.2 | fructe uscate: sortare / consum final | AFB1 5 / 2; suma 10 / 4 | dried-fruit-sorting, dried-fruit-final | coincide |
| 1.1.3 | smochine uscate | 6 / 10 | dried-figs-final | coincide |
| 1.1.4 / 1.1.5 | arahide, semințe oleaginoase | 8 / 15; 2 / 4 | peanuts-oilseeds-* | coincide |
| 1.1.6 / 1.1.7 | nuci | 5 / 10; 2 / 4 | tree-nuts-* | coincide |
| 1.1.8 / 1.1.9 | migdale, fistic, sâmburi de caise | 12 / 15; 8 / 10 | almonds-pistachios-apricot-*, pistachios-* | coincide |
| 1.1.10 / 1.1.11 | alune de pădure, nuci braziliene | 8 / 15; 5 / 10 | hazelnuts-brazil-* | coincide |
| 1.1.12 | cereale și produse derivate | 2 / 4 | profilele de cereale, orez | coincide |
| 1.1.13 | porumb și orez pentru sortare | 5 / 10 | maize-rice-sorting | coincide |
| 1.1.14 | condimente uscate | 5 / 10 | capsicum-dried, spices-dried | coincide |
| 1.1.16 | lapte | M1 0,050 | raw-milk | coincide |
| 1.2.1.1 / 1.2.1.2 | fructe de viță-de-vie și smochine / alte fructe uscate | OTA 8 / 2 | dried-vine-fruit-*, dried-figs-final, dried-fruit-* | coincide |
| 1.2.3 / 1.2.4 | fistic: sortare / consum final | 10 / 5 | pistachios-* | coincide |
| 1.2.8 | semințe de floarea-soarelui etc. | 5 | oilseeds-ota-final | coincide |
| 1.2.9 / 1.2.10 | cereale neprocesate / consum final (marcate M7) | 5 / 3 | profilele de cereale | coincide |
| 1.2.14 / 1.2.15 | cafea prăjită / solubilă | 3 / 5 | roasted-coffee, instant-coffee | coincide |
| 1.2.17 / 1.2.18 | condimente / ardei uscat | 15 / 20 | spices-dried, capsicum-dried | coincide |
| 1.2.20 | vin | 2 | wine | coincide |
| 1.4.1–1.4.6.1 | DON: neprocesate 1000; grâu dur și porumb 1500; ovăz 1750; consum final 750; produse de măcinare 600; porumb măcinat consum final 750 | idem | profilele de cereale | coincide |
| 1.5.1–1.5.5 | ZEA: neprocesate 100; porumb neprocesat 350; cereale/făină consum final 75; porumb consum final 100 | idem | profilele de cereale | coincide |
| 1.6.1 / 1.6.2 | fumonisine: porumb neprocesat 4000; consum final 1000 | idem | maize-* | coincide |

**Suma aflatoxinelor:** anexa I, secțiunea 1.1 indică „lower bound” — valorile sub LOQ se iau ca zero. Aplicația aplică acum această regulă (etapa C2).

**Substanță uscată:** punctele 1.1.18 (AFB1 0,10), 1.2.23 (OTA 0,50), 1.4.9 (DON 150), 1.5.8 (ZEA 20) pentru alimente pentru sugari se referă la substanța uscată a produsului introdus pe piață. Aplicația înregistrează baza de raportare (etapa C3, L22).

## Reg. de punere în aplicare (UE) 2023/2782

- Regula de respingere (ex. anexa I, secțiunile A.6, B.7, E.7, F.3, G.7, H.3): proba depășește limita „dincolo de orice îndoială rezonabilă” când rezultatul analitic **(corectat pentru recuperare, dacă este cazul) minus incertitudinea extinsă** este peste limită. Corespunde regulii `reg_2782_u` din aplicație.
- Anexa II, pct. 4.2.1.1 (metode de confirmare): recuperare medie 70–120 %, excepțional 50–130 % dacă sunt îndeplinite criteriile de precizie; RSDr ≤ 20 %, RSDwR ≤ 20 %, RSDR ≤ 25 %.
- Art. 1 pct. 12: LOQ = cel mai mic nivel validat cu succes. Nota 4: sub LOQ se poate raporta în scop de monitorizare.
- Dacă rezultatul se raportează corectat sau necorectat pentru recuperare, nu a putut fi citit în partea accesibilă a textului: **[de verificat în anexa II]**. Aplicația face alegerea explicită și o marchează în buletin.

## Limite ale verificării

- Nu s-a verificat identificarea M-urilor din textul consolidat cu regulamentele modificatoare (2024/1022, 2024/1756 etc.); sursa din profil păstrează trimiterile existente.
- Aplicabilitatea la un produs concret (de exemplu „neprocesat” față de „consum final”) rămâne decizia laboratorului.
