import type {
  DemoPersona,
  AttendanceMark,
  FeePlan,
  MemberPlan,
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

/** Lezioni dell'atleta: le sue classi + i recuperi approvati */
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
  // Atleti della classe: solo con un piano valido per la lezione; con piani senza partecipazione
  // automatica solo chi ha detto "ci sarò" (oppure ha già una presenza registrata)
  const expected = regular.filter(({ id }) => {
    if (lesson.attendance[id]) return true
    const access = lessonAccess(db, id, lesson)
    return access.status === 'ok' && (!access.needsConfirm || lesson.declarations?.[id] === 'presente')
  })
  return [...expected, ...makeups, ...bookings]
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
  const s = db.association.settings
  return lessonWindow(lesson, s.bookingOpensHours, s.bookingClosesHours ?? 0, now)
}

/** Recupero: si chiede dentro la finestra impostata dall'amministrazione (da N a M ore prima della lezione) */
export function makeupWindow(db: OasiDatabase, lesson: Lesson, now = new Date()) {
  const s = db.association.settings
  // In giorni: un giorno = 24 ore prima dell'inizio della lezione
  return lessonWindow(lesson, s.makeupOpensDays !== undefined ? s.makeupOpensDays * 24 : undefined, (s.makeupClosesDays ?? 0) * 24, now)
}

function lessonWindow(lesson: Lesson, opens: number | undefined, closes: number, now: Date) {
  const start = new Date(`${lesson.date}T${lesson.startTime}:00`)
  const hours = (start.getTime() - now.getTime()) / 3_600_000
  const openAt = opens ? new Date(start.getTime() - opens * 3_600_000) : null
  const closeAt = new Date(start.getTime() - closes * 3_600_000)
  const tooEarly = opens !== undefined && opens !== null && hours > opens
  const tooLate = hours < Math.max(closes, 0) || hours <= 0
  return { hours, open: !tooEarly && !tooLate, tooEarly, tooLate, openAt, closeAt }
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

/** Atleti che stanno lavorando (stato "In progetto") su ciascuna figura */
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

// ── Piani sottoscritti: validità, lezioni consumate, accesso alle lezioni ──
/** Piano dell'atleta per la classe che copre la data della lezione (l'ultimo scelto) */
export function memberPlanFor(db: OasiDatabase, studentId: string, classId: string, date: string): MemberPlan | undefined {
  return db.memberPlans
    .filter((p) => p.studentId === studentId && (!p.classId || p.classId === classId) && p.validFrom <= date && date <= p.validUntil)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.validUntil.localeCompare(a.validUntil))[0]
}

/** Piani dell'atleta per la classe, dal più recente */
export function memberPlansForClass(db: OasiDatabase, studentId: string, classId: string): MemberPlan[] {
  return db.memberPlans.filter((p) => p.studentId === studentId && (!p.classId || p.classId === classId)).sort((a, b) => b.validUntil.localeCompare(a.validUntil))
}

/** La lezione consuma una lezione del piano: presenza, oppure assenza senza disdetta */
function consumes(lesson: Lesson, studentId: string, plan: FeePlan | undefined) {
  const actual = lesson.attendance[studentId]
  const declared = lesson.declarations?.[studentId]
  if (actual === 'presente') return true
  return actual === 'assente' && declared !== 'assente' && (plan?.autoAttendance !== false || declared === 'presente')
}

/** Lezioni di un piano: consumate, prenotate ("ci sarò" su lezioni future) e residue */
export function planUsage(db: OasiDatabase, mp: MemberPlan) {
  const plan = db.plans.find((p) => p.id === mp.planId)
  const lessons = db.lessons.filter((l) => (!mp.classId || l.classId === mp.classId) && l.status !== 'annullata' && l.date >= mp.validFrom && l.date <= mp.validUntil)
  const consumed = lessons.filter((l) => consumes(l, mp.studentId, plan)).length
  const reserved = lessons.filter((l) => !isLessonPast(l) && l.declarations?.[mp.studentId] === 'presente' && !l.attendance[mp.studentId]).length
  const used = Math.max(0, consumed + reserved - (mp.refunded ?? 0))
  return { consumed, reserved, used, remaining: mp.lessons !== undefined ? Math.max(0, mp.lessons - used) : undefined }
}

export type LessonAccessStatus = 'ok' | 'scaduto' | 'esaurito' | 'nessun_piano'

/**
 * Accesso di un'atleta a una lezione della propria classe, secondo il piano scelto:
 * - nessun piano valido in quella data → la lezione non è disponibile ("scaduto" o "nessun_piano");
 * - lezioni del piano finite → "esaurito" (se non è già prenotata o svolta);
 * - piano senza partecipazione automatica → serve "ci sarò" (`needsConfirm`).
 * I recuperi approvati non dipendono dal piano.
 */
export function lessonAccess(db: OasiDatabase, studentId: string, lesson: Lesson): { status: LessonAccessStatus; needsConfirm: boolean; memberPlan?: MemberPlan; plan?: FeePlan } {
  if (isMakeupFor(db, lesson.id, studentId) || lesson.bookings?.includes(studentId)) return { status: 'ok', needsConfirm: false }
  const mp = memberPlanFor(db, studentId, lesson.classId, lesson.date)
  if (!mp) return { status: memberPlansForClass(db, studentId, lesson.classId).length ? 'scaduto' : 'nessun_piano', needsConfirm: false }
  const plan = db.plans.find((p) => p.id === mp.planId)
  const needsConfirm = plan?.autoAttendance === false
  if (mp.lessons !== undefined) {
    const counted = lesson.declarations?.[studentId] === 'presente' || !!lesson.attendance[studentId]
    if (!counted && planUsage(db, mp).used >= mp.lessons) return { status: 'esaurito', needsConfirm, memberPlan: mp, plan }
  }
  return { status: 'ok', needsConfirm, memberPlan: mp, plan }
}

/** Piani che l'atleta può scegliere per una classe (attivi, dell'area della classe, non già terminati) */
export function plansForClass(db: OasiDatabase, cls: ClassGroup | undefined, today = todayISO()): FeePlan[] {
  return db.plans.filter(
    (p) => p.active && (!p.areas?.length || !cls?.category || p.areas.includes(cls.category)) && !(p.validity === 'periodo' && p.validUntil && p.validUntil < today),
  )
}

/** Descrizione breve della validità di un piano */
export function planValidityLabel(p: FeePlan): string {
  if (p.validity === 'mesi') return `${p.months ?? 1} ${p.months === 1 || !p.months ? 'mese' : 'mesi'} dalla sottoscrizione`
  return `dal ${p.validFrom ? p.validFrom.split('-').reverse().join('/') : '—'} al ${p.validUntil ? p.validUntil.split('-').reverse().join('/') : '—'}`
}

export const euro = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** Tipi di evento che prevedono un'esibizione: per questi si indicano i brani */
export const isPerformance = (e: { type: string }) => e.type === 'gara' || e.type === 'saggio' || e.type === 'spettacolo'

/** Persona che può aderire a un evento: atleta, insegnante o segreteria ("admin") */
export function eventPerson(db: OasiDatabase, id: string): { id: string; firstName: string; lastName: string; role: 'atleta' | 'insegnante' | 'segreteria' } | undefined {
  if (id === 'admin') return { id, firstName: 'Segreteria', lastName: '', role: 'segreteria' }
  const s = findStudent(db, id)
  if (s) return { id, firstName: s.firstName, lastName: s.lastName, role: 'atleta' }
  const t = findTeacher(db, id)
  return t ? { id, firstName: t.firstName, lastName: t.lastName, role: 'insegnante' } : undefined
}

/** Partecipanti di un evento: adesioni (atleti, insegnanti, segreteria) e atleti delle classi collegate */
export function eventParticipants(db: OasiDatabase, event: { participantIds: string[]; classIds?: string[] }) {
  const fromClasses = db.classes.filter((c) => event.classIds?.includes(c.id)).flatMap((c) => c.studentIds)
  return [...new Set([...event.participantIds, ...fromClasses])].map((id) => eventPerson(db, id)).filter((p): p is NonNullable<typeof p> => !!p)
}

/** Gruppi e promemoria valgono per tutti gli eventi tranne quelli sociali */
export const hasGroups = (e: { type: string }) => e.type !== 'sociale'

/** Prossimi eventi (non sociali) a cui la persona partecipa, con i suoi gruppi: promemoria in home */
export function myUpcomingEvents(db: OasiDatabase, personId: string) {
  return upcomingEvents(db)
    .filter((e) => hasGroups(e) && eventParticipants(db, e).some((p) => p.id === personId))
    .map((event) => ({ event, groups: (event.groups ?? []).filter((g) => g.memberIds.includes(personId)) }))
}
