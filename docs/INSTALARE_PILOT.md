# Instalare și operare pentru pilot

> Calea recomandată din v1.55.0 este pachetul Docker: `docs/DISTRIBUTIE.md`. Documentul de față descrie instalarea fără Docker.

**Stare:** aplicația este un pilot; nu este validată sau acreditată. Documentul descrie ce trebuie pregătit pentru o utilizare controlată, cu date reale, **după** ce laboratorul a parcurs `docs/LISTA_VERIFICARE_LABORATOR.md` și `docs/VALIDARE_PILOT.md`. Valorile marcate [de completat] aparțin laboratorului.

## 1. Cerințe
- Linux sau macOS cu **Node.js 22** (testat pe 22.x) și posibilitatea de a compila modulul nativ `better-sqlite3` (instrumente de compilare C++ și Python) sau un pachet precompilat disponibil pentru platformă.
- Un proxy invers cu **HTTPS** (de exemplu nginx sau Caddy) și un certificat valid pentru numele de domeniu al laboratorului. Aplicația nu termină TLS.
- Un disc cu spațiu pentru baza de date, copiile de siguranță și rezumatele exportate [dimensionare de completat].

## 2. Instalare
1. Copiați depozitul la versiunea etichetată a pilotului: `git clone … && git checkout <eticheta versiunii livrate>` [eticheta o creează titularul depozitului] sau dezarhivarea pachetului.
2. `npm ci --omit=dev` (instalează exact versiunile din `package-lock.json`); apoi `npm audit --omit=dev` (trebuie să nu raporteze vulnerabilități).
3. Creați fișierul `.env` (nu intră în depozit) pornind de la `.env.example`:
   - `NODE_ENV=production`;
   - `SESSION_SECRET`: generat cu `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`; păstrat separat de depozit și de copii;
   - `LIMS_TRUST_PROXY=1` (un singur proxy invers);
   - `LIMS_HOST=127.0.0.1` (aplicația ascultă numai local; proxy-ul o expune pe HTTPS);
   - `LIMS_DB_PATH` dacă baza nu stă în `db/lims.db`;
   - `LIMS_BACKUP_PASSPHRASE` pentru copii criptate (minimum 12 caractere), păstrată separat.
4. Primul cont de administrator: `node scripts/first-run.js admin --email <email>` (parolă temporară aleatoare) sau `node db/seed-admin.js <email> <parola> "<nume>"`. **Alegeți o parolă nouă, nu una de test**; apoi schimbați-o din butonul „Parola” dacă a fost comunicată pe alt canal.
5. Pornire: `node server.js` (sau prin serviciul de sistem de mai jos). La pornire, în producție, aplicația refuză configurările nesigure și spune ce lipsește.

### Serviciu systemd (exemplu; de adaptat)
```
[Unit]
Description=Registru Micotoxine
After=network.target

[Service]
User=lims
WorkingDirectory=/opt/lims-micotoxine
EnvironmentFile=/opt/lims-micotoxine/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

### Proxy invers nginx (exemplu; de adaptat)
```
server {
  listen 443 ssl;
  server_name lims.example.org;           # [de completat]
  ssl_certificate     /etc/ssl/…/fullchain.pem;
  ssl_certificate_key /etc/ssl/…/privkey.pem;
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 3. Operare curentă
| Activitate | Comandă | Frecvență [de stabilit de laborator] |
|---|---|---|
| Copie de siguranță criptată | `LIMS_BACKUP_PASSPHRASE=… node scripts/backup-db.js --encrypt /cale/copii` | zilnic |
| Test de restaurare | `LIMS_BACKUP_PASSPHRASE=… node scripts/backup-db.js --decrypt copie.db.enc /cale/test/restaurat.db` (apoi pornirea unei instanțe de test pe acea bază) | lunar |
| Verificarea integrității bazei | `npm run verify-integrity` | zilnic |
| Rezumat exportat (lanț de amprente) | `npm run digest` apoi verificare `node scripts/verify-integrity.js --digest <fisier>` | zilnic sau săptămânal; fișierul se semnează și se arhivează **pe alt suport** |
| Audit al dependențelor | `npm audit --omit=dev` | la fiecare actualizare și lunar |
| Index al testelor (dovadă) | `npm run list-tests` | la fiecare versiune |

Parola copiilor se introduce numai din mediu, nu ca argument. Cine pierde parola pierde copiile.

## 4. Actualizare și revenire
1. Copie criptată înainte de actualizare; verificare cu `--decrypt` pe un mediu de test.
2. `git fetch --tags && git checkout <eticheta nouă>`, `npm ci --omit=dev`, `npm test`, `npm run release-check`, repornirea serviciului.
3. Dacă ceva nu merge: se revine la eticheta precedentă și, dacă schema bazei a fost extinsă (coloane adăugate, nu șterse), se păstrează baza existentă; în caz de dubiu, se restaurează copia de dinaintea actualizării.

## 5. Limite cunoscute pentru pilot
Vezi `README.md` (limitele actuale) și `docs/ETAPA_D3_SECURIZARE.md` (ce nu acoperă securizarea). În special: fără semnătură electronică calificată, fără integrare cu aparatura, fără 2FA, politica de parole minimă (8 caractere), fără CSP complet, fără test de penetrare.
