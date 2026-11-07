export type Role = 'allieva' | 'insegnante' | 'admin'

export type Discipline = 'cerchio' | 'tessuti'

export type Level = 'base' | 'intermedio' | 'avanzato'

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
  /** Disdette: di default l'allieva è attesa; qui si registra solo chi non verrà */
  declarations?: Record<string, AttendanceMark>
  /** Lezione annullata da una chiusura della sede */
  closureId?: string
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

export type NotificationKind = 'iscrizione' | 'recupero' | 'variazione' | 'chiusura' | 'evento' | 'comunicazione'

/**
 * Notifica nel centro notifiche. Destinatari: "student:<id>", "teacher:<id>",
 * "admin", "students" (tutte le allieve), "teachers".
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
  /** id dell'allieva o dell'insegnante impersonata */
  userId: string | null
}
