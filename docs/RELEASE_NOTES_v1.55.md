# Versiunea 1.55.0 — distribuție pentru laboratoare

**Stare:** pilot, nevalidat și neacreditat.

- **Licență:** AGPL-3.0-or-later (`LICENSE`, `NOTICE`); dependențele de execuție sunt permisive (`npm run license-check`). Titularul drepturilor de autor în `NOTICE` este [de completat].
- **Docker:** `Dockerfile`, `docker-compose.yml` cu proxy HTTPS Caddy, volum de date, verificare de stare; construit și testat în sesiunea de dezvoltare (autentificare prin HTTPS, schimbarea parolei temporare, copie criptată).
- **Prima pornire:** `scripts/first-run.js` (SESSION_SECRET generat; primul administrator cu parolă temporară aleatoare, afișată o dată, cu schimbare obligatorie). Parolele de test și politica de parole nu s-au modificat.
- **Instanță demo:** `scripts/demo-seed.js` + `LIMS_DEMO=1` (date inventate, banner „DEMO”, refuzat în producție).
- **Subsol:** versiune, licență, legătură către codul sursă (`LIMS_SOURCE_URL`), conform AGPL-3.0 art. 13.
- **Copie de siguranță:** copia simplă nu mai lasă fișiere `-wal`/`-shm` lângă ea.
- **Ghid:** `docs/Ghid_utilizare_v1.55.0.pdf` (RO/EN, capturi din instanța demo; `scripts/make-guide.cjs`). Ghidul v1.53.3 din depozit era trunchiat la exact 4 MiB și ilizibil; a fost înlocuit.
- **Pachet:** `npm run make-release` (arhivă reproductibilă + SHA256SUMS). `docs/DISTRIBUTIE.md`.
- Teste: 183, toate trecute.

## Nepublicat (după v1.55.0): corecții ale traducerii în engleză
- **Sens:** „Așteaptă analizare” = „Awaiting analysis” (era „Awaiting review”); „Within uncertainty” în loc de „In uncertainty”.
- **Afirmații prea tari, în română și engleză:** semnătura validatorului este descrisă ca semnătură electronică simplă (nu „certifică legal”); tipărirea buletinului cere validarea de către **validator**, nu de către operator.
- **Terminologie unitară în engleză:** „customer” (nu client / owner / beneficiary), „test report” (nu „bulletin”), „compliant / non-compliant” pentru verdictul față de limită, „Mycotoxin Register”, „Fusarium”, ortografie britanică.
- **Texte din server tradise în interfață:** sursele limitelor (inclusiv versiunea consolidată a regulamentului) și matricea de validare VAL-01…15 apar în engleză când interfața este în engleză; pe buletin rămân bilingve.
- **Test automat** (`test/unit/i18n-en.test.js`): acoperire EN, fără diacritice românești în valorile EN, terminologie unitară, sursele limitelor traduse.
- **Mesajele de eroare ale serverului** (143 de texte din `routes/` și `middleware/`) se traduc în interfața EN prin `public/server-errors-en.js` (potrivire exactă sau pe șablon, pentru mesajele cu valori); textele necunoscute rămân neschimbate. Un test automat cere traducere pentru fiecare mesaj nou.
- **Neschimbat:** Parolele, limitele și regula de decizie nu s-au modificat. 188 de teste trecute; 45/45 verificări în browser.
