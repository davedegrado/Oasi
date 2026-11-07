# Oasi Metropolitana · Webapp danza aerea (demo)

Demo navigabile della webapp di **Oasi Metropolitana**, associazione sportiva di Modena specializzata in danza aerea (cerchio aereo e tessuti aerei).

È pensata per essere mostrata direttamente da smartphone tramite un semplice URL: **non richiede backend né servizi esterni**. Tutti i dati sono dimostrativi e le modifiche vengono salvate nel browser (`localStorage`).

## Funzionalità

Dalla schermata iniziale si sceglie una delle tre modalità demo (nessuna autenticazione reale). Il ruolo si può cambiare in qualsiasi momento dal pulsante in alto a destra (mobile) o in basso nella sidebar (desktop), dove si trovano anche “Ripristina dati demo” e il selettore della persona impersonata.

| Area | Schermate |
|---|---|
| **Allieva** | Home (prossima lezione, comunicazioni, eventi con adesione, ultimi progressi) · Calendario settimanale/giornaliero con lezioni annullate e variate · Archivio figure con filtri e sequenza fotografica sfogliabile · Stato personale e note per ogni figura · Dashboard progressi · Profilo con presenze, obiettivi e area amministrativa |
| **Insegnante** | Dashboard (allieve, prossime lezioni, presenze previste, figure recenti, allieve al lavoro) · Lezioni: registro presenze, variazione orario, annullamento, storico · Allieve e percorso individuale · Archivio figure: creazione/modifica, sequenza immagini con upload simulato · Profilo |
| **Amministratore** | Dashboard · Utenti con ricerca, filtri e modifica iscrizione · Classi (crea/modifica, iscritte e disponibilità) · Archivio figure · Eventi (crea/modifica, adesioni) · Gestione (associazione, insegnanti, discipline, configurazioni, esporta/ripristina dati) |

I dati sono **condivisi tra le aree**: una presenza segnata dall’insegnante appare nello storico dell’allieva, uno stato o una nota cambiati dall’allieva sono visibili all’insegnante, un evento creato dall’amministrazione compare nella Home delle allieve.

## Tecnologie

React 19 · TypeScript · Vite · Tailwind CSS v4 · componenti in stile shadcn/ui (Radix Dialog, class-variance-authority) · Lucide React · React Router · vite-plugin-pwa. Font Nunito e Inter inclusi localmente (Fontsource).

## Avvio in locale

Requisiti: Node.js 20 o superiore.

```bash
npm install      # installa le dipendenze
npm run dev      # avvia il server di sviluppo su http://localhost:5173
```

Altri comandi:

```bash
npm run build    # type-check + build di produzione in dist/
npm run preview  # serve la build di produzione su http://localhost:4173
npm run lint     # lint con oxlint
```

Per provarla da smartphone sulla stessa rete Wi‑Fi: `npm run dev -- --host` e apri l’indirizzo “Network” mostrato nel terminale.

## Pubblicazione su Cloudflare Pages (tramite GitHub)

1. Su [dash.cloudflare.com](https://dash.cloudflare.com) apri **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorizza GitHub e seleziona questo repository e il branch da pubblicare.
3. Impostazioni di build:
   - **Framework preset:** `Vite` (oppure “None”)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Variabile d’ambiente** (consigliata): `NODE_VERSION` = `22`
4. **Save and Deploy**. Ogni push sul branch genera un nuovo deploy; gli altri branch ottengono un URL di anteprima.

Il file `public/_redirects` gestisce il routing della single page app (gli URL come `/allieva/figure` funzionano anche se ricaricati) e `public/_headers` evita che il service worker resti in cache.

## PWA

- Manifest con nome **Oasi Metropolitana**, nome breve **Oasi**, theme color rosa `#E9A4C0`, icone standard e maskable.
- Installabile su Android (“Aggiungi a schermata Home” / banner di installazione) e iOS (Safari → Condividi → “Aggiungi alla schermata Home”), con icona Apple e splash screen iOS per i principali iPhone e iPad.
- Aggiornamenti: quando viene pubblicata una nuova versione compare il messaggio “È disponibile una nuova versione” con il pulsante **Aggiorna**.
- Funzionamento offline volutamente limitato al solo guscio dell’app (nessuna sincronizzazione offline in questa fase).

## Struttura del codice

```
src/
├── components/
│   ├── ui/           # componenti base stile shadcn (button, card, dialog, input…)
│   ├── layout/       # AppShell (sidebar + navigazione inferiore), selettore ruolo, guard, avviso aggiornamenti
│   ├── common/       # logo, decorazioni, grafici, badge, header di pagina
│   ├── calendar/     # calendario settimanale/giornaliero
│   ├── figures/      # archivio, scheda figura, galleria a passaggi, pannello progressi
│   ├── lessons/ events/ students/
├── pages/            # auth, student, teacher, admin, shared
├── data/             # dati dimostrativi (persone, classi, figure, eventi) e generatore seed
├── services/         # livello dati: interfaccia repository, implementazione locale, selettori
├── hooks/            # useDatabase, useDemo, useToast
├── context/          # ruolo demo e notifiche
├── lib/              # utility, date, etichette, compressione immagini
└── types/            # tipi TypeScript del dominio
```

### Livello dati sostituibile

I componenti non leggono mai direttamente i dati demo né `localStorage`: usano lo snapshot restituito da `useDatabase()` e i metodi di `OasiRepository` (`src/services/repository.ts`). L’implementazione attuale è `LocalRepository` (`src/services/localRepository.ts`). Per passare a Supabase basterà creare una nuova implementazione dell’interfaccia e sostituirla in `src/services/index.ts`, senza riscrivere le pagine.

## Note sulla demo

- Nomi di allieve e insegnanti sono di fantasia. Indirizzo e contatti dell’associazione sono quelli pubblici del sito ufficiale.
- Le fotografie sono immagini Creative Commons di riferimento (vedi `public/images/CREDITS.md`) e andranno sostituite con le foto reali delle figure eseguite in sala.
- Il calendario si genera attorno alla data corrente, così la demo resta sempre attuale.
- L’upload delle immagini è simulato: le foto vengono compresse e salvate solo nel browser.
