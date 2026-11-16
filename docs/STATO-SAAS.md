# Piattaforma SaaS multi-tenant · stato del lavoro

Riepilogo di ciò che è stato fatto a partire dal documento «Prompt per Claude · Evoluzione del progetto Oasi», che cosa è verificato da test e che cosa resta da decidere o da fare.

Legenda: **API** = regola applicata dal backend con persistenza e autorizzazione, coperta da test · **Demo** = presente nella Web App dimostrativa (dati nel browser) · **No** = non realizzato.

## 1. Cosa c'è, punto per punto

| § | Richiesta | API | Demo | Note |
| --- | --- | --- | --- | --- |
| 1 | Un'app, un backend, un database, isolamento tra tenant | Sì | — | RLS forzata su tutte le tabelle `app.*` (controllo automatico nel test 16 di `db/tests/isolation.sql`), chiavi esterne composte con `tenant_id` |
| 1 | Configurazioni per tenant senza eccezioni nel codice | Sì | Sì | Fuso orario, soglie, regole dei recuperi, agonismo, documenti: `GET/PUT /v1/settings` |
| 2 | Calendario con vista iniziale settimanale, giorni non ripetuti | — | Sì | La barra dei giorni è l'unico punto in cui compaiono; legenda ridotta |
| 2 | Tema per tenant | Già presente | Già presente | La palette di Oasi è la configurazione di quel tenant |
| 3 | Genitore: solo i figli collegati | Sì | No | `GET /v1/members/children`; nella demo manca il ruolo genitore |
| 3 | Agonista / non agonista, certificato obbligatorio solo quando previsto | Sì | Sì | Verificato lato server: l'iscrizione a una classe agonistica è bloccata senza certificato approvato e valido |
| 3 | Badge AGONISTA per staff | Sì | Sì | `competitiveBadge` su persone ed elenchi di lezione |
| 3 | Foto del profilo | Sì | Già presente | `POST/GET /v1/members/{id}/avatar` |
| 4 | Recupero solo con assenza valida e diritto residuo | Sì | Sì | Tabella `makeup_credits`; disponibili, impegnati, utilizzati, scaduti e storico |
| 4 | Recupero entro la validità del piano | Sì | No | Il diritto scade con il piano collegato all'iscrizione (o con la stagione) |
| 4 | Stesso livello o inferiore, mai superiore | Sì | Sì | Livello inferiore attivabile dall'amministrazione |
| 4 | Controllo posti atomico | Sì | Parziale | Blocco della riga della classe: test con due richieste simultanee per l'ultimo posto |
| 4 | Soglie di prenotazione e disdetta configurabili (48 h e 6 h sono i valori di Oasi) | Sì | Solo impostazione | Eccezioni dell'amministrazione registrate nell'audit; disdetta tardiva secondo regola della struttura |
| 4 | Fuso orario del tenant e cambi d'ora | Sì | — | Nessun endpoint usa più l'ora del server |
| 4 | Lezioni singole | Sì | No | `POST/DELETE /v1/bookings` |
| 5 | Home con il prossimo saggio o evento principale | Sì | Sì | `GET /v1/events/next` |
| 5 | Eventi gestiti dall'amministrazione, collegati a classi/discipline/insegnanti, con notifiche | Sì | Parziale | Notifica solo agli interessati e solo se cambiano data, ora o luogo |
| 5 | Brani musicali delle performance (solo nomi) | Sì | Sì | Un insegnante li associa solo alle proprie classi |
| 6 | Documenti degli insegnanti flessibili | Sì | Parziale | Tipologie per destinatario, richieste puntuali con termine, scadenza obbligatoria solo se configurata |
| 6 | Scadenza inserita e correggibile | Sì | No | Corretta dall'interessato → torna in verifica; dall'amministrazione → resta approvata |
| 6 | Stati: in attesa, approvato, da correggere, scaduto | Sì | Già presente | Campo `state` |
| 6 | Notifiche senza duplicati, con storico | Sì | — | Tabella `reminder_log` |
| 7 | Classi con una o più discipline dall'archivio esistente | Sì | Sì | Nessun limite fisso |
| 7 | Blocco iscrizioni e recuperi a capienza raggiunta | Sì | Sì | |
| 7 | Regolamento in Gestione → Associazione | Già presente | Sì | |
| 7 | Scheda allievo: tessera, certificati, quote, pagamenti | Sì | Sì | |
| 7 | Riepilogo presenze compatto, assenze ricorrenti | Sì | No | `GET /v1/classes/{id}/attendance-summary` (assenze consecutive) |
| 7 | Download singolo, di una persona, di gruppi filtrati | Sì | No | `GET /v1/documents/export` (zip), registrato nello storico e nell'audit |
| 8 | Documento sostituito: disponibile al massimo 7 giorni, poi eliminato dallo storage | Sì | No | Resta l'evento di audit, non il contenuto |
| 8 | Nessuna firma elettronica dichiarata | Già presente | Già presente | |
| 9 | Motore dei piani configurabile (annuali, mensili, periodici, rate, pacchetti, semiprivate) | Sì | Sì | Le rate sono quote dello stesso piano |
| 9 | Pacchetti a ingressi con saldo, scadenza e disponibilità | Sì | No | |
| 9 | Stagioni, periodi, chiusure, storico | Sì | Sola lettura | La nuova stagione copia i piani disattivati e senza date |
| 9 | Pagamenti esterni all'app: solo registrazione | Sì | Sì | Nessun gateway; nessun dato bancario o di carta |
| 9 | Riepiloghi: scadenze, insoluti, documenti mancanti; promemoria nuova stagione | Sì | Parziale | `GET /v1/reports/overview` |
| 10 | Configurazione iniziale Oasi 2026/27 come dati del tenant | Sì | Sì | `db/seed/0110_oasi_stagione_2026_27.sql` |
| 11 | Notifiche interne con collegamento alla schermata, preferenze | Sì | Già presente | Le **push** native e l'invio email non sono collegati a un servizio reale |
| 12 | Super Admin distinto, senza accesso indiscriminato | Già presente | — | |
| 12 | App iOS e Android per tenant | No | No | Fuori da questo ciclo |
| 13 | Test | 46 test API + 19 controlli SQL | Nessun test automatico | Vedi sotto |

## 2. Verifiche eseguite

- `dotnet test` in `apps/api`: **46 test superati** (30 preesistenti + 16 nuovi in `SaasTests.cs`).
- `db/tests/isolation.sql`: **19 controlli superati** (4 nuovi: RLS su tutte le tabelle, piani e quote isolati, piano di un altro tenant rifiutato, impostazioni distinte per tenant).
- Web App: `npm run lint` e `npm run build` senza errori; apertura delle pagine principali con i tre ruoli in un browser, senza errori in console. **Nessun test automatico sull'interfaccia.**

Casi coperti dai test dell'API: iscrizioni con posti e classi piene; recuperi senza assenza, con assenza valida, tardiva o ritirata, esauriti, scaduti, in livello superiore e inferiore, in lezioni piene e con richieste simultanee; prenotazioni e disdette alle soglie configurate, eccezioni dell'amministrazione; piani in unica soluzione e a rate, pagamenti parziali, eccedenti e non autorizzati; pacchetti esauriti, scaduti, di un'altra persona, non adatti per durata o età; periodi, chiusure, cambio di stagione e promemoria; minori con genitore, agonisti e non, certificato mancante, in verifica e scaduto; permessi per ruolo e isolamento tra tenant; documenti approvati, da correggere, scaduti, sostituiti ed eliminati dallo storage dopo 7 giorni; brani delle performance; notifiche non duplicate; cambio d'ora.

Non coperti da test: prestazioni, accessibilità, comportamento responsive (verificato solo a vista su due larghezze), invio email e push.

## 3. Limite più importante: la Web App non usa ancora l'API

La Web App funziona con dati dimostrativi salvati nel browser. Le regole elencate come «API» sono vere e verificate nel backend; quelle elencate come «Demo» riproducono lo stesso comportamento nell'interfaccia ma **non sono collegate al backend**. Il collegamento (accesso con Supabase, implementazione di `OasiRepository` verso l'API, ruolo genitore) è il prossimo passo e non è stato iniziato.

## 4. Decisioni da confermare

Sono state fatte scelte ragionevoli e modificabili dalle impostazioni; vanno confermate prima dell'uso reale.

1. **Che cos'è un'assenza «valida»** per il recupero. Ora: assenza annunciata entro la soglia di disdetta (`makeups.creditOn = declared_in_time`). Alternativa già disponibile: qualsiasi assenza registrata (`any_absence`).
2. **Disdetta tardiva**: ora consuma l'ingresso e lascia dovuta la lezione singola (`booking.lateCancelConsumesEntry`).
3. **Numero massimo di recuperi per piano**: ora nessun limite (`makeups.maxPerPlan`).
4. **Recupero solo nella stessa disciplina**: ora no (`makeups.sameDisciplineOnly`).
5. **Recuperi senza piano collegato**: scadono con la stagione attiva; senza stagione attiva non nascono.
6. **Promemoria nuova stagione**: 60 giorni prima della fine, se manca una stagione in bozza.

## 5. Incongruenze nei dati della stagione 2026/27 (segnalate, non corrette)

1. Lezione singola e pacchetto 5 lezioni valgono dal **14/09/2026**, ma stagione e periodi iniziano il **15/09/2026**. Il controllo `GET /v1/seasons/{id}/check` lo segnala.
2. Le date delle due rate sono indicate solo per Baby/Teen con 1 frequenza: sono state usate anche per 2 e 3 frequenze e per Genitori & Figli.
3. «Circo Baby: validi in uno dei due periodi stagionali»: i due periodi sono stati intesi come quelli delle due rate (15/09–24/01 e 25/01–30/05), cioè due pacchetti configurati.
4. Il pacchetto 5 lezioni copre lezioni da 60 o 75 minuti; le classi dimostrative durano 90 minuti e non sono coperte.
5. Le quote gara (50–150 €) sono indicative: sono salvate come intervallo informativo e si registrano come quote manuali.
6. Tessera: l'importo dipende dall'età (22 € fino a 15 anni, 27 € dai 16); sono due piani e la scelta è dell'amministrazione.

## 6. Non realizzato

- Collegamento della Web App all'API e accesso reale degli utenti.
- Ruolo genitore, lezioni singole, pacchetti e richieste di documenti nella Web App.
- Notifiche push e invio email verso servizi reali; lo storage Supabase non è mai stato provato contro un progetto reale.
- App iOS e Android.
- Modifica di stagioni e periodi dall'interfaccia (l'API c'è).
- Test automatici dell'interfaccia.
- Lo script `apps/web/scripts/export-demo-seed.ts` non esporta i nuovi campi: `db/seed/0100_…` non va rigenerato finché non viene aggiornato.

## 7. Modifiche al database

Migrazioni `0008` e `0009` (solo aggiunte, tranne due cambi):

- `app.member_payments.gateway_ref` **eliminata** e modalità di pagamento ridotte a contanti, bonifico, POS, altro (nessun incasso online).
- `app.documents.file_path` torna facoltativa: diventa vuota quando il file sostituito viene eliminato.

Nuove tabelle: `class_disciplines`, `document_requests`, `reminder_log`, `notification_preferences`, `seasons`, `season_periods`, `plan_installments`, `member_plans`, `makeup_credits`, `lesson_bookings`, `event_links`, `event_tracks`.

## 8. Comportamenti cambiati rispetto a prima

- Un recupero richiede ora un diritto residuo: senza un'assenza valida la richiesta è rifiutata.
- La richiesta di recupero occupa subito il posto (prima lo occupava solo dopo l'approvazione).
- Creare e modificare eventi è riservato all'amministrazione (prima anche agli insegnanti).
- Una richiesta di iscrizione a una classe già piena è rifiutata subito.
- Senza date, `GET /v1/lessons` restituisce la settimana corrente (prima 14 giorni da oggi).
