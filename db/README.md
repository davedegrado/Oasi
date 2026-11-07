# Database

Schema PostgreSQL multi-tenant della piattaforma (compatibile con Supabase).

| Cartella | Contenuto |
| --- | --- |
| `migrations/` | Migrazioni SQL in ordine numerico. Si applicano così come sono a Supabase (SQL editor o `supabase db push`). |
| `seed/` | Dati dimostrativi **generati** da `apps/web/scripts/export-demo-seed.ts` (`npm run seed:export`): tenant Oasi Metropolitana e tenant di prova Studio Prova. Tutti marcati `is_demo`. |
| `tests/isolation.sql` | Controlli di isolamento tra tenant eseguiti con il ruolo dell'API. |
| `local/` | Solo sviluppo: stub dello schema `auth` di Supabase, utenti demo e script di reset. |

## Regole di isolamento

- `platform.*`: tabelle della piattaforma (tenant, domini, branding, piani, moduli, staff, audit). Le gestisce solo lo staff tramite l'API.
- `app.*`: dati delle palestre. Ogni tabella ha `tenant_id`, chiave primaria composta e chiavi esterne composte: due righe di palestre diverse non possono essere collegate.
- L'API si collega con il ruolo `oasi_api` (senza `BYPASSRLS`) e imposta `app.tenant_id` / `app.user_id` in ogni transazione. Se il valore manca, le policy non restituiscono righe.
- Lo schema `app` non è esposto dall'API REST automatica di Supabase; i ruoli `anon` e `authenticated` non hanno permessi.

## Sviluppo locale

```bash
# PostgreSQL 16 in ascolto (es. PGHOST=/tmp PGPORT=5433)
db/local/reset.sh --seed                      # ricrea il database "oasi" con migrazioni e seed
psql -d oasi -f db/tests/isolation.sql        # 11 controlli di isolamento
```

## Su Supabase

1. Applicare `migrations/*.sql` in ordine.
2. Impostare la password del ruolo API: `alter role oasi_api password '…';` (mai nel repository).
3. Usare come connessione dell'API il ruolo `oasi_api` (pooler di Supabase).
4. Il seed demo è facoltativo: in produzione Oasi Metropolitana verrà creato con l'onboarding, senza dati demo.
