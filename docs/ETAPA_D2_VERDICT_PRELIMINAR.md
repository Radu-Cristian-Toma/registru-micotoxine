# Etapa D2: verdict preliminar ascuns beneficiarului (O1)

**Problema (constatarea O1 din `docs/ETAPA_C0_VERIFICARE.md`).** Lista beneficiarului arăta „Conform” sau „Depășire” pentru probe nevalidate, calculate din valorile introduse de operator, deși documentația spune că buletinul se arată numai după validare. Verificarea a arătat că nu era doar o etichetă: rutele beneficiarului întorceau și valorile analitice, observațiile operatorului, conținutul jurnalului de audit și versiunile cu valori, înainte de validare.

**Decizia titularului:** ascundere până la validare.

**Ce se schimbă (pe server, nu doar în interfață).** Pentru rolul „beneficiar”, până la validarea probei:
- `GET /api/samples/mine`, `/archive`, `/archive/export` și `/:id`: valorile (AFB1, AFB2, AFG1, AFG2, OTA, M1, DON, ZEA, fumonizine) și observațiile operatorului sunt `null`; starea „ok/fail” devine „în analiză”. Stadiul probei, motivul unei respingeri la recepție și starea QC rămân vizibile.
- `GET /api/samples/:id/audit`: acțiunile și momentele rămân, conținutul (`details`) este ascuns.
- `GET /api/results/:id/versions`: listă goală.
- Decizia de lot (etapa D1) apare numai când toate probele lotului sunt validate (deja implementat).
După validare, beneficiarul vede ca înainte valorile, verdictul, jurnalul și versiunile. Personalul (operator, validator, administrator) nu este afectat.

**Modul:** `db/owner-view.js` (`maskForOwner`, `maskAuditForOwner`).

**Teste.** `test/unit/owner-view.test.js` (4 teste): lista, arhiva, exportul CSV, detaliul, jurnalul și versiunile nu scurg valori înainte de validare; personalul vede valorile; după validare beneficiarul le vede. Testele `archive-evaluation` creează acum rezultate validate (evaluarea arhivei se vede numai după validare). Total: 163 de teste, toate trecute.

**Verificare în browser (date inventate):** 42 de verificări, 42 trecute, 0 observații (V4 trece: nicio etichetă preliminară pentru o probă respinsă la revizuire).

**Limite.** Beneficiarul vede în continuare stadiul (de exemplu „în analiză”, „respins la recepție”) și faptul că proba a fost returnată operatorului; nu am considerat stadiul o informație analitică. Lista de ce vede beneficiarul în interfață nu a fost reverificată pe fiecare ecran în afara scenariului automat.
