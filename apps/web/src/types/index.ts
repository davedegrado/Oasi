export type Role = 'allieva' | 'insegnante' | 'admin'

/** Identificativo (slug) di una disciplina configurata dalla palestra, es. "cerchio" */
export type Discipline = string

export type DisciplineIconName = 'circle' | 'wind' | 'sparkles' | 'music' | 'flower' | 'dumbbell' | 'star'

/** Disciplina: dato della palestra, non definita nel codice */
export interface DisciplineInfo {
  id: Discipline
  name: string
  shortName: string
  description: string
  color: string
  icon: DisciplineIconName
  hasFigureArchive: boolean
  isActive: boolean
}

export type Level = 'base' | 'intermedio' | 'avanzato'

/** Classificazione agonistica di una classe (configurabile dall'amministrazione) */
export type CompetitiveLevel = 'nessuna' | 'preagonistica' | 'agonistica'

/** Stati personali delle figure: "In apprendimento" è stato eliminato perché equivalente a "In progetto" */
export type LearningStatus = 'da_imparare' | 'in_progetto' | 'riuscita'

export type MembershipStatus = 'attiva' | 'in_scadenza' | 'sospesa' | 'prova'

export type AttendanceMark = 'presente' | 'assente'

export type LessonStatus = 'regolare' | 'annullata' | 'variata'

export interface Teacher {
  invitePending?: boolean
  id: string
  firstName: string
  lastName: string
  avatar: string
  disciplines: Discipline[]
  bio: string
  email: string
  phone: string
  since: number
}

export interface Membership {
  status: MembershipStatus
  cardNumber: string
  expiresAt: string
  medicalCertificateExpiresAt: string
  feePlan: string
  feePaidUntil: string
}

export interface Student {
  /** Invito inviato dall'amministrazione, non ancora accettato (simulazione) */
  invitePending?: boolean
  id: string
  firstName: string
  lastName: string
  avatar: string
  birthDate: string
  email: string
  phone: string
  level: Level
  mainDiscipline: Discipline
  classIds: string[]
  joinedAt: string
  goals: string[]
  membership: Membership
  /** Agonista per classificazione della persona (impostata dall'amministrazione) */
  competitive?: boolean
}

export interface ClassGroup {
  id: string
  name: string
  discipline: Discipline
  level: Level
  teacherId: string
  weekday: number // 1 = lunedì ... 7 = domenica
  startTime: string // HH:mm
  endTime: string
  room: string
  capacity: number
  studentIds: string[]
  description: string
  /** Altre discipline della classe, scelte dall'archivio della palestra (oltre alla principale) */
  extraDisciplines?: Discipline[]
  competitiveLevel?: CompetitiveLevel
  /** Area della classe tra quelle configurate dalla palestra (es. Bambini/Ragazzi, Adulti/Ragazzi) */
  category?: string
}

export interface Lesson {
  id: string
  classId: string
  date: string // YYYY-MM-DD
  startTime: string
  endTime: string
  status: LessonStatus
  note?: string
  originalStartTime?: string
  originalEndTime?: string
  /** Presenza effettiva registrata dall'insegnante */
  attendance: Record<string, AttendanceMark>
  /** Disdette: di default l'atleta è attesa; qui si registra solo chi non verrà */
  declarations?: Record<string, AttendanceMark>
  /** Lezione annullata da una chiusura della sede */
  closureId?: string
  /** Lezioni singole prenotate da atlete non iscritte alla classe */
  bookings?: string[]
  /** Insegnante che sostituisce quella della classe in questa lezione */
  substituteTeacherId?: string
  substitutionNote?: string
}

export interface FigureStep {
  id: string
  image: string
  caption: string
}

export interface Figure {
  id: string
  name: string
  discipline: Discipline
  level: Level
  difficulty: 1 | 2 | 3 | 4 | 5
  teacherId: string
  cover: string
  steps: FigureStep[]
  description: string
  attentionPoints: string[]
  prerequisites: string[]
  createdAt: string
}

export interface FigureProgress {
  status: LearningStatus
  note: string
  updatedAt: string
}

/** studentId -> figureId -> progresso */
export type ProgressMap = Record<string, Record<string, FigureProgress>>

export interface OasiEvent {
  id: string
  title: string
  type: EventType
  date: string
  startTime: string
  endTime: string
  location: string
  description: string
  image: string
  capacity: number
  participantIds: string[]
  /** Ultimo giorno utile per aderire (YYYY-MM-DD) */
  signupDeadline?: string
  /** Evento principale mostrato in home */
  featured?: boolean
  /** Classi collegate all'evento */
  classIds?: string[]
  /** Gruppi di partecipanti organizzati dagli insegnanti, ciascuno con la sua canzone */
  groups?: EventGroup[]
}

/** Gruppo di un evento: un atleta può stare in più gruppi dello stesso evento */
export interface EventGroup {
  id: string
  name: string
  /** Titolo della canzone (nessun file audio) */
  song: string
  memberIds: string[]
  /** id dell'insegnante o 'admin' */
  createdBy: string
}

export type EventType = 'workshop' | 'stage' | 'gara' | 'saggio' | 'spettacolo' | 'sociale'

export type RequestStatus = 'in_attesa' | 'approvata' | 'rifiutata'

/** Richiesta di iscrizione a una classe (decide l'insegnante della classe o l'amministrazione) */
export interface EnrollmentRequest {
  id: string
  classId: string
  studentId: string
  note: string
  status: RequestStatus
  createdAt: string
  decidedAt?: string
  decidedBy?: string
}

/** Richiesta di recupero su una lezione di un'altra classe */
export interface MakeupRequest {
  id: string
  studentId: string
  targetLessonId: string
  missedLessonId?: string
  note: string
  status: RequestStatus
  createdAt: string
  decidedAt?: string
  decidedBy?: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  date: string
  priority: 'normale' | 'importante'
  audience: 'tutti' | 'allieve' | 'insegnanti'
}

export interface AssociationInfo {
  name: string
  legalForm: string
  affiliation: string
  address: string
  email: string
  phone: string
  website: string
  season: string
  rooms: string[]
  settings: {
    maxStudentsPerClass: number
    absenceNoticeHours: number
    /** Lezioni singole: si prenotano a partire da N ore prima (massimo; Oasi: 48) */
    bookingOpensHours?: number
    /** ...e fino a N ore prima (minimo; 0 = fino all'inizio) */
    bookingClosesHours?: number
    /** Recuperi: si chiedono a partire da N giorni prima della lezione scelta (vuoto = senza limite) */
    makeupOpensDays?: number
    /** ...e fino a N giorni prima (0 = fino all'inizio). Un giorno = 24 ore */
    makeupClosesDays?: number
    /** Data di scadenza obbligatoria per ogni documento, di qualunque tipologia (Oasi: sì) */
    documentExpiryRequired?: boolean
    /** Aree in cui sono organizzate le classi (Oasi: Bambini/Ragazzi, Adulti/Ragazzi) */
    classCategories?: string[]
    /** Numero massimo di discipline per classe (Oasi: 2) */
    maxDisciplines?: number
    /** Metodi di pagamento accettati (Oasi: bonifico e contanti) */
    paymentMethods?: PaymentMethod[]
    /** Un recupero in una classe di livello inferiore è consentito */
    makeupLowerLevelAllowed?: boolean
    remindersEnabled: boolean
    progressVisibleToTeachers: boolean
    trialLessonEnabled: boolean
  }
}

export interface OasiDatabase {
  version: number
  association: AssociationInfo
  teachers: Teacher[]
  students: Student[]
  classes: ClassGroup[]
  lessons: Lesson[]
  figures: Figure[]
  progress: ProgressMap
  events: OasiEvent[]
  announcements: Announcement[]
  enrollmentRequests: EnrollmentRequest[]
  makeupRequests: MakeupRequest[]
  closures: Closure[]
  notifications: AppNotification[]
  disciplines: DisciplineInfo[]
  documentTypes: DocumentType[]
  documents: MemberDocument[]
  sharedDocuments: SharedDocument[]
  season: Season
  plans: FeePlan[]
  memberPlans: MemberPlan[]
  charges: Charge[]
}

// ── Stagione, piani, quote e pagamenti registrati ──────────────────
export interface SeasonPeriod {
  id: string
  name: string
  startDate: string
  endDate: string
}

/** Stagione della palestra: date, periodi; le precedenti restano nello storico */
export interface Season {
  id: string
  name: string
  startDate: string
  endDate: string
  periods: SeasonPeriod[]
}

export type PlanKind = 'abbonamento' | 'pacchetto' | 'lezione_singola' | 'semiprivata' | 'tessera'
export type PlanBilling = 'annuale' | 'periodico' | 'mensile' | 'una_tantum'

export interface PlanInstallment {
  amountCents: number
  dueOn: string
  coversFrom: string
  coversUntil: string
}

/** Piano configurato dalla palestra: nessuna formula commerciale è scritta nel codice */
export interface FeePlan {
  id: string
  name: string
  category: string
  kind: PlanKind
  billing: PlanBilling
  /** Prezzo in unica soluzione, in centesimi */
  amountCents: number
  /** Rate: un modo di pagare lo stesso piano, non un piano separato */
  installments?: PlanInstallment[]
  weeklyFrequency?: number
  /** Pacchetti: numero di ingressi */
  entries?: number
  /** Mensile: settimane consecutive di validità */
  validityWeeks?: number
  validFrom?: string
  validUntil?: string
  /** Ore minime di anticipo per prenotare (se diverso dal valore della palestra) */
  bookingHoursBefore?: number
  note?: string
  active: boolean
}

export interface MemberPlan {
  id: string
  studentId: string
  planId: string
  paymentMode: 'unica' | 'rate'
  validFrom: string
  validUntil: string
  entriesTotal?: number
  entriesUsed?: number
  createdAt: string
}

export type PaymentMethod = 'contanti' | 'bonifico' | 'pos' | 'altro'

/** Pagamento ricevuto fuori dall'app e registrato dall'amministrazione */
export interface PaymentRecord {
  id: string
  amountCents: number
  paidOn: string
  method: PaymentMethod
  note: string
}

/** Quota dovuta: retta, rata, tessera, quota gara */
export interface Charge {
  id: string
  studentId: string
  memberPlanId?: string
  /** Causale */
  description: string
  kind: 'piano' | 'tessera' | 'gara' | 'altro'
  installmentNo?: number
  periodLabel?: string
  amountCents: number
  dueOn: string
  cancelled?: boolean
  payments: PaymentRecord[]
  /** Lezione singola a cui si riferisce la quota */
  lessonId?: string
}

export type ClosureKind = 'festivita' | 'sciopero' | 'chiusura'

/** Giorni senza lezione: festività, scioperi, chiusure della sede */
export interface Closure {
  id: string
  kind: ClosureKind
  title: string
  startDate: string
  endDate: string
  note: string
  reminderSentAt?: string
}

export type NotificationKind = 'iscrizione' | 'recupero' | 'variazione' | 'chiusura' | 'evento' | 'comunicazione' | 'documento'

/**
 * Notifica nel centro notifiche. Destinatari: "student:<id>", "teacher:<id>",
 * "admin", "students" (tutte le atlete), "teachers".
 */
export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  to: string[]
  link?: { allieva?: string; insegnante?: string; admin?: string }
  createdAt: string
  readBy: string[]
}

export interface DemoPersona {
  role: Role
  /** id dell'atleta o dell'insegnante impersonata */
  userId: string | null
}

// ── Archivio documentale ───────────────────────────────────────────
export type DocumentCategory = 'personale' | 'iscrizione' | 'liberatoria' | 'consenso' | 'certificato_medico' | 'altro'
export type DocumentStatus = 'in_verifica' | 'approvato' | 'rifiutato' | 'da_sostituire'
/** Nella piattaforma non si firma: 'caricamento_firmato' = modulo da caricare già firmato a mano */
export type SignatureMode = 'nessuna' | 'caricamento_firmato'

/** Tipologia di documento richiesta dalla palestra */
export interface DocumentType {
  id: string
  name: string
  category: DocumentCategory
  description: string
  required: boolean
  signatureMode: SignatureMode
  validityMonths?: number
  /** Dati sanitari: solo amministrazione e interessata */
  sensitive: boolean
  active: boolean
  /** Obbligatorio solo per agonisti o iscritti a classi agonistiche/preagonistiche */
  requiredForCompetitive?: boolean
  /** La data di scadenza va sempre indicata da chi carica (es. certificato medico agonistico) */
  expiryRequired?: boolean
  /** A chi è richiesto (predefinito: atlete). Per gli insegnanti l'amministrazione decide quali e quanti documenti. */
  audience?: 'allieve' | 'insegnanti' | 'tutti'
  /** Documento da caricare a ogni periodo (es. ogni mese, entro l'ultimo giorno del mese) */
  recurrence?: 'mensile'
  /** Quanti documenti di questa tipologia servono (per periodo). Oltre 1, chi carica dà a ciascuno un titolo. */
  requiredCount?: number
}

export interface DocumentEvent {
  action: 'caricato' | 'approvato' | 'rifiutato' | 'sostituzione_richiesta' | 'sostituito' | 'scadenza'
  at: string
  by: string
  note?: string
}

/**
 * Documento di una persona: UNA sola riga per versione, letta sia dal profilo
 * sia dall'Archivio generale (nessuna copia). Le sostituzioni creano una nuova
 * versione collegata alla precedente.
 */
export interface MemberDocument {
  id: string
  memberId: string
  typeId: string
  version: number
  replacesId?: string
  current: boolean
  status: DocumentStatus
  fileName?: string
  fileType?: string
  fileSize?: number
  /** Demo: file salvato nel browser come data URL */
  fileData?: string
  /** Il file caricato è un modulo firmato a mano */
  signedByHand?: boolean
  uploadedAt: string
  uploadedBy: string
  expiresOn?: string
  reviewNote?: string
  reviewedAt?: string
  history: DocumentEvent[]
  /** Periodo a cui si riferisce un documento ricorrente (es. "2026-11") */
  periodKey?: string
  /** Titolo dato da chi carica (documenti liberi o più documenti della stessa tipologia) */
  title?: string
}

/** Documenti messi a disposizione dalla palestra (regolamento, modulistica) */
export interface SharedDocument {
  id: string
  title: string
  description: string
  fileName: string
  fileType: string
  fileData?: string
  audience: 'tutti' | 'allieve' | 'insegnanti'
  uploadedAt: string
}
