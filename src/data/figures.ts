import type { Figure } from '@/types'

import { photo } from '@/lib/assets'

type FigureSeed = Omit<Figure, 'steps' | 'cover' | 'createdAt'> & {
  cover: string
  steps: [string, string][]
  createdDaysAgo: number
}

/**
 * Archivio figure dimostrativo.
 * Le fotografie sono immagini Creative Commons (vedi public/images/CREDITS.md)
 * usate a scopo illustrativo: nella versione reale verranno sostituite
 * dalle foto scattate in sala dalle insegnanti.
 */
export const demoFigureSeeds: FigureSeed[] = [
  // ───────────────────────── CERCHIO ─────────────────────────
  {
    id: 'fig-seduta',
    name: 'Seduta base',
    discipline: 'cerchio',
    level: 'base',
    difficulty: 1,
    teacherId: 'tch-chiara',
    cover: 'cerchio-03',
    steps: [
      ['cerchio-04', 'Presa alla barra superiore, braccia tese e scapole attive'],
      ['cerchio-03', 'Raccolta delle ginocchia e passaggio delle gambe nel cerchio'],
      ['cerchio-24', 'Seduta sulla barra inferiore con schiena lunga'],
    ],
    description:
      'La posizione di partenza di quasi tutte le figure sopra la barra. Si sale dal basso con una raccolta controllata delle gambe e ci si siede sulla barra inferiore, mantenendo il busto allineato e le mani sui lati del cerchio.',
    attentionPoints: [
      'Scapole depresse: non “appendersi” alle spalle',
      'Sedersi al centro della barra per non far ruotare il cerchio',
      'Espirare durante la raccolta delle ginocchia',
    ],
    prerequisites: ['Appeso attivo di 10 secondi', 'Raccolta delle ginocchia al petto'],
    createdDaysAgo: 120,
  },
  {
    id: 'fig-man-in-the-moon',
    name: 'Man in the Moon',
    discipline: 'cerchio',
    level: 'base',
    difficulty: 2,
    teacherId: 'tch-chiara',
    cover: 'cerchio-12',
    steps: [
      ['cerchio-11', 'Dalla seduta, una mano scivola lungo il lato del cerchio'],
      ['cerchio-12', 'Schiena appoggiata a un lato, piedi spinti contro il lato opposto'],
      ['cerchio-06', 'Apertura del braccio libero e sguardo verso l’esterno'],
    ],
    description:
      'Figura iconica del cerchio: il corpo si incastra in diagonale dentro il cerchio, con la schiena contro un lato e i piedi a spingere sull’altro. La tensione tra schiena e piedi crea la stabilità che permette di liberare le braccia.',
    attentionPoints: [
      'Spingere attivamente con i piedi: la figura vive di contrasto',
      'Bacino in avanti, non lasciarlo cadere sulla barra',
      'Collo lungo, spalle lontane dalle orecchie',
    ],
    prerequisites: ['Seduta base', 'Salita in autonomia'],
    createdDaysAgo: 110,
  },
  {
    id: 'fig-birds-nest',
    name: 'Bird’s Nest',
    discipline: 'cerchio',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-chiara',
    cover: 'cerchio-05',
    steps: [
      ['cerchio-01', 'Inversione sotto la barra con gambe raccolte'],
      ['cerchio-05', 'Piedi agganciati alla barra, apertura del petto con assistenza'],
      ['cerchio-02', 'Arco completo: petto verso il basso e sguardo avanti'],
    ],
    description:
      'Il “nido d’uccello”: in sospensione sotto la barra, mani e piedi agganciati, il corpo si apre in un arco con il petto rivolto verso il pavimento. Si lavora inizialmente con l’assistenza dell’insegnante.',
    attentionPoints: [
      'Piedi a martello sulla barra per una presa sicura',
      'Aprire dalle spalle, non solo dalla zona lombare',
      'Uscire sempre in modo controllato tornando in raccolta',
    ],
    prerequisites: ['Inversione controllata', 'Mobilità delle spalle', 'Seduta base'],
    createdDaysAgo: 95,
  },
  {
    id: 'fig-mermaid',
    name: 'Mermaid',
    discipline: 'cerchio',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-chiara',
    cover: 'cerchio-16',
    steps: [
      ['cerchio-18', 'Aggancio del ginocchio alla barra inferiore'],
      ['cerchio-16', 'Mano opposta alla corda, busto che si apre di lato'],
      ['cerchio-17', 'Allungamento della gamba libera verso l’esterno'],
    ],
    description:
      'La “sirena”: appese con un ginocchio sulla barra inferiore e una mano sul lato, si allunga il corpo all’esterno del cerchio disegnando una linea morbida dalla mano al piede.',
    attentionPoints: [
      'Ginocchio ben incastrato prima di aprire',
      'Fianco attivo, evitare di collassare sul lato',
      'Gamba libera lunga con punta attiva',
    ],
    prerequisites: ['Man in the Moon', 'Aggancio di ginocchio sicuro'],
    createdDaysAgo: 80,
  },
  {
    id: 'fig-gazelle',
    name: 'Gazelle',
    discipline: 'cerchio',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-chiara',
    cover: 'cerchio-17',
    steps: [
      ['cerchio-15', 'Da sotto la barra, un ginocchio aggancia la barra inferiore'],
      ['cerchio-17', 'Corpo orizzontale fuori dal cerchio, braccia tese'],
      ['cerchio-14', 'Gamba libera piegata in “gazzella” e sguardo avanti'],
    ],
    description:
      'Figura elegante sotto la barra: il corpo esce dal cerchio in posizione quasi orizzontale, sostenuto da una gamba agganciata e dalle mani, mentre la gamba libera si piega dietro come in un salto di gazzella.',
    attentionPoints: [
      'Spingere la barra lontano con le mani per allungare il busto',
      'Ginocchio agganciato attivo per tutta la figura',
      'Collo in linea con la colonna',
    ],
    prerequisites: ['Mermaid', 'Hip hang stabile'],
    createdDaysAgo: 60,
  },
  {
    id: 'fig-amazon',
    name: 'Amazon',
    discipline: 'cerchio',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-valentina',
    cover: 'cerchio-14',
    steps: [
      ['cerchio-13', 'Seduta laterale sulla barra con la gamba interna agganciata'],
      ['cerchio-14', 'Busto che cade all’indietro in arco controllato'],
      ['cerchio-19', 'Apertura delle braccia e allungamento della gamba esterna'],
    ],
    description:
      'Figura di grande impatto scenico in cui il corpo si apre all’indietro da una seduta laterale, sostenuto dalla gamba agganciata alla barra. Richiede controllo della zona addominale e una buona apertura delle anche.',
    attentionPoints: [
      'Aggancio della gamba saldo prima di andare indietro',
      'Scendere vertebra per vertebra, senza “cadere”',
      'Tenere il core attivo per la risalita',
    ],
    prerequisites: ['Seduta base', 'Mermaid'],
    createdDaysAgo: 45,
  },
  {
    id: 'fig-delilah',
    name: 'Delilah',
    discipline: 'cerchio',
    level: 'avanzato',
    difficulty: 4,
    teacherId: 'tch-valentina',
    cover: 'cerchio-22',
    steps: [
      ['cerchio-09', 'Inversione completa sotto la barra'],
      ['cerchio-10', 'Gamba interna agganciata, la gamba esterna si apre'],
      ['cerchio-22', 'Spaccata frontale a testa in giù, braccia aperte'],
    ],
    description:
      'Spaccata inversa sospesa sotto il cerchio: una gamba aggancia la barra superiore mentre l’altra si apre in avanti. È una figura avanzata che unisce flessibilità, forza di presa e fiducia nella propria posizione.',
    attentionPoints: [
      'Lavorare sempre con tappeto e assistenza le prime volte',
      'Anche squadrate durante l’apertura',
      'Mani pronte sul cerchio durante l’entrata e l’uscita',
    ],
    prerequisites: ['Gazelle', 'Spaccata a terra al 90%', 'Inversione controllata'],
    createdDaysAgo: 30,
  },
  {
    id: 'fig-spaccata-cerchio',
    name: 'Spaccata nel cerchio',
    discipline: 'cerchio',
    level: 'avanzato',
    difficulty: 4,
    teacherId: 'tch-valentina',
    cover: 'cerchio-19',
    steps: [
      ['cerchio-08', 'Appoggio della schiena al lato del cerchio'],
      ['cerchio-19', 'Gambe che scivolano lungo il cerchio fino alla spaccata'],
      ['cerchio-20', 'Linea finale con braccia in apertura scenica'],
    ],
    description:
      'Spaccata frontale eseguita all’interno o lungo il cerchio, spesso usata come momento culminante di una coreografia. Si costruisce con un lavoro costante di flessibilità a terra.',
    attentionPoints: [
      'Riscaldamento specifico di anche e ischiocrurali',
      'Bacino frontale, ginocchia rivolte verso l’alto',
      'Mai forzare l’apertura in aria oltre quella a terra',
    ],
    prerequisites: ['Delilah', 'Spaccata a terra completa'],
    createdDaysAgo: 12,
  },
  {
    id: 'fig-back-balance',
    name: 'Back Balance',
    discipline: 'cerchio',
    level: 'avanzato',
    difficulty: 5,
    teacherId: 'tch-valentina',
    cover: 'cerchio-21',
    steps: [
      ['cerchio-23', 'Presa della barra dietro la schiena da seduta'],
      ['cerchio-21', 'Ricerca del punto di equilibrio con la zona lombare'],
      ['cerchio-07', 'Rilascio progressivo delle mani'],
    ],
    description:
      'Equilibrio in appoggio sulla parte bassa della schiena, con il cerchio che diventa l’unico punto di contatto. Figura di grande controllo, da affrontare solo con solide basi e con l’insegnante vicino.',
    attentionPoints: [
      'Trovare il punto di equilibrio prima di lasciare le mani',
      'Sguardo fisso per stabilizzare',
      'Cerchio fermo: chiedere a una compagna di stabilizzarlo',
    ],
    prerequisites: ['Amazon', 'Seduta base', 'Ottimo controllo del core'],
    createdDaysAgo: 5,
  },

  // ───────────────────────── TESSUTI ─────────────────────────
  {
    id: 'fig-foot-lock',
    name: 'Foot Lock',
    discipline: 'tessuti',
    level: 'base',
    difficulty: 1,
    teacherId: 'tch-elena',
    cover: 'tessuti-24',
    steps: [
      ['tessuti-22', 'Il tessuto passa all’esterno del piede, avvolgendo la caviglia'],
      ['tessuti-23', 'L’altro piede pesta il tessuto sul collo del piede'],
      ['tessuti-24', 'In piedi sulla chiave: braccia libere e postura aperta'],
    ],
    description:
      'La chiave di piede è la base di tutte le figure in piedi sui tessuti: il tessuto si avvolge attorno al piede e viene bloccato dall’altro piede, creando un appoggio stabile su cui stare in verticale.',
    attentionPoints: [
      'Avvolgimento dall’esterno verso l’interno',
      'Peso sul piede che blocca, non su quello avvolto',
      'Verificare sempre la chiave prima di liberare le mani',
    ],
    prerequisites: ['Presa base sul tessuto', 'Salita in raccolta'],
    createdDaysAgo: 115,
  },
  {
    id: 'fig-russian-climb',
    name: 'Russian Climb',
    discipline: 'tessuti',
    level: 'base',
    difficulty: 2,
    teacherId: 'tch-elena',
    cover: 'tessuti-28',
    steps: [
      ['tessuti-27', 'Il tessuto passa tra i piedi e si avvolge su un collo del piede'],
      ['tessuti-28', 'L’altro piede pinza il tessuto: spinta delle gambe'],
      ['tessuti-29', 'Si riallungano le braccia e si ripete la salita'],
    ],
    description:
      'Tecnica di arrampicata in cui il tessuto viene pinzato tra i piedi, permettendo di salire usando la spinta delle gambe e risparmiando le braccia.',
    attentionPoints: [
      'Ginocchia al petto prima di agganciare il tessuto',
      'Piede “a martello” per pinzare bene',
      'Braccia lunghe sopra la testa a ogni ripetizione',
    ],
    prerequisites: ['Foot Lock', 'Appeso attivo'],
    createdDaysAgo: 105,
  },
  {
    id: 'fig-inversione',
    name: 'Inversione base',
    discipline: 'tessuti',
    level: 'base',
    difficulty: 2,
    teacherId: 'tch-elena',
    cover: 'tessuti-03',
    steps: [
      ['tessuti-04', 'Presa alta, gambe raccolte e bacino che sale'],
      ['tessuti-03', 'Gambe che passano ai lati dei due tessuti'],
      ['tessuti-33', 'Posizione capovolta stabile con gambe aperte'],
    ],
    description:
      'Il primo capovolgimento in aria: partendo da una presa alta si raccolgono le gambe e si porta il bacino sopra la testa, con le gambe ai lati dei due tessuti.',
    attentionPoints: [
      'Lavorare a bassa quota finché non è automatica',
      'Spinta dalle braccia, non dal collo',
      'Gambe sempre in contatto con il tessuto',
    ],
    prerequisites: ['Raccolta ginocchia dall’appeso'],
    createdDaysAgo: 100,
  },
  {
    id: 'fig-hip-key',
    name: 'Hip Key',
    discipline: 'tessuti',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-elena',
    cover: 'tessuti-25',
    steps: [
      ['tessuti-26', 'Inversione con una gamba davanti al tessuto'],
      ['tessuti-25', 'Il bacino si avvolge: il tessuto passa sull’anca'],
      ['tessuti-10', 'Uscita in posizione verticale con chiave d’anca'],
    ],
    description:
      'La chiave d’anca blocca il corpo in modo sicuro grazie all’avvolgimento del tessuto attorno al bacino. È il punto di partenza di moltissime figure e cadute.',
    attentionPoints: [
      'Controllare quale gamba passa davanti al tessuto',
      'Ruotare dal bacino, non dalle spalle',
      'Sentire il tessuto ben teso sull’anca prima di aprire',
    ],
    prerequisites: ['Inversione base', 'Foot Lock'],
    createdDaysAgo: 85,
  },
  {
    id: 'fig-crochet',
    name: 'Crochet',
    discipline: 'tessuti',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-elena',
    cover: 'tessuti-12',
    steps: [
      ['tessuti-13', 'Avvolgimento della gamba nel tessuto a forma di uncino'],
      ['tessuti-14', 'Passaggio del tessuto dietro la schiena'],
      ['tessuti-12', 'Chiusura in posizione sospesa con busto aperto'],
    ],
    description:
      'Figura di avvolgimento in cui il tessuto si aggancia alla gamba come un uncino, creando un appoggio per aprire il busto in posizioni sospese.',
    attentionPoints: [
      'Ordine degli avvolgimenti sempre uguale',
      'Gamba agganciata in flessione attiva',
      'Ripassare la sequenza a terra prima di salire',
    ],
    prerequisites: ['Hip Key', 'Inversione base'],
    createdDaysAgo: 70,
  },
  {
    id: 'fig-angel',
    name: 'Angel',
    discipline: 'tessuti',
    level: 'intermedio',
    difficulty: 3,
    teacherId: 'tch-elena',
    cover: 'tessuti-08',
    steps: [
      ['tessuti-07', 'Ingresso dalla chiave d’anca con un tessuto dietro la schiena'],
      ['tessuti-08', 'Apertura frontale del corpo, braccia come ali'],
      ['tessuti-05', 'Respiro e uscita sorridente in sicurezza'],
    ],
    description:
      'L’angelo: il corpo si apre in avanti sostenuto dal tessuto che passa dietro la schiena e attorno a una gamba, con le braccia che si allargano come ali.',
    attentionPoints: [
      'Tessuto ben posizionato sotto le scapole',
      'Gambe attive per non scivolare',
      'Aprire le braccia solo quando la figura è stabile',
    ],
    prerequisites: ['Hip Key', 'Crochet'],
    createdDaysAgo: 50,
  },
  {
    id: 'fig-cross-back-straddle',
    name: 'Cross Back Straddle',
    discipline: 'tessuti',
    level: 'intermedio',
    difficulty: 4,
    teacherId: 'tch-valentina',
    cover: 'tessuti-09',
    steps: [
      ['tessuti-11', 'Dall’inversione i tessuti si incrociano dietro la schiena'],
      ['tessuti-09', 'Gambe aperte in straddle, il peso si distribuisce sulla schiena'],
      ['tessuti-15', 'Liberazione delle mani e linea finale'],
    ],
    description:
      'I due tessuti si incrociano dietro la schiena formando un’amaca sicura: da qui le gambe si aprono in straddle e le mani possono lasciare la presa.',
    attentionPoints: [
      'Incrocio all’altezza delle scapole, non della vita',
      'Gambe avvolte per bloccare il tessuto',
      'Rilasciare una mano alla volta',
    ],
    prerequisites: ['Inversione base', 'Hip Key'],
    createdDaysAgo: 35,
  },
  {
    id: 'fig-spaccata-tessuti',
    name: 'Spaccata sospesa',
    discipline: 'tessuti',
    level: 'avanzato',
    difficulty: 4,
    teacherId: 'tch-valentina',
    cover: 'tessuti-02',
    steps: [
      ['tessuti-01', 'Doppia chiave di piede e salita in quota'],
      ['tessuti-02', 'Apertura frontale con un tessuto per gamba'],
      ['tessuti-06', 'Allungamento del busto e braccio in linea'],
    ],
    description:
      'Spaccata frontale sostenuta dai due tessuti avvolti ai piedi. Figura di grande effetto scenico, richiede flessibilità completa e controllo della chiave.',
    attentionPoints: [
      'Chiavi di piede ben chiuse prima di aprire',
      'Bacino orientato in avanti',
      'Uscita sempre controllata, senza rimbalzi',
    ],
    prerequisites: ['Foot Lock', 'Spaccata a terra completa'],
    createdDaysAgo: 20,
  },
  {
    id: 'fig-star-drop',
    name: 'Star Drop',
    discipline: 'tessuti',
    level: 'avanzato',
    difficulty: 5,
    teacherId: 'tch-valentina',
    cover: 'tessuti-21',
    steps: [
      ['tessuti-16', 'Preparazione degli avvolgimenti in quota'],
      ['tessuti-17', 'Posizione a stella prima della caduta'],
      ['tessuti-21', 'Caduta controllata e arrivo in chiave'],
    ],
    description:
      'Prima caduta “a stella”: il corpo ruota srotolando gli avvolgimenti e si ferma in sicurezza grazie alla chiave finale. Si prova solo dopo aver verificato gli avvolgimenti con l’insegnante.',
    attentionPoints: [
      'Controllo degli avvolgimenti con l’insegnante prima di ogni caduta',
      'Corpo compatto durante la rotazione',
      'Mai provare da sole senza supervisione',
    ],
    prerequisites: ['Cross Back Straddle', 'Hip Key', 'Crochet'],
    createdDaysAgo: 8,
  },
]

export const demoPhotoLibrary: string[] = [
  ...Array.from({ length: 24 }, (_, i) => photo(`cerchio-${String(i + 1).padStart(2, '0')}`)),
  ...Array.from({ length: 35 }, (_, i) => photo(`tessuti-${String(i + 1).padStart(2, '0')}`)),
]

export { photo }
