# Oasi Aerial · Piattaforma SaaS white-label

Piattaforma per palestre di danza aerea, scuole di danza e studi sportivi: un unico codice e un'unica infrastruttura servono più palestre, ciascuna con il proprio marchio, dominio, utenti e dati isolati. **Oasi Metropolitana** (Modena) è il primo tenant.

| Cartella | Contenuto | Stato |
| --- | --- | --- |
| [`apps/web`](apps/web) | Web App / PWA React + TypeScript + Vite + Tailwind | Completa in modalità demo; white-label da configurazione; collegamento alle API in corso |
| [`apps/api`](apps/api) | API ASP.NET Core (.NET 10) multi-tenant | Core, calendario, presenze, iscrizioni, recuperi, figure, progressi, eventi, inviti, Super Admin — 24 test |
| [`db`](db) | Migrazioni PostgreSQL/Supabase con Row Level Security, seed, test di isolamento | Pronto |
| `native` | App iOS/Android con Capacitor | Da fare (fase 7 del piano) |

Documenti di progetto (claude.ai): analisi dello stato iniziale e architettura con piano di migrazione.

## Avvio rapido della Web App (demo, senza backend)

Requisiti: Node.js 20+.

```bash
cd apps/web
npm install
npm run dev        # http://localhost:5173
```

In modalità demo i dati sono locali (localStorage); dal selettore del ruolo si può provare l'anteprima di un secondo marchio.

Per usare le API: creare `apps/web/.env.local` con

```
VITE_DATA_SOURCE=api
VITE_API_URL=http://localhost:5080
```

## Backend in locale

```bash
db/local/reset.sh --seed                         # PostgreSQL 16 locale: migrazioni + tenant demo
cd apps/api && dotnet run --project src/Oasi.Api # API su http://localhost:5080 (vedi launchSettings)
PGHOST=/tmp PGPORT=5433 dotnet test              # test di integrazione e isolamento
```

Dettagli in [`db/README.md`](db/README.md) e [`apps/api/README.md`](apps/api/README.md).

## Pubblicazione

### Web App su Cloudflare Pages

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, repository `davedegrado/Oasi`.
2. Impostazioni:
   - **Root directory:** `apps/web`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - Variabile `NODE_VERSION` = `22` (e, quando il backend è attivo, `VITE_DATA_SOURCE=api`, `VITE_API_URL=https://api.<dominio-piattaforma>`)
3. Ogni dominio di palestra va aggiunto come dominio personalizzato del progetto Pages e registrato nel pannello Super Admin.

### API su Railway e database su Supabase

1. Supabase (regione UE): applicare `db/migrations/*.sql`, impostare la password del ruolo `oasi_api`, configurare SMTP (Resend).
2. Railway: nuovo servizio dal repository con root `apps/api`, variabili `ConnectionStrings__Oasi`, `Auth__SupabaseUrl`, `Email__ResendApiKey`, `Email__From`.

## CI

`.github/workflows/ci.yml` esegue a ogni push: lint e build della Web App, migrazioni su PostgreSQL, test di isolamento SQL e test di integrazione dell'API.
