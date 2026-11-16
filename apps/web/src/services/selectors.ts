import type {
  DemoPersona,
  AttendanceMark,
  Charge,
  ClassGroup,
  Discipline,
  Figure,
  LearningStatus,
  Lesson,
  OasiDatabase,
  Student,
  Teacher,
} from '@/types'
import { compareDateTime, todayISO } from '@/lib/dates'
import { percent } from '@/lib/utils'

/** Funzioni pure di lettura/aggregazione: indipendenti dalla sorgente dati */

export const findStudent = (db: OasiDatabase, id?: string | null): Student | undefined =>
  db.students.find((s) => s.id === id)

export const findTeacher = (db: OasiDatabase, id?: string | null): Teacher | undefined =>
  db.teachers.find((t) => t.id === id)

export const findClass = (db: OasiDatabase, id?: string | null): ClassGroup | undefined =>
  db.classes.find((c) => c.id === id)

export const findFigure = (db: OasiDatabase, id?: string | null): Figure | undefined =>
  db.figures.find((f) => f.id === id)

export function lessonEnd(lesson: Lesson): number {
  return new Date(`${lesson.date}T${lesson.endTime}:00`).getTime()
}

export function isLessonPast(lesson: Lesson): boolean {
  return lessonEnd(lesson) < Date.now()
}

export function sortLessons(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort(compareDateTime)
}

export function lessonsForClasses(db: OasiDatabase, classIds: string[]): Lesson[] {
  return sortLessons(db.lessons.filter((l) => classIds.includes(l.classId)))
}

/** Lezioni dell'allieva: le sue classi + i recuperi approvati */
export function lessonsForStudent(db: OasiDatabase, studentId: string): Lesson[] {
  const student = findStudent(db, studentId)
  if (!student) return []
  const makeupIds = new Set(approvedMakeupLessonIds(db, studentId))
  return sortLessons(db.lessons.filter((l) => student.classIds.includes(l.classId) || makeupIds.has(l.id) || !!l.bookings?.includes(studentId)))
}

export function approvedMakeupLessonIds(db: OasiDatabase, studentId: string): string[] {
  return db.makeupRequests.filter((r) => r.studentId === studentId && r.status === 'approvata').map((r) => r.targetLessonId)
}

export function isMakeupFor(db: OasiDatabase, lessonId: string, studentId: string): boolean {
  return db.makeupRequests.some((r) => r.targetLessonId === lessonId && r.studentId === studentId && r.status === 'approvata')
}

export interface RosterEntry {
  student: Student
  isMakeup: boolean
  /** Lezione singola prenotata */
  isBooking: boolean
  declared: AttendanceMark | null
  actual: AttendanceMark | null
}

/** Elenco della lezione: iscritte alla classe + recuperi approvati */
export function lessonRoster(db: OasiDatabase, lesson: Lesson): RosterEntry[] {
  const cls = findClass(db, lesson.classId)
  const regular = (cls?.studentIds ?? []).map((id) => ({ id, isMakeup: false, isBooking: false }))
  const makeups = db.makeupRequests
    .filter((r) => r.targetLessonId === lesson.id && r.status === 'approvata')
    .map((r) => ({ id: r.studentId, isMakeup: true, isBooking: false }))
  const bookings = (lesson.bookings ?? []).map((id) => ({ id, isMakeup: false, isBooking: true }))
  return [...regular, ...makeups, ...bookings]
    .map(({ id, isMakeup, isBooking }) => ({ student: findStudent(db, id), isMakeup, isBooking }))
    .filter((e): e is { student: Student; isMakeup: boolean; isBooking: boolean } => !!e.student)
    .map(({ student, isMakeup, isBooking }) => ({
      student,
      isMakeup,
      isBooking,
      declared: lesson.declarations?.[student.id] ?? null,
      actual: lesson.attendance[student.id] ?? null,
    }))
}

/** Richieste in attesa che un insegnante (o l'amministrazione, teacherId null) deve gestire */
export function pendingRequests(db: OasiDatabase, teacherId: string | null) {
  const manages = (classId: string) => teacherId === null || findClass(db, classId)?.teacherId === teacherId
  const enrollments = db.enrollmentRequests.filter((r) => r.status === 'in_attesa' && manages(r.classId))
  const makeups = db.makeupRequests.filter((r) => {
    const lesson = db.lessons.find((l) => l.id === r.targetLessonId)
    return r.status === 'in_attesa' && !!lesson && manages(lesson.classId)
  })
  return { enrollments, makeups, total: enrollments.length + makeups.length }
}

/** Lezioni delle proprie classi più quelle in cui l'insegnante sostituisce una collega */
export function lessonsForTeacher(db: OasiDatabase, teacherId: string): Lesson[] {
  const classIds = new Set(db.classes.filter((c) => c.teacherId === teacherId).map((c) => c.id))
  return sortLessons(db.lessons.filter((l) => classIds.has(l.classId) || l.substituteTeacherId === teacherId))
}

/** Insegnante che tiene la lezione: chi sostituisce, altrimenti quella della classe */
export function lessonTeacherId(db: OasiDatabase, lesson: Lesson): string | undefined {
  return lesson.substituteTeacherId ?? findClass(db, lesson.classId)?.teacherId
}

/** La lezione si prenota come lezione singola? La prenotazione si apre N ore prima (impostazione della palestra) */
export function singleLessonWindow(db: OasiDatabase, lesson: Lesson, now = new Date()) {
  const opens = db.association.settings.bookingOpensHours
  const start = new Date(`${lesson.date}T${lesson.startTime}:00`)
  const hours = (start.getTime() - now.getTime()) / 3_600_000
  const openAt = opens ? new Date(start.getTime() - opens * 3_600_000) : null
  return { hours, open: hours > 0 && (opens === undefined || hours <= opens), openAt }
}

export function upcomingLessons(lessons: Lesson[], includeCancelled = true): Lesson[] {
  return lessons.filter((l) => !isLessonPast(l) && (includeCancelled || l.status !== 'annullata'))
}

export function nextLesson(lessons: Lesson[]): Lesson | undefined {
  return upcomingLessons(lessons, false)[0]
}

export interface AttendanceEntry {
  lesson: Lesson
  cls?: ClassGroup
  mark: AttendanceMark | null
}

export function studentAttendance(db: OasiDatabase, studentId: string): AttendanceEntry[] {
  return db.lessons
    .filter((l) => {
      const cls = findClass(db, l.classId)
      return cls?.studentIds.includes(studentId) || l.attendance[studentId] !== undefined || isMakeupFor(db, l.id, studentId)
    })
    .filter((l) => isLessonPast(l) || l.attendance[studentId] !== undefined)
    .filter((l) => l.status !== 'annullata')
    .sort((a, b) => compareDateTime(b, a))
    .map((lesson) => ({ lesson, cls: findClass(db, lesson.classId), mark: lesson.attendance[studentId] ?? null }))
}

export function attendanceRate(entries: AttendanceEntry[]): { present: number; absent: number; total: number; rate: number } {
  const marked = entries.filter((e) => e.mark)
  const present = marked.filter((e) => e.mark === 'presente').length
  return { present, absent: marked.length - present, total: marked.length, rate: percent(present, marked.length) }
}

export function figureStatus(db: OasiDatabase, studentId: string, figureId: string): LearningStatus {
  return db.progress[studentId]?.[figureId]?.status ?? 'da_imparare'
}

export type StatusCounts = Record<LearningStatus, number>

export function progressSummary(db: OasiDatabase, studentId: string, discipline?: Discipline) {
  const figures = db.figures.filter((f) => !discipline || f.discipline === discipline)
  const counts: StatusCounts = { da_imparare: 0, in_progetto: 0, riuscita: 0 }
  for (const f of figures) counts[figureStatus(db, studentId, f.id)]++
  return { counts, total: figures.length, completion: percent(counts.riuscita, figures.length) }
}

export function recentProgress(db: OasiDatabase, studentId: string, limit = 4) {
  return Object.entries(db.progress[studentId] ?? {})
    .filter(([, p]) => p.status !== 'da_imparare')
    .map(([figureId, p]) => ({ figure: findFigure(db, figureId), progress: p }))
    .filter((e): e is { figure: Figure; progress: (typeof e)['progress'] } => !!e.figure)
    .sort((a, b) => b.progress.updatedAt.localeCompare(a.progress.updatedAt))
    .slice(0, limit)
}

export function studentsOfTeacher(db: OasiDatabase, teacherId: string): Student[] {
  const ids = new Set(db.classes.filter((c) => c.teacherId === teacherId).flatMap((c) => c.studentIds))
  return db.students.filter((s) => ids.has(s.id))
}

/** Allieve che stanno lavorando (stato "In progetto") su ciascuna figura */
export function studentsWorkingOnFigures(db: OasiDatabase, students: Student[]) {
  return db.figures
    .map((figure) => ({
      figure,
      students: students.filter((s) => figureStatus(db, s.id, figure.id) === 'in_progetto'),
    }))
    .filter((e) => e.students.length > 0)
    .sort((a, b) => b.students.length - a.students.length)
}

export function studentsByFigureStatus(db: OasiDatabase, figureId: string, students: Student[]) {
  return students.map((s) => ({ student: s, progress: db.progress[s.id]?.[figureId], status: figureStatus(db, s.id, figureId) }))
}

export function upcomingEvents(db: OasiDatabase) {
  const today = todayISO()
  return [...db.events].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
}

export function pastEvents(db: OasiDatabase) {
  const today = todayISO()
  return [...db.events].filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date))
}

export function classOccupancy(cls: ClassGroup) {
  return { enrolled: cls.studentIds.length, free: Math.max(0, cls.capacity - cls.studentIds.length), pct: percent(cls.studentIds.length, cls.capacity) }
}

/** Presenze delle ultime N lezioni concluse (per dashboard) */
export function recentAttendance(db: OasiDatabase, lessons: Lesson[], limit = 6) {
  return lessons
    .filter((l) => isLessonPast(l) && l.status !== 'annullata')
    .sort((a, b) => compareDateTime(b, a))
    .slice(0, limit)
    .map((lesson) => {
      const cls = findClass(db, lesson.classId)
      const marks = Object.values(lesson.attendance)
      const present = marks.filter((m) => m === 'presente').length
      return { lesson, cls, present, total: cls?.studentIds.length ?? marks.length }
    })
}

/** Presenze previste: iscritte + recuperi, meno chi ha annunciato l'assenza o è sospesa */
export function expectedAttendance(db: OasiDatabase, lesson: Lesson): number {
  return lessonRoster(db, lesson).filter((e) => e.declared !== 'assente' && e.student.membership.status !== 'sospesa').length
}

/** Di default tutte le iscritte sono attese: contano solo le disdette */
export function declarationSummary(db: OasiDatabase, lesson: Lesson) {
  const roster = lessonRoster(db, lesson)
  const cancelled = roster.filter((e) => e.declared === 'assente').length
  return { expected: roster.length - cancelled, cancelled, total: roster.length }
}

// ── Notifiche ────────────────────────────────────────────────────
export function notificationKeys(persona: DemoPersona | null): string[] {
  if (!persona) return []
  if (persona.role === 'allieva') return [`student:${persona.userId}`, 'students']
  if (persona.role === 'insegnante') return [`teacher:${persona.userId}`, 'teachers']
  return ['admin']
}

/** Chiave personale usata per segnare come lette */
export function readerKey(persona: DemoPersona | null): string {
  return notificationKeys(persona)[0] ?? 'anon'
}

export function notificationsFor(db: OasiDatabase, persona: DemoPersona | null) {
  const keys = notificationKeys(persona)
  const me = readerKey(persona)
  const list = (db.notifications ?? []).filter((n) => n.to.some((t) => keys.includes(t))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { list, unread: list.filter((n) => !n.readBy.includes(me)).length, me }
}

export function upcomingClosures(db: OasiDatabase) {
  const today = todayISO()
  return (db.closures ?? []).filter((c) => c.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
}


// ── Agonismo ────────────────────────────────────────────────────────
/** Tutte le discipline di una classe: la principale più quelle aggiunte */
export const classDisciplines = (c: ClassGroup): string[] => [c.discipline, ...(c.extraDisciplines ?? []).filter((d) => d !== c.discipline)]

export const isCompetitiveClass = (c: ClassGroup | undefined) => !!c && (c.competitiveLevel ?? 'nessuna') !== 'nessuna'

/** Agonista: per classificazione della persona oppure perché iscritta a una classe agonistica o preagonistica */
export function isCompetitive(db: OasiDatabase, studentId: string): boolean {
  const s = db.students.find((x) => x.id === studentId)
  if (!s) return false
  return !!s.competitive || db.classes.some((c) => isCompetitiveClass(c) && c.studentIds.includes(studentId))
}

// ── Diritti di recupero ─────────────────────────────────────────────
const RANK: Record<string, number> = { base: 0, intermedio: 1, avanzato: 2 }

/**
 * Un diritto di recupero nasce da un'assenza a una lezione della propria classe
 * (annunciata o registrata) e si consuma con una richiesta non rifiutata.
 */
export function makeupCredits(db: OasiDatabase, studentId: string) {
  const own = new Set(db.classes.filter((c) => c.studentIds.includes(studentId)).map((c) => c.id))
  const absences = db.lessons.filter(
    (l) => own.has(l.classId) && l.status !== 'annullata' && (l.declarations?.[studentId] === 'assente' || l.attendance[studentId] === 'assente') && l.attendance[studentId] !== 'presente',
  )
  const requests = db.makeupRequests.filter((r) => r.studentId === studentId && r.status !== 'rifiutata')
  const used = requests.filter((r) => r.status === 'approvata').length
  const pending = requests.filter((r) => r.status === 'in_attesa').length
  return { earned: absences.length, used, pending, available: Math.max(absences.length - used - pending, 0), absences }
}

/** Il recupero è ammesso in classi dello stesso livello o (se consentito) inferiore; mai superiore */
export function makeupLevelAllowed(db: OasiDatabase, studentId: string, target: ClassGroup): boolean {
  const own = db.classes.filter((c) => c.studentIds.includes(studentId))
  if (own.length === 0) return false
  const top = Math.max(...own.map((c) => RANK[c.level] ?? 0))
  const wanted = RANK[target.level] ?? 0
  if (wanted > top) return false
  return wanted === top || (db.association.settings.makeupLowerLevelAllowed ?? true)
}

/** Evento principale per la home: quello in evidenza, altrimenti il prossimo saggio/spettacolo/gara, altrimenti il più vicino */
export function nextMainEvent(db: OasiDatabase) {
  const list = upcomingEvents(db)
  return list.find((e) => e.featured) ?? list.find((e) => e.type === 'saggio' || e.type === 'spettacolo' || e.type === 'gara') ?? list[0]
}

// ── Quote e pagamenti ───────────────────────────────────────────────
export type ChargeState = 'pagata' | 'parziale' | 'scaduta' | 'aperta' | 'annullata'

export const chargePaid = (c: Charge) => c.payments.reduce((s, p) => s + p.amountCents, 0)

export function chargeState(c: Charge, today: string): ChargeState {
  if (c.cancelled) return 'annullata'
  const paid = chargePaid(c)
  if (paid >= c.amountCents) return 'pagata'
  if (c.dueOn < today) return 'scaduta'
  return paid > 0 ? 'parziale' : 'aperta'
}

/** Riepilogo economico di un'allieva (o di tutta la palestra se studentId è assente) */
export function accountSummary(db: OasiDatabase, today: string, studentId?: string) {
  const charges = db.charges.filter((c) => !c.cancelled && (!studentId || c.studentId === studentId))
  const due = charges.reduce((s, c) => s + c.amountCents, 0)
  const paid = charges.reduce((s, c) => s + chargePaid(c), 0)
  const overdue = charges.filter((c) => chargeState(c, today) === 'scaduta')
  return { charges, due, paid, residual: due - paid, overdue, overdueCents: overdue.reduce((s, c) => s + c.amountCents - chargePaid(c), 0) }
}

export const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** Tipi di evento che prevedono un'esibizione: per questi si indicano i brani */
export const isPerformance = (e: { type: string }) => e.type === 'gara' || e.type === 'saggio' || e.type === 'spettacolo'

/** Partecipanti di un evento: adesioni e allieve delle classi collegate */
export function eventParticipants(db: OasiDatabase, event: { participantIds: string[]; classIds?: string[] }) {
  const fromClasses = db.classes.filter((c) => event.classIds?.includes(c.id)).flatMap((c) => c.studentIds)
  return [...new Set([...event.participantIds, ...fromClasses])].map((id) => findStudent(db, id)).filter((s): s is Student => !!s)
}
