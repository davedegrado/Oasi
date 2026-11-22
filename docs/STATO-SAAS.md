# DY DYNAMITE · stato del lavoro

Riferimento: «Prompt per Claude · Aggiornamento della piattaforma Oasi Metropolitana e consolidamento dell'architettura SaaS DY DYNAMITE».
Del prompt precedente («Oasi SaaS compatto») sono rimasti solo due principi: **ogni regola è configurabile per struttura**, e **i valori del prompt sono la configurazione di Oasi Metropolitana**, non valori della piattaforma.

Legenda: **API** = regola applicata dal backend con persistenza, permessi e test · **Demo** = visibile nella Web App dimostrativa (dati nel browser) · **No** = non realizzato.

## 1. Requisiti, punto per punto

| § | Requisito | API | Demo | Valore di Oasi / note |
| --- | --- | --- | --- | --- |
| 1 | Un backend e un database condivisi, isolamento tra strutture | Sì | — | RLS forzata su ogni tabella (test 16 di `db/tests/isolation.sql`) |
| 1 | Prezzi, date e regole configurabili per struttura e stagione | Sì | Sì | Impostazioni (`/v1/settings`), stagioni, listino |
| 2 | Palette bianco, nero, verde salvia e oro | Sì (tema del tenant) | Sì | Configurazione di Oasi; gli altri tenant mantengono la propria |
| 2 | Calendario con vista settimanale, giorni non ripetuti | — | Sì | |
| 3 | Atlete minorenni gestite dal genitore, solo i propri figli | Sì | No | Manca il ruolo genitore nella demo |
| 3 | Agonista/non agonista; certificato obbligatorio solo quando previsto, verificato dal server | Sì | Sì | Cerchio Avanzato è agonistica nella demo |
| 3 | Badge AGONISTA nel profilo e dove serve allo staff | Sì | Sì | Ora visibile anche all'atleta nel proprio profilo |
| 3 | Foto profilo e certificato agonistico | Sì | Parziale | |
| 4 | Recupero solo dopo un'assenza valida, contatore disponibili/utilizzati/residui con storico | Sì | Sì | |
| 4 | Finestra per chiedere un recupero: da N ore prima (massimo) a M ore prima (minimo), impostata dall'amministrazione | Sì | Sì | Oasi: nessun massimo, fino all'inizio (modificabile in Gestione → Associazione) |
| 4 | Recupero entro la validità del piano; classe propria o di livello inferiore, mai superiore | Sì | Sì | |
| 4 | Recuperi bloccati a classe piena, controllo atomico | Sì | Sì | |
| 4 | Lezioni singole **prenotabili a partire da 48 ore prima**, disdetta libera **fino a 6 ore prima** | Sì | Sì | Oasi: da 48 h a 0 h prima, disdetta 6 h; tutte modificabili dall'amministrazione |
| 4 | Fuso orario del tenant, cambi d'ora | Sì | — | Europe/Rome |
| 5 | Home con il prossimo saggio o evento principale | Sì | Sì | |
| 5 | Performance: canzone/musica, luogo, partecipanti nel rispetto dei permessi | Sì | Sì | File audio (fino a 25 MB) o collegamento; ascolto e partecipanti riservati a chi partecipa e allo staff |
| 5 | Eventi gestiti dall'amministrazione, consultati da insegnanti e atlete | Sì | Sì | Gli insegnanti non modificano più eventi né musica |
| 5 | Eventi collegabili a classi, discipline, insegnanti e partecipanti; notifiche | Sì | Parziale | |
| 6 | Presenze, note della lezione, **sostituzioni** | Sì | Sì | Chi sostituisce vede la lezione e compila le presenze |
| 6 | **Due documenti ogni 30 giorni, entro la fine del mese** | Sì | Sì | Una tipologia che ne chiede due al mese; l'insegnante dà a ciascuno un titolo libero e la scadenza, se c'è |
| 8 | Documenti senza tipologia definita | Sì | Sì | Titolo libero e scadenza facoltativa, per atlete e insegnanti |
| 6 | Stati in attesa / approvato / da correggere; notifiche senza duplicati | Sì | Sì | Le **push** non sono collegate a un servizio reale |
| 6 | Lezioni: prima il calendario, poi Prossime lezioni, Storico, Richieste per tipologia e stato | — | Sì | |
| 7 | Classi in **due aree: bambini/ragazzi e adulti/ragazzi**, categorie adattabili | Sì | Sì | Aree modificabili in Gestione |
| 7 | **Fino a due discipline** per classe dall'archivio esistente | Sì | Sì | Limite configurabile |
| 7 | Regolamento in Gestione → Associazione | Già presente | Sì | |
| 7 | Scheda atleta: tessera, certificati approvati, quote e pagamenti | Sì | Sì | |
| 7 | Riepilogo presenze compatto; download singolo, per atleta, per gruppi | Sì | Parziale | |
| 8 | Un documento, una sola copia; stati, revisore, note | Sì | Sì | |
| 8 | Caricamento di un documento firmato ≠ firma elettronica | Sì | Sì | Nessuna firma elettronica dichiarata |
| 8 | Consensi e informative (immagini, minorenni) | Tabella presente | Parziale | Nessun flusso completo |
| 9 | Motore piani configurabile: annuale, periodico, mensile, rate, lezioni singole, pacchetti, semiprivate | Sì | Sì | |
| 9 | Pacchetto: **un ingresso per ogni partecipazione effettiva**, saldo, scadenza | Sì | No | Ingresso consumato alla presenza; con assenza o disdetta tardiva secondo le regole di Oasi |
| 9 | Piano coerente con classe e frequenze settimanali | Sì | No | Categoria e classificazione agonistica del piano |
| 9 | Pagamenti **bonifico e contanti**, altri metodi in futuro, nessun dato sensibile | Sì | Sì | Metodi abilitabili in Gestione |
| 9 | Riepilogo per atleta e generale; promemoria annuale nuova stagione | Sì | Parziale | |
| 9 | Sospensioni di un piano | No | No | Non realizzato |
| 10 | Dati economici 2026/27 come configurazione di Oasi | Sì | Sì | `db/seed/0110_oasi_stagione_2026_27.sql` |
| 11 | Notifiche interne con collegamento, preferenze, storico | Sì | Parziale | Push ed email non collegate |
| 12 | Oasi tenant pilota di DY DYNAMITE, Super Admin distinto | Sì | — | |
| 12 | Database dedicati futuri per tenant grandi | Predisposto | — | Campo `dedicated_db_ref`, non usato |
| 12 | App iOS/Android | No | No | |

## 2. Cosa è cambiato rispetto al lavoro fatto sul prompt precedente

- **Lezioni singole:** la prenotazione ora *si apre* N ore prima (prima era "almeno N ore prima": significato opposto). Un piano può avere una sua finestra: Circo Baby chiude 24 ore prima.
- **Pacchetti:** l'ingresso si scala alla presenza registrata, non alla prenotazione. La prenotazione impegna il posto nel saldo.
- **Insegnanti:** al posto delle richieste libere, due documenti ricorrenti ogni mese entro l'ultimo giorno del mese. La tipologia inventata "Polizza assicurativa insegnante" è stata tolta dalla demo.
- **Classi:** aree e limite di due discipline (prima nessun limite).
- **Eventi:** musica e gestione riservate all'amministrazione; ora si può allegare il file audio o un collegamento, prima solo il titolo.
- **Pagamenti:** metodi configurabili; per Oasi solo bonifico e contanti.
- **Documenti sostituiti:** nessuna eliminazione automatica dopo 7 giorni (non richiesta); resta disponibile come impostazione facoltativa.
- **Valori predefiniti della piattaforma** resi neutri: i 48 h / 6 h, le aree e il limite di due discipline sono valori di Oasi.

## 3. Verifiche eseguite

- `dotnet test`: **53 test superati**, di cui 7 in `DynamiteTests.cs`.
- `db/tests/isolation.sql`: **19 controlli superati**.
- Web App: lint e build senza errori; pagine principali aperte in un browser con i tre ruoli, nessun errore in console. Nessun test automatico dell'interfaccia.

Casi coperti per il prompt corretto:
- **Prenotazioni:** lezione singola prenotata appena prima e appena dopo l'apertura della finestra, disdetta prima e dopo la soglia, termine di chiusura.
- **Pacchetti:** ingresso consumato alla presenza, presenza tolta e ripristinata, assenza, ultimo ingresso, saldo esaurito, pacchetto scaduto, disdetta in tempo o tardiva.
- **Documenti mensili:** due richieste al mese con termine a fine mese, notifica unica, caricamento, correzione richiesta, documento mancante segnalato all'amministrazione.
- **Classi:** tre discipline rifiutate, area non prevista rifiutata, coerenza piano–classe.
- **Sostituzioni:** chi può assegnarle, presenze compilate da chi sostituisce, annullamento.
- **Eventi:** musica gestita solo dall'amministrazione, ascolto e partecipanti riservati a chi partecipa.
- **Pagamenti:** metodo non accettato da Oasi rifiutato.

## 4. Punti che richiedono una decisione

1. **Finestra di Circo Baby:** applicata solo la regola "almeno 24 ore prima", senza l'apertura a 48 ore. Il pacchetto 5 lezioni invece segue l'apertura a 48 ore.
2. ~~I due documenti mensili degli insegnanti~~: risolto, l'insegnante dà a ciascuno un titolo libero.
3. **Pacchetto prenotato e atleta assente:** ora l'ingresso si consuma (`noShowConsumesEntry`). In alternativa si può restituire.
4. **Categorie dei piani:**
   - Baby/Teen, Circo Baby e Preagonismo → Bambini/Ragazzi;
   - Adulti/Teen → Adulti/Ragazzi;
   - Genitori & Figli e Agonismo Teen senza vincolo.
5. ~~"Atleta" o "allieva"~~: l'interfaccia ora dice "atleta" (i percorsi interni come `/allieva` restano invariati).
6. **Assenza "valida" per il recupero:** ora è quella annunciata entro la soglia di disdetta (6 ore per Oasi).
7. **Incongruenze dei dati 2026/27**, segnalate e non corrette:
   - lezione singola e pacchetto 5 lezioni valgono dal 14/09, la stagione inizia il 15/09;
   - date delle rate indicate solo per Baby/Teen 1 frequenza;
   - "due periodi stagionali" di Circo Baby intesi come quelli delle rate;
   - il pacchetto 5 lezioni non copre lezioni da 90 minuti.

## 5. Non realizzato

- Collegamento della Web App all'API e accesso reale degli utenti.
- Ruolo genitore e pacchetti a ingressi nella demo.
- Notifiche push ed email reali.
- Sospensioni dei piani.
- Flusso completo dei consensi.
- App native.
- Test automatici dell'interfaccia e verifiche di accessibilità e prestazioni.

## 6. Migrazioni

`0008`, `0009`, `0010`, `0011` vanno applicate in ordine. La `0011` rende facoltativa la tipologia dei documenti (titolo libero) e aggiunge la finestra dei recuperi.

 La `0010`:
- rinomina `fee_plans.booking_hours_before` in `booking_closes_hours_before`;
- toglie dalle impostazioni salvate la vecchia chiave `singleLessonBookHoursBefore`, perché aveva il significato opposto.
