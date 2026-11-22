# DY DYNAMITE · stato del lavoro

Riferimento: «Prompt per Claude · Aggiornamento della piattaforma Oasi Metropolitana e consolidamento dell'architettura SaaS DY DYNAMITE».
Del prompt precedente («Oasi SaaS compatto») sono rimasti solo due principi: **ogni regola è configurabile per struttura**, e **i valori del prompt sono la configurazione di Oasi Metropolitana**, non valori della piattaforma.

Legenda: **API** = regola applicata dal backend con persistenza, permessi e test · **Demo** = visibile nella Web App dimostrativa (dati nel browser) · **No** = non realizzato.

## 1. Requisiti, punto per punto

| § | Requisito | API | Demo | Valore di Oasi / note |
| --- | --- | --- | --- | --- |
| 1 | Un backend e un database condivisi, isolamento tra strutture | Sì | — | RLS forzata su ogni tabella (test 16 di `db/tests/isolation.sql`) |
| 1 | Prezzi e regole configurabili per struttura | Sì | Sì | Impostazioni (`/v1/settings`), listino dei piani |
| 2 | Palette bianco, nero, verde salvia e oro | Sì (tema del tenant) | Sì | Configurazione di Oasi; gli altri tenant mantengono la propria |
| 2 | Calendario con vista settimanale, giorni non ripetuti | — | Sì | |
| 3 | Atlete minorenni gestite dal genitore, solo i propri figli | Sì | No | Manca il ruolo genitore nella demo |
| 3 | Agonista/non agonista; certificato obbligatorio solo quando previsto, verificato dal server | Sì | Sì | L'atleta può dichiararsi agonista e caricare subito il certificato |
| 3 | Badge AGONISTA nel profilo e dove serve allo staff | Sì | Sì | Ora visibile anche all'atleta nel proprio profilo |
| 3 | Foto profilo e certificato agonistico | Sì | Parziale | |
| 4 | Recupero solo dopo un'assenza valida, contatore disponibili/utilizzati/residui con storico | Sì | Sì | |
| 4 | Finestra per chiedere un recupero: da N ore prima (massimo) a M ore prima (minimo), impostata dall'amministrazione | Sì | Sì | Oasi: nessun massimo, fino all'inizio (modificabile in Gestione → Associazione) |
| 4 | Recupero entro la validità del piano; classe propria o di livello inferiore, mai superiore | Sì | Sì | |
| 4 | Recuperi bloccati a classe piena, controllo atomico | Sì | Sì | |
| 4 | Lezioni singole **prenotabili a partire da 48 ore prima**, disdetta libera **fino a 6 ore prima** | Sì | Sì | Oasi: da 48 h a 0 h prima, disdetta 6 h; tutte modificabili dall'amministrazione |
| 4 | Fuso orario del tenant, cambi d'ora | Sì | — | Europe/Rome |
| 5 | Home con il prossimo saggio o evento principale | Sì | Sì | |
| 5 | Performance: canzone/musica, luogo, partecipanti nel rispetto dei permessi | Sì | Sì | Gruppi organizzati da insegnanti e amministrazione, ciascuno con il titolo della sua canzone (nessun file audio); un'atleta può stare in più gruppi; gruppi e partecipanti visibili solo a chi partecipa e allo staff |
| 5 | Promemoria in home dell'evento a cui l'atleta partecipa (gara, saggio, spettacolo, workshop, stage) | Sì | Sì | Sotto la prossima lezione, con i suoi gruppi e le canzoni (`GET /v1/events/reminders`) |
| 5 | Eventi gestiti dall'amministrazione, consultati da insegnanti e atlete | Sì | Sì | Stessa vista per tutti; anche insegnanti e segreteria si segnano ("I miei") |
| 5 | Eventi collegabili a classi, discipline, insegnanti e partecipanti; notifiche | Sì | Parziale | |
| 6 | Presenze, note della lezione, **sostituzioni** | Sì | Sì | Chi sostituisce vede la lezione e compila le presenze |
| 6 | **Due documenti ogni 30 giorni, entro la fine del mese** | Sì | Sì | Una tipologia che ne chiede due al mese; l'insegnante dà a ciascuno un titolo libero e la scadenza |
| 8 | Documenti senza tipologia definita | Sì | Sì | Titolo libero e scadenza, per atlete e insegnanti |
| 6 | Stati in attesa / approvato / da correggere; notifiche senza duplicati | Sì | Sì | Le **push** non sono collegate a un servizio reale |
| 6 | Lezioni: prima il calendario, poi Prossime lezioni, Storico, Richieste per tipologia e stato | — | Sì | |
| 7 | Classi in **due aree: bambini/ragazzi e adulti/ragazzi**, categorie adattabili | Sì | Sì | Aree modificabili in Gestione |
| 7 | **Fino a due discipline** per classe dall'archivio esistente | Sì | Sì | Limite configurabile |
| 7 | Regolamento in Gestione → Associazione | Già presente | Sì | |
| 7 | Scheda atleta: tessera, certificati approvati, piani scelti | Sì | Sì | Nessun importo calcolato o registrato |
| 7 | Riepilogo presenze compatto; download singolo, per atleta, per gruppi, a selezione multipla | Sì | Sì | Più documenti: un unico ZIP senza ricompressione (PDF e foto sono già compressi) |
| 8 | Un documento, una sola copia; stati, revisore, note | Sì | Sì | |
| 8 | Data di scadenza obbligatoria in ogni documento | Sì | Sì | La decide la tipologia (Archivio → Tipologie; per Oasi tutte); i documenti liberi la chiedono sempre |
| 8 | Caricamento di un documento firmato ≠ firma elettronica | Sì | Sì | Nessuna firma elettronica dichiarata |
| 8 | Consensi e informative (immagini, minorenni) | Tabella presente | Parziale | Nessun flusso completo |
| 9 | Piani scritti dall'amministrazione (**Piani e listino**): prezzo, numero di lezioni, frequenza settimanale, validità in **mesi dalla sottoscrizione** o **periodo preciso**, aree delle classi | Sì | Sì | Prezzo solo informativo |
| 9 | **Il piano lo sceglie l'atleta** quando chiede l'iscrizione a una classe; parte quando l'iscrizione è accettata; l'atleta può rinnovarlo o cambiarlo | Sì | Sì | L'amministrazione non assegna piani; riceve un avviso |
| 9 | **Partecipazione automatica** (attesi a ogni lezione) oppure **"ci sarò"** a ogni lezione | Sì | Sì | "Ci sarò" con la finestra della palestra (Oasi: da 48 ore prima), ritiro libero fino a 6 ore prima |
| 9 | **Piano scaduto o lezioni finite: lezioni non disponibili** e atleta fuori dall'elenco | Sì | Sì | Lezioni consumate alla presenza o con assenza non disdetta; restituzione manuale dalla segreteria |
| 9 | Quote, rate, stagioni, pagamenti, metodi di pagamento | — | — | **Tolti** su richiesta: l'app non calcola né registra denaro |
| 9 | Riepilogo per l'amministrazione | Sì | Sì | Piani in scadenza e documenti mancanti |
| 9 | Sospensioni di un piano | No | No | Non realizzato |
| 10 | Listino 2026/27 come configurazione di Oasi | Sì | Sì | `db/seed/0110_oasi_configurazione_2026_27.sql` |
| 11 | Notifiche interne con collegamento, preferenze, storico | Sì | Parziale | Push ed email non collegate |
| 12 | Oasi tenant pilota di DY DYNAMITE, Super Admin distinto | Sì | — | |
| 12 | Database dedicati futuri per tenant grandi | Predisposto | — | Campo `dedicated_db_ref`, non usato |
| 12 | App iOS/Android | No | No | |

## 2. Cosa è cambiato rispetto al lavoro fatto sul prompt precedente

- **"Ci sarò" (ex lezioni singole):** si apre N ore prima (prima era "almeno N ore prima": significato opposto). Un piano può avere una sua finestra: Circo Baby chiude 24 ore prima.
- **Pacchetti:** l'ingresso si scala alla presenza registrata, non alla prenotazione. La prenotazione impegna il posto nel saldo.
- **Insegnanti:** al posto delle richieste libere, due documenti ricorrenti ogni mese entro l'ultimo giorno del mese. La tipologia inventata "Polizza assicurativa insegnante" è stata tolta dalla demo.
- **Classi:** aree e limite di due discipline (prima nessun limite).
- **Eventi:** gestione riservata all'amministrazione; i gruppi con la loro canzone (solo il titolo) li organizzano insegnanti e amministrazione. I "brani" con file audio e collegamenti sono stati tolti (migrazione `0016`: i titoli esistenti diventano gruppi).
- **Piani e soldi:** l'atleta sceglie il piano all'iscrizione; tolti quote, rate, stagioni, pagamenti e metodi di pagamento (migrazione `0017`).
- **Documenti sostituiti:** nessuna eliminazione automatica dopo 7 giorni (non richiesta); resta disponibile come impostazione facoltativa.
- **Valori predefiniti della piattaforma** resi neutri: i 48 h / 6 h, le aree e il limite di due discipline sono valori di Oasi.

## 3. Verifiche eseguite

- `dotnet test`: **53 test superati** (i test di stagioni, rate e pagamenti sono stati tolti con le funzioni).
- `db/tests/isolation.sql`: **19 controlli superati**.
- Web App: lint e build senza errori; pagine principali aperte in un browser con i tre ruoli, nessun errore in console. Nessun test automatico dell'interfaccia.

Casi coperti per il prompt corretto:
- **Prenotazioni:** lezione singola prenotata appena prima e appena dopo l'apertura della finestra, disdetta prima e dopo la soglia, termine di chiusura.
- **Pacchetti:** ingresso consumato alla presenza, presenza tolta e ripristinata, assenza, ultimo ingresso, saldo esaurito, pacchetto scaduto, disdetta in tempo o tardiva.
- **Documenti mensili:** due richieste al mese con termine a fine mese, notifica unica, caricamento, correzione richiesta, documento mancante segnalato all'amministrazione.
- **Classi:** tre discipline rifiutate, area non prevista rifiutata, coerenza piano–classe.
- **Sostituzioni:** chi può assegnarle, presenze compilate da chi sostituisce, annullamento.
- **Eventi:** gruppi gestiti da insegnanti e amministrazione, solo con partecipanti, atleta in più gruppi, uscita dai gruppi quando annulla l'adesione, promemoria, gruppi e partecipanti riservati a chi partecipa, nessun gruppo negli eventi sociali.
- **Piani:** scelta all'iscrizione e rinnovo, area e classificazione della classe, periodo terminato, validità in mesi e periodo, "ci sarò" con finestra e ritiro, lezioni finite, piano scaduto (lezione non disponibile), durata ed età, piani in scadenza nel riepilogo.

## 4. Punti che richiedono una decisione

1. **Finestra di Circo Baby:** "ci sarò" da 48 ore prima (valore della palestra) fino a 24 ore prima (valore del piano).
2. ~~I due documenti mensili degli insegnanti~~: risolto, l'insegnante dà a ciascuno un titolo libero.
3. ~~Pacchetto prenotato e atleta assente~~: deciso, l'ingresso si scala se non c'è disdetta; la segreteria può restituirlo a mano (`POST /v1/bookings/{id}/refund`, con motivo, notifica e audit).
4. **Categorie dei piani:**
   - Baby/Teen, Circo Baby e Preagonismo → Bambini/Ragazzi;
   - Adulti/Teen → Adulti/Ragazzi;
   - Genitori & Figli e Agonismo Teen senza vincolo.
5. ~~"Atleta" o "allieva"~~: l'interfaccia ora dice "atleta" (i percorsi interni come `/allieva` restano invariati).
6. **Assenza "valida" per il recupero:** ora è quella annunciata entro la soglia di disdetta (6 ore per Oasi).
7. **Dati 2026/27 da confermare:**
   - lezione singola valida un mese e pacchetto 5 lezioni tre mesi dalla sottoscrizione;
   - Circo Baby: un piano per ciascuno dei due periodi (15/09–24/01 e 25/01–30/05);
   - periodico Adulti/Teen: solo il periodo in corso (9/11–24/01), gli altri si aggiungono dal listino;
   - il pacchetto 5 lezioni non copre lezioni da 90 minuti;
   - la frequenza settimanale del piano è indicata ma non ancora verificata sul numero di classi.

## 5. Non realizzato

- Collegamento della Web App all'API e accesso reale degli utenti.
- Ruolo genitore nella demo.
- Notifiche push ed email reali.
- Sospensioni dei piani.
- Flusso completo dei consensi.
- App native.
- Test automatici dell'interfaccia e verifiche di accessibilità e prestazioni.

## 6. Migrazioni

`0008`–`0017` vanno applicate in ordine. La `0017` **elimina** quote, rate, pagamenti, stagioni e periodi (dati compresi), aggiunge validità e partecipazione automatica ai piani e il piano richiesto alle iscrizioni. La `0016` sostituisce i brani con i gruppi degli eventi: i file audio eventualmente già caricati restano nello storage e vanno rimossi a mano. La `0015` aggiungeva un'impostazione globale di scadenza, tolta dalla `0017`: ora decide la tipologia. La `0011` rende facoltativa la tipologia dei documenti (titolo libero) e aggiunge la finestra dei recuperi.

 La `0010`:
- rinomina `fee_plans.booking_hours_before` in `booking_closes_hours_before`;
- toglie dalle impostazioni salvate la vecchia chiave `singleLessonBookHoursBefore`, perché aveva il significato opposto.
