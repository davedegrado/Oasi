#!/usr/bin/env bash
# Ricrea un database locale e applica migrazioni (+ seed opzionale).
# Uso: PGHOST=/tmp PGPORT=5433 db/local/reset.sh [--seed]
set -euo pipefail
DB="${OASI_DB:-oasi}"
export PGOPTIONS="-c client_min_messages=warning"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
psql -U postgres -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/local/supabase_stub.sql"
for f in "$DIR"/migrations/*.sql; do
  psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -c "alter role oasi_api password 'oasi_api_local'"
if [[ "${1:-}" == "--seed" ]]; then
  psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/local/demo_users.sql"
  for f in "$DIR"/seed/*.sql; do psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"; done
fi
echo "Database $DB pronto"
