#!/bin/sh
# Pornirea containerului: pregătește secretul de sesiune și (opțional) primul administrator, apoi pornește serverul.
set -e
LIMS_DB_PATH="${LIMS_DB_PATH:-/data/lims.db}"
export LIMS_DB_PATH
mkdir -p /data /data/backup

# Secretul de sesiune se generează o singură dată și rămâne în volumul de date.
if [ -z "$SESSION_SECRET" ]; then
  node scripts/first-run.js secret --file /data/session-secret
  SESSION_SECRET="$(cat /data/session-secret)"
  export SESSION_SECRET
fi

# Primul administrator: numai dacă LIMS_ADMIN_EMAIL este setat și nu există deja un administrator.
# Parola temporară apare o singură dată în jurnalul containerului (docker compose logs lims).
if [ -n "$LIMS_ADMIN_EMAIL" ]; then
  node scripts/first-run.js admin --email "$LIMS_ADMIN_EMAIL"
fi

# Instanță de demonstrație: date inventate, doar dacă LIMS_DEMO=1 (refuzat de aplicație în producție).
if [ "$LIMS_DEMO" = "1" ] || [ "$LIMS_DEMO" = "true" ]; then
  node scripts/demo-seed.js
fi

exec node server.js
