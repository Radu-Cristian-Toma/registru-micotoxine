# Versiunea 1.55.0 — distribuție pentru laboratoare

**Stare:** pilot, nevalidat și neacreditat.

- **Licență:** AGPL-3.0-or-later (`LICENSE`, `NOTICE`); dependențele de execuție sunt permisive (`npm run license-check`). Titularul drepturilor de autor în `NOTICE` este [de completat].
- **Docker:** `Dockerfile`, `docker-compose.yml` cu proxy HTTPS Caddy, volum de date, verificare de stare; construit și testat în sesiunea de dezvoltare (autentificare prin HTTPS, schimbarea parolei temporare, copie criptată).
- **Prima pornire:** `scripts/first-run.js` (SESSION_SECRET generat; primul administrator cu parolă temporară aleatoare, afișată o dată, cu schimbare obligatorie). Parolele de test și politica de parole nu s-au modificat.
- **Instanță demo:** `scripts/demo-seed.js` + `LIMS_DEMO=1` (date inventate, banner „DEMO”, refuzat în producție).
- **Subsol:** versiune, licență, legătură către codul sursă (`LIMS_SOURCE_URL`), conform AGPL-3.0 art. 13.
- **Copie de siguranță:** copia simplă nu mai lasă fișiere `-wal`/`-shm` lângă ea.
- **Ghid:** `docs/Ghid_utilizare_v1.55.0.pdf (înlocuit în v1.55.1 de `docs/Ghid_utilizare_v1.55.1.pdf`)` (RO/EN, capturi din instanța demo; `scripts/make-guide.cjs`). Ghidul v1.53.3 din depozit era trunchiat la exact 4 MiB și ilizibil; a fost înlocuit.
- **Pachet:** `npm run make-release` (arhivă reproductibilă + SHA256SUMS). `docs/DISTRIBUTIE.md`.
- Teste: 183, toate trecute.

Corecțiile ulterioare sunt în `docs/RELEASE_NOTES_v1.55.1.md`.
