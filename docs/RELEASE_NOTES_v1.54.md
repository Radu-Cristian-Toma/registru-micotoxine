# Versiunea 1.54.0

**Stare:** pilot. Nu este validată sau acreditată; pentru utilizare cu date reale se parcurg `docs/LISTA_VERIFICARE_LABORATOR.md` și `docs/VALIDARE_PILOT.md`.

## Funcții noi (etapa D1)
- **Loturi cu mai multe probe de laborator** (smochine; arahide, fructe cu coajă și mirodenii cu particule mari), cu decizie de lot după Reg. (UE) 2023/2782, anexa I, partea II: „nicio probă nu depășește limita” sau media probelor. Constituire în fila „Laborator”; lotul se îngheață după validarea oricărei probe; beneficiarul vede decizia după validarea tuturor probelor. Decizia de lot nu este pe buletinul tipărit.
- **Verificare publică în stări:** autentic / modificat / lipsă / neverificabil; amprenta (16 caractere) este în codul QR tipărit.
- **Export JSON al rezultatului** unui buletin emis (valoare cu „<” sub LOQ, incertitudine extinsă k = 2, recuperare, regulă, decizie cu vocabular fix).
- **Tipărire:** fragmentele bilingve ale rezumatului deciziei rămân pe același rând (O3).
- **Lanț de amprente și rezumat exportat** pentru jurnalul de audit și versiuni (PR #13), `judgeLot()` în nucleul de decizie (PR #14).

## Modificare de comportament (etapa D2)
- Beneficiarul **nu mai vede**, înainte de validarea probei, valorile, verdictul, observațiile operatorului, conținutul jurnalului și versiunile. Pe server, nu doar în interfață. După validare, ca înainte.

## Securizare (etapa D3)
- În producție, serverul refuză pornirea fără `SESSION_SECRET` valid; `LIMS_TRUST_PROXY`, HSTS, cookie „Secure”, CSP parțial, `no-store` pe `/api`.
- Blocare pe cont (10 încercări/15 minute), jurnal de securitate, schimbarea parolei, resetare de administrator cu parolă temporară și schimbare obligatorie.
- Copii de siguranță criptate (AES-256-GCM), `npm audit fix` (0 vulnerabilități la 29.10.2026).
- **Neschimbat:** parolele de test, politica de parole (minimum 8 caractere), valoarea implicită a secretului din dezvoltare.

## Pregătire de pilot (etapa D4)
- Documente: instalare, listă de verificare a laboratorului, șablon de validare, index al testelor; matricea de validare din aplicație are acum VAL-01…VAL-15.
- `npm run list-tests` produce `docs/INDEX_TESTE.md` din rularea reală a testelor.

## Verificare
- 174 de teste automate, toate trecute; verificare în browser pe date inventate (45 de verificări, toate trecute, 0 observații). Nu s-au folosit date reale.

## Limite cunoscute
- Fără semnătură electronică calificată, fără integrare cu aparatura, fără 2FA, fără CSP complet, fără test de penetrare, fără expirare a sesiunii la inactivitate.
- Decizia de lot este lăsată în fila „Laborator” și în dosar; alegerea modului de lot după produs aparține laboratorului. Suma aflatoxinelor este corectată cu recuperarea grupului (echivalent cu corecția pe toxină numai la recuperare comună).
- Valorile laboratorului (incertitudini, recuperări, intervale QC, retenție) nu sunt furnizate de aplicație.
