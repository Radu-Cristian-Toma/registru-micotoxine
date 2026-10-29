# Politica de securitate

## Raportarea unei vulnerabilități

Nu deschideți un subiect public pentru o vulnerabilitate. Scrieți la **[de completat: adresa de contact pentru securitate]**
cu: versiunea (`/api/auth/me` → `instance.version`, sau subsolul aplicației), descrierea, pașii de reproducere și efectul.
Nu atașați date reale ale laboratorului sau ale beneficiarilor. Termen țintă de răspuns: [de completat].

## Versiuni care primesc remedieri

Ultima versiune publicată (seria 1.55.x). Versiunile anterioare nu se mențin.

## Ce acoperă aplicația și ce rămâne în sarcina laboratorului

Mecanismele din aplicație (conturi, blocare după încercări eșuate, schimbarea parolei temporare, CSRF, cookie „Secure”
și HSTS în producție, copii de siguranță criptate, lanț de amprente pe jurnal și rezultate) sunt descrise în
`docs/ETAPA_D3_SECURIZARE.md`. Rămân în sarcina laboratorului: HTTPS pe serverul real, păstrarea secretelor
(`SESSION_SECRET`, `LIMS_BACKUP_PASSPHRASE`), politica de parole a instituției, actualizările sistemului de operare,
copiile de siguranță în afara serverului și validarea software pentru utilizarea intenționată.

Instanța de demonstrație (`LIMS_DEMO=1`) are conturi cu parolă publică și nu se expune în rețea.
