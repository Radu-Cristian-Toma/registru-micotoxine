# Etapa B — implementarea lacunelor (revizia 3, închiderea părții de program)

Ramură: `etapa-b-rev3` (față de `main` după PR #6; **neîmbinată**, în așteptarea aprobării explicite). Referință: `docs/AUDIT_ETAPA_A.md` (numerotarea L1–L24 păstrată). Revizia 3 înlocuiește secțiunea „Neimplementat” din `docs/ETAPA_B_REVIZIA2.md`.
Excluse prin regula proiectului: securizarea (lista „Etapa finală: securizare”, mai jos). Parolele simple de test nu au fost atinse.

## Decizii ale titularului (înregistrate)

| Subiect | Decizie |
|---|---|
| L17 separarea sarcinilor | Strictă implicit; relaxabilă numai cu motiv scris, jurnalizat (`policy_updated`) |
| Corecția pentru recuperare | Opțională, per grup; marcată pe buletin; „<LOQ” = zero în limita inferioară a sumei aflatoxinelor |
| L13/L14 | Registru simplu de echipamente și loturi; interval de acceptare bilateral (% din valoarea așteptată) și istoric QC |
| Integrare | O singură ramură, mai multe comenzi, o singură îmbinare după aprobare |

## Lacune închise în această revizie

| Lacună | Conținut | Locul în cod |
|---|---|---|
| L4 (finalizare) | Corecție de recuperare opțională (`corrected`), sumă în limita inferioară, marcaj pe buletin | `public/decision-core.js`, `db/evaluation.js` |
| L10 | Retragere / înlocuire buletin: un singur eveniment, motiv obligatoriu, tabel append-only `bulletin_status_events`; bannere pe buletin și pe pagina publică | `routes/lab.js`, `db/bulletin-state.js`, `public/verify.html` |
| L12 | Perioadă de retenție în setări; export de dosar (JSON cu amprentă SHA-256), jurnalizat | `routes/lab.js`, `routes/admin.js` |
| L13 | Controale QC (append-only), stare pe grup (ok / depășit / eșuat / fără), avertisment pe termen | `routes/lab.js` |
| L14 | Echipamente și loturi; calibrarea/expirarea impuse la trimitere; afișate pe buletin | `routes/lab.js`, `routes/results.js` |
| L15 | Lot, număr de incremente, metodă de prelevare declarate de beneficiar; mențiune pe buletin că laboratorul nu răspunde de prelevare | `routes/samples.js`, `public/lab.js` |
| L16 | Starea probei la recepție (ambalaj, cantitate, temperatură, transport, observații) la poarta de intrare | `routes/results.js`, `public/lab.js` |
| L17 | Roluri stricte (administratorul nu introduce/aprobă/validează; aceeași persoană nu aprobă și validează) | `db/policy.js`, `routes/*` |
| L19 | Marcaje de timp: convenția „timp local al serverului” + fus orar în `app_meta`; avertisment la schimbarea fusului | `db/clock.js`, `scripts/verify-integrity.js` |
| L20 | Ștergerea unei valori numai explicit, cu motiv (nu prin COALESCE) | `routes/results.js` |
| L22 | Baza de raportare (probă așa cum a fost primită / substanță uscată + %), masa și omogenizarea probei de laborator, replicate | `routes/results.js`, `public/lab.js` |
| C2 | Antet de buletin la emitere (instantaneu), număr de buletin, validator | `routes/results.js` |

Teste: `lab-routes` (12 teste), `decision-core`, `recovery-route`, `issued-branding`, `queue-bulletin-fields`; suita completă: 117 teste, 115 trec; cele două eșecuri (`backup.test.js`) provin din înlocuitorul `node:sqlite` și trebuie rulate în mediul normal.

## Verificare vizuală (Chromium, bază temporară, date inventate)

Verificate: registru și QC; poarta de recepție; formularul cu informațiile suplimentare; refuzul trimiterii cu calibrare expirată; refuzul validării de către aceeași persoană; emiterea de către al doilea validator; retragerea buletinului (motiv cerut), bannerul în vizualizarea proprietarului (RO/EN) și pe pagina publică (desktop și 390 px); exportul dosarului (descărcare, structură); politica de laborator (refuz fără motiv, salvare cu motiv); tabelele de laborator pe ecran de 390 px (fără derulare orizontală a paginii); `verify-integrity` pe baza de test (0 discrepanțe).
**Neverificate în browser:** înlocuirea buletinului (`supersede`, acoperită de teste de rută); fluxul de respingere la poarta de intrare; stările QC „depășit/eșuat” (acoperite de teste); tipărirea buletinului cu secțiunile noi; acțiunile de administrator (creare operator/validator, resetare probă) după modificarea politicii.

## Rămas în afara aplicației sau pentru laborator

- **L9** (validarea sistemului): dovezile VAL-01…VAL-08 (pași, rezultate, semnături) le produce laboratorul; aplicația oferă acum teste automate pentru calcul, decizie, QC, ciclu de viață și dosar, dar nu înlocuiește protocolul de validare **[de completat de laborator]**.
- **L11** (backup/restaurare): scriptul există; testul de restaurare, frecvența și locul de păstrare se stabilesc în mediul real **[de completat]**; testele `backup.test.js` neexecutate aici.
- **L21**: textele hărții ISO (impartialitate, trasabilitate) și ale regulii de decizie au fost aliniate cu codul; celelalte concordanțe rămân de reverificat la validarea de către laborator.
- Limitele de reglementare și formularea regulii din Reg. (UE) 2023/2782: reconfirmate parțial în `docs/VERIFICARE_REGLEMENTARA.md`; regula de aplicare a corecției pentru recuperare (anexa II) **[de verificat]**.
- Perioada de retenție, intervalul de acceptare QC, incertitudinile și certificatele: valori ale laboratorului **[de completat]**.

## Etapa finală: securizare (neexecutată, listă separată)

Parole puternice și politică de parole; recuperare de parolă; blocare după încercări eșuate; autentificare în doi pași (opțional); gestionarea secretelor (`SESSION_SECRET`, `.env`); cookie-uri `secure` și HTTPS; limitarea ratei; criptarea copiilor de siguranță; revizuirea dependențelor; test de penetrare. Parolele simple de test rămân până la acest pas.

## Limite ale verificării

- Testele locale folosesc un înlocuitor `node:sqlite` în locul `better-sqlite3`.
- Date de test inventate; nu s-au folosit date reale, chei sau `.env`.
- Nicio funcție nu declară conformitatea cu ISO/IEC 17025; aplicația este pilot.
