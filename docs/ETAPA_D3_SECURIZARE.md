# Etapa D3: securizare finală

**Cadru.** Etapa pe care titularul a lăsat-o ultima. **Nu s-au modificat:** parolele și conturile de test din `test/*.cjs`, valoarea implicită a secretului de sesiune din dezvoltare (`dev-secret-schimba-in-productie`, rămâne în `config.js` ca `DEV_SESSION_SECRET`), regula de lungime a parolei (minimum 8 caractere, ca la înregistrare), limitele legale și regula de decizie. Aplicația rămâne un pilot; această etapă nu o face „sigură pentru internet”, ci reduce riscurile cunoscute și le declară pe cele rămase.

## Ce se schimbă
| Zonă | Schimbare | Fișiere |
|---|---|---|
| Configurare de producție | Cu `NODE_ENV=production`, serverul **refuză să pornească** fără `SESSION_SECRET`, cu secretul implicit, cu unul sub 32 de caractere, sau ascultând pe toate interfețele fără `LIMS_TRUST_PROXY`. În dezvoltare, comportamentul este cel de până acum. | `config.js`, `server.js` |
| HTTPS și proxy | `LIMS_TRUST_PROXY` (număr de proxy-uri sau „loopback”) pentru ca cookie-ul „Secure” și IP-ul real să funcționeze în spatele unui proxy invers; în producție, antet HSTS (15 552 000 s). Aplicația nu termină TLS. | `server.js` |
| Antete | `Content-Security-Policy` cu directivele care nu cer modificarea scripturilor (`frame-ancestors`, `base-uri`, `form-action`, `object-src`); `Cache-Control: no-store` pe `/api`. | `server.js` |
| Autentificare | Blocare **pe cont** (10 încercări eșuate în 15 minute, din orice adresă; și pentru conturi inexistente, cu același răspuns), în plus față de limita pe IP (5 în 15 minute). | `middleware/rate-limit.js`, `routes/auth.js` |
| Jurnal de securitate | `login_success`, `login_failed` (fără textul introdus), `account_locked`, `password_changed`, `password_change_failed`, `password_reset_by_admin`; intră în jurnalul de audit cu lanț de amprente. | `routes/auth.js`, `routes/admin.js` |
| Parole | Schimbarea parolei de către utilizator (parola curentă, minimum 8 caractere, diferită de cea curentă; toate sesiunile contului se închid și se reînnoiește cea curentă). Resetare de către administrator: parolă temporară de 14 caractere, afișată o singură dată; **schimbare obligatorie** la prima autentificare (toate rutele `/api`, în afară de `/auth/me`, `/auth/logout` și `/auth/change-password`, răspund 403 până atunci); sesiunile contului se închid. Parola temporară nu apare în jurnal. | `routes/auth.js`, `routes/admin.js`, `middleware/password-gate.js`, `db/database.js` (coloana `users.must_change_password`), `public/lab.js`, `public/app.js` |
| Copii de siguranță | Copie criptată cu AES-256-GCM, cheie derivată cu scrypt din `LIMS_BACKUP_PASSPHRASE` (minimum 12 caractere, doar din mediu): `node scripts/backup-db.js --encrypt [director]`; restaurare: `--decrypt <fisier.db.enc> <iesire.db>` (cu verificarea integrității). Copia în clar se șterge; o parolă greșită sau un fișier modificat sunt refuzate. | `scripts/backup-crypto.js`, `scripts/backup-db.js` |
| Dependențe | `npm audit fix`: `body-parser`, `proxy-addr` (critic: IP spoofing), `qs` actualizate (doar `package-lock.json`); `npm audit --omit=dev`: 0 vulnerabilități la data verificării (29.10.2026). | `package-lock.json` |

## Teste
`test/unit/security.test.js` (8 teste: configurare de producție, `trust proxy`, blocare pe cont, jurnal fără date introduse, schimbare și resetare de parolă cu sesiuni închise, pornirea reală a serverului în producție cu și fără secret) și 3 teste noi în `backup.test.js` (criptare, parolă greșită, fișier modificat, CLI). Total: 174 de teste, toate trecute [de actualizat la îmbinare]. Verificare în browser: V21 (schimbarea parolei), V22 (resetare + schimbare obligatorie), V23 (antete).

## Ce rămâne în afara acestei etape (de decis de laborator sau pentru o etapă ulterioară)
- **Politica de parole:** neschimbată (lungime minimă 8). Fără complexitate, fără listă de parole interzise, fără expirare. Parolele de test rămân în scripturile de verificare.
- **Parolele conturilor existente de test:** trebuie schimbate înainte de orice utilizare reală (cu butonul „Parola” sau prin resetare de administrator).
- **CSP complet** (`script-src`, `style-src`): cere eliminarea scripturilor și a stilurilor inline din `verify.html` și a stilurilor inline din aplicație; nu s-a făcut. Fonturile se încarcă de la Google Fonts (dependență externă; de înlocuit cu fonturi locale în producție, dacă politica laboratorului o cere).
- **Autentificare în doi pași**, **expirare a sesiunii la inactivitate** (acum 8 ore de la autentificare), **recuperare de parolă prin email** (nu există server de email; recuperarea se face prin administrator).
- **Terminarea TLS:** aplicația cere un proxy invers cu HTTPS; configurarea lui (certificate, reînnoire) aparține laboratorului.
- **Gestionarea secretelor:** `SESSION_SECRET` și `LIMS_BACKUP_PASSPHRASE` le generează și le păstrează laboratorul, separat de depozit și de copii; nu există rotire automată.
- **Test de penetrare** și **revizuirea periodică a dependențelor**: neefectuate; `npm audit` trebuie rulat periodic.
- **Blocarea pe cont** poate fi folosită pentru blocarea temporară a unui cont cunoscut (compromis asumat; expiră după 15 minute). Contoarele sunt în memorie și se pierd la repornire.
- Limita de dimensiune a cererilor (8 MB) rămâne cea veche.

## Listă de verificare pentru pornirea în producție (pilot)
1. `NODE_ENV=production`, `SESSION_SECRET` generat (≥ 32 de caractere), `LIMS_TRUST_PROXY=1` în spatele unui proxy invers cu HTTPS.
2. Schimbarea parolelor tuturor conturilor create pentru teste; crearea conturilor reale.
3. Copii criptate programate (`--encrypt`), parola copiilor păstrată separat; test de restaurare (`--decrypt`) înaintea utilizării reale.
4. `npm run verify-integrity` și `npm run digest` programate; rezumatele păstrate pe un suport separat.
5. `npm audit --omit=dev` fără vulnerabilități; se repetă la fiecare actualizare.
