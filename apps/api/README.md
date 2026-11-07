# API (ASP.NET Core)

Unica API per tutte le palestre. Ogni richiesta:

1. individua il tenant (header `X-Oasi-App` delle app native, `Origin`, `X-Forwarded-Host` o `Host`);
2. verifica il token Supabase;
3. verifica l'appartenenza attiva dell'utente a quel tenant e i ruoli;
4. verifica che il modulo dell'endpoint sia attivo per il tenant;
5. esegue le query in una transazione con `app.tenant_id` impostato (Row Level Security).

## Avvio locale

```bash
db/local/reset.sh --seed            # database locale (vedi db/README.md)
cd apps/api
dotnet run --project src/Oasi.Api   # usa appsettings.Development.json
```

## Test

```bash
PGHOST=/tmp PGPORT=5433 dotnet test
```

I test ricreano il database `oasi_test` e verificano isolamento tra due tenant, ruoli, moduli disattivati, iscrizioni con capienza, presenza dichiarata ed effettiva, recuperi, progressi a 3 stati, feedback, genitori, eventi, onboarding, sospensione dei tenant, accesso di assistenza e inviti senza account duplicati.

## Configurazione (variabili d'ambiente su Railway)

| Variabile | Descrizione |
| --- | --- |
| `ConnectionStrings__Oasi` | Connessione PostgreSQL con il ruolo `oasi_api` |
| `Auth__SupabaseUrl` | URL del progetto Supabase (verifica token con le chiavi JWKS) |
| `Auth__JwtSecret` | In alternativa: JWT secret legacy di Supabase |
| `Email__ResendApiKey`, `Email__From` | Invio email (inviti, notifiche) |
| `Cors__ExtraOrigins__0` | Origini aggiuntive consentite oltre ai domini registrati |

## Endpoint principali

| Area | Endpoint |
| --- | --- |
| Pubblico | `GET /v1/public/tenant-config`, `GET /v1/public/manifest.webmanifest` |
| Account | `GET /v1/me`, `POST /v1/invitations`, `POST /v1/invitations/accept`, `POST /v1/memberships/{userId}/revoke` |
| Classi | `GET/POST /v1/classes`, `PUT /v1/classes/{id}` |
| Calendario e presenze | `GET /v1/lessons?from&to&scope&memberId`, `PUT /v1/lessons/{id}`, `GET /v1/lessons/{id}/roster`, `PUT /v1/lessons/{id}/attendance/{memberId}`, `PUT /v1/lessons/{id}/declaration` |
| Iscrizioni | `GET/POST /v1/enrollments`, `POST /v1/enrollments/{id}/decision` |
| Recuperi | `GET/POST /v1/makeups`, `POST /v1/makeups/{id}/decision` |
| Archivio e progressi | `GET/POST /v1/figures`, `PUT/DELETE /v1/figures/{id}`, `GET /v1/progress`, `PUT /v1/progress/{figureId}`, `GET/POST /v1/feedback` |
| Eventi | `GET/POST /v1/events`, `PUT /v1/events/{id}`, `GET /v1/events/{id}/signups`, `POST/DELETE /v1/events/{id}/signup` |
| Super Admin | `/v1/platform/tenants`, `/usage`, `/plans`, `/modules`, `/tenants/{id}/status`, `/tenants/{id}/modules/{key}`, `/tenants/{id}/domains`, `/support-grants`, `/audit` |
| Assistenza (lato palestra) | `GET /v1/support-grants`, `POST /v1/support-grants/{id}/approve` |
