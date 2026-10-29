# Distribuție către laboratoare (v1.55.0)

**Stare:** pilot, nevalidat și neacreditat. Parcurgeți `docs/LISTA_VERIFICARE_LABORATOR.md` și `docs/VALIDARE_PILOT.md` înainte de a folosi aplicația cu date reale. Valorile marcate [de completat] aparțin laboratorului.

**Licență:** AGPL-3.0-or-later (`LICENSE`, `NOTICE`). Dacă modificați programul și îl puneți la dispoziția altor utilizatori printr-o rețea, le oferiți și codul sursă modificat (setați `LIMS_SOURCE_URL`).

## 1. Ce conține pachetul
Arhiva `lims-micotoxine-1.55.0.tar.gz` (cu `SHA256SUMS`) conține codul, `Dockerfile`, `docker-compose.yml` (aplicația și proxy HTTPS Caddy), `docker-compose.demo.yml`, documentația și ghidul `docs/Ghid_utilizare_v1.55.0.pdf`. Verificați arhiva: `sha256sum -c SHA256SUMS`.

## 2. Instalare cu Docker (recomandat)
Cerințe: un server Linux cu Docker Engine și Docker Compose; un nume DNS pentru server (pentru certificat automat) și porturile 80/443 deschise.
1. `tar xzf lims-micotoxine-1.55.0.tar.gz && cd lims-micotoxine-1.55.0`
2. `cp docker/env.example .env` și completați `LIMS_DOMAIN` (numele serverului) și `LIMS_ADMIN_EMAIL`; opțional `LIMS_BACKUP_PASSPHRASE` (minimum 12 caractere, păstrată separat).
3. `docker compose up -d --build`
4. `docker compose logs lims` — parola temporară a primului administrator apare **o singură dată**.
5. Deschideți `https://<LIMS_DOMAIN>`, autentificați-vă și schimbați parola când aplicația o cere.

Ce face configurarea: secretul de sesiune se generează la prima pornire și rămâne în volumul `/data`; aplicația rulează cu `NODE_ENV=production` (refuză configurările nesigure), nu este publicată direct, iar datele (baza, copiile) sunt în volumul Docker `lims-data`.
Cu `LIMS_DOMAIN=localhost` proxy-ul folosește un certificat propriu (browserul avertizează); pentru un nume intern fără DNS public, certificatul propriu trebuie declarat de încredere pe stațiile laboratorului.

## 3. Instanță de demonstrație (date inventate)
`docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d lims` apoi `http://localhost:3000`. Conturile (`admin@`, `operator@`, `validator@`, `validator2@`, `beneficiar@demo.invalid`) și parola sunt afișate de `docker compose logs lims`. Bannerul „DEMO” este permanent; aplicația refuză `LIMS_DEMO` în producție. Nu folosiți instanța demo cu date reale.

## 4. Operare
| Activitate | Comandă (în directorul instalării) |
|---|---|
| Copie criptată | `docker compose exec -e LIMS_BACKUP_PASSPHRASE=… lims node scripts/backup-db.js --encrypt /data/backup` |
| Copiere în afara serverului | `docker compose cp lims:/data/backup ./copii` apoi pe alt suport |
| Verificarea integrității | `docker compose exec lims node scripts/verify-integrity.js` |
| Rezumat exportat | `docker compose exec lims node scripts/export-digest.js` |
| Jurnal | `docker compose logs -f lims` |
Programarea periodică (cron) și frecvența sunt ale laboratorului [de stabilit]. Restaurarea: oprirea aplicației (`docker compose stop lims`), decriptarea cu `--decrypt` și înlocuirea bazei din volum, apoi pornirea; testați restaurarea pe o instanță separată.

## 5. Actualizare
Copie criptată; arhiva nouă într-un director nou; copiați `.env`; `docker compose up -d --build` (volumele se păstrează). Dacă ceva nu merge, reveniți la directorul anterior și restaurați copia dinaintea actualizării.

## 6. Fără Docker
Vezi `docs/INSTALARE_PILOT.md` (Node.js 22, `npm ci --omit=dev`, `node scripts/first-run.js env` pentru `.env` cu secret generat, proxy HTTPS propriu).

## 7. Limite cunoscute
Fără semnătură electronică calificată, integrare cu aparatura, autentificare în doi pași sau test de penetrare; politica de parole este cea minimă (8 caractere). Browserul încarcă fonturile IBM Plex de la Google Fonts; într-o rețea fără internet se folosesc fonturile sistemului (de luat în calcul la conformitatea cu GDPR). Descărcarea imaginilor Docker de bază (Node.js, Caddy) cere acces la un registru de imagini; pentru rețele izolate se pregătește o imagine prin `docker save`/`docker load` [de verificat de laborator].
