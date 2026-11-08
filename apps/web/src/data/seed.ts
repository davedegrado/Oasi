import type {
  AppNotification,
  AttendanceMark,
  Closure,
  ClassGroup,
  Figure,
  FigureProgress,
  LearningStatus,
  Lesson,
  Level,
  OasiDatabase,
  ProgressMap,
  Student,
} from '@/types'
import { addDays, startOfWeek, todayISO } from '@/lib/dates'
import { demoClasses } from './classes'
import { demoDisciplines } from './disciplines'
import { buildDemoDocuments, buildSharedDocuments, demoDocumentTypes } from './documents'
import { demoAnnouncementSeeds, demoAssociation, demoEventSeeds } from './events'
import { demoFigureSeeds, photo } from './figures'
import { demoStudentSeeds, demoTeachers } from './people'

export const DATABASE_VERSION = 8

/** Hash deterministico: la demo genera sempre gli stessi dati per lo stesso giorno */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

const LEVEL_RANK: Record<Level, number> = { base: 0, intermedio: 1, avanzato: 2 }

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1 + months, Math.min(d, 28))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildStudents(today: string): Student[] {
  return demoStudentSeeds.map((seed, index) => {
    const { joinedMonthsAgo, membershipStatus, feePlan, ...rest } = seed
    const certificateOffset =
      membershipStatus === 'in_scadenza' ? 12 : membershipStatus === 'sospesa' ? -15 : 90 + (hash(seed.id) % 200)
    return {
      ...rest,
      joinedAt: addMonths(today, -joinedMonthsAgo),
      membership: {
        status: membershipStatus,
        cardNumber: `UISP-MO-${String(2604 + index * 37).padStart(5, '0')}`,
        expiresAt: membershipStatus === 'prova' ? addDays(today, 14) : '2027-08-31',
        medicalCertificateExpiresAt: addDays(today, certificateOffset),
        feePlan,
        feePaidUntil:
          membershipStatus === 'in_scadenza' ? addDays(today, 10) : membershipStatus === 'sospesa' ? addDays(today, -40) : addDays(today, 60 + (index % 4) * 30),
      },
    }
  })
}

function buildClasses(students: Student[]): ClassGroup[] {
  return demoClasses.map((c) => ({
    ...c,
    studentIds: students.filter((s) => s.classIds.includes(c.id)).map((s) => s.id),
  }))
}

interface LessonOverride {
  classId: string
  weekOffset: number
  status: Lesson['status']
  startTime?: string
  endTime?: string
  note: string
}

const LESSON_OVERRIDES: LessonOverride[] = [
  { classId: 'cls-cerchio-base', weekOffset: -2, status: 'annullata', note: 'Lezione sospesa per la chiusura della sede (ponte festivo).' },
  {
    classId: 'cls-cerchio-int', weekOffset: 0, status: 'variata', startTime: '20:00', endTime: '21:30',
    note: 'Orario posticipato di 30 minuti: Sala Luna occupata per la manutenzione degli ancoraggi.',
  },
  { classId: 'cls-tessuti-base', weekOffset: 1, status: 'annullata', note: 'Insegnante in formazione: la lezione verrà recuperata sabato mattina.' },
  {
    classId: 'cls-tessuti-int', weekOffset: 2, status: 'variata', startTime: '19:00', endTime: '20:30',
    note: 'Lezione spostata alle 19:00 per le prove dello spettacolo.',
  },
]

function buildLessons(classes: ClassGroup[], today: string): Lesson[] {
  const monday = startOfWeek(today)
  const now = Date.now()
  const lessons: Lesson[] = []
  for (const cls of classes) {
    for (let week = -5; week <= 6; week++) {
      const date = addDays(monday, week * 7 + cls.weekday - 1)
      const override = LESSON_OVERRIDES.find((o) => o.classId === cls.id && o.weekOffset === week)
      const startTime = override?.startTime ?? cls.startTime
      const endTime = override?.endTime ?? cls.endTime
      const ended = new Date(`${date}T${endTime}:00`).getTime() < now
      const attendance: Record<string, AttendanceMark> = {}
      if (ended && override?.status !== 'annullata') {
        for (const sid of cls.studentIds) {
          attendance[sid] = hash(`${sid}-${date}`) % 100 < 84 ? 'presente' : 'assente'
        }
      }
      // Alcune allieve hanno già annunciato presenza o assenza per le prossime lezioni
      const declarations: Record<string, AttendanceMark> = {}
      if (!ended && override?.status !== 'annullata' && week <= 1) {
        for (const sid of cls.studentIds) {
          if (sid === 'stu-giulia') continue
          const roll = hash(`decl-${sid}-${date}`) % 100
          if (roll < 55) declarations[sid] = 'presente'
          else if (roll < 68) declarations[sid] = 'assente'
        }
      }
      lessons.push({
        id: `les-${cls.id.replace('cls-', '')}-${date}`,
        declarations,
        classId: cls.id,
        date,
        startTime,
        endTime,
        status: override?.status ?? 'regolare',
        note: override?.note,
        originalStartTime: override?.startTime ? cls.startTime : undefined,
        originalEndTime: override?.endTime ? cls.endTime : undefined,
        attendance,
      })
    }
  }
  return lessons
}

function buildFigures(today: string): Figure[] {
  return demoFigureSeeds.map(({ createdDaysAgo, cover, steps, ...rest }) => ({
    ...rest,
    cover: photo(cover),
    steps: steps.map(([file, caption], i) => ({ id: `${rest.id}-s${i + 1}`, image: photo(file), caption })),
    createdAt: addDays(today, -createdDaysAgo),
  }))
}

const PERSONAL_NOTES: Record<string, Record<string, string>> = {
  'stu-giulia': {
    'fig-gazelle': 'Chiara dice di spingere di più la barra con le mani. Provare a filmarmi la prossima volta!',
    'fig-mermaid': 'Riuscita anche dal lato sinistro 🎉',
    'fig-delilah': 'Obiettivo primavera. Lavorare sulla spaccata a terra 3 volte a settimana.',
    'fig-hip-key': 'Ricordare: gamba destra davanti al tessuto.',
  },
}

function pickStatus(student: Student, figure: Figure, studentDisciplines: Set<string>): LearningStatus {
  if (!studentDisciplines.has(figure.discipline)) return 'da_imparare'
  const gap = LEVEL_RANK[figure.level] - LEVEL_RANK[student.level]
  const roll = hash(`${student.id}:${figure.id}`) % 100
  if (gap < 0) return roll < 82 ? 'riuscita' : 'in_progetto'
  if (gap === 0) {
    if (figure.difficulty <= 2) return roll < 75 ? 'riuscita' : 'in_progetto'
    if (roll < 30) return 'riuscita'
    if (roll < 72) return 'in_progetto'
    if (roll < 88) return 'in_progetto'
    return 'da_imparare'
  }
  if (gap === 1) return roll < 35 ? 'in_progetto' : roll < 45 ? 'in_progetto' : 'da_imparare'
  return 'da_imparare'
}

function buildProgress(students: Student[], figures: Figure[], classes: ClassGroup[], today: string): ProgressMap {
  const progress: ProgressMap = {}
  for (const student of students) {
    const disciplines = new Set<string>([student.mainDiscipline])
    for (const cid of student.classIds) {
      const cls = classes.find((c) => c.id === cid)
      if (cls) disciplines.add(cls.discipline)
    }
    const entries: Record<string, FigureProgress> = {}
    for (const figure of figures) {
      const status = pickStatus(student, figure, disciplines)
      const note = PERSONAL_NOTES[student.id]?.[figure.id] ?? ''
      if (status === 'da_imparare' && !note) continue
      entries[figure.id] = {
        status,
        note,
        updatedAt: addDays(today, -(hash(`${figure.id}${student.id}`) % 40)),
      }
    }
    progress[student.id] = entries
  }
  // Ritocchi per rendere la demo coerente con gli obiettivi di Giulia
  progress['stu-giulia'] = {
    ...progress['stu-giulia'],
    'fig-gazelle': { status: 'in_progetto', note: PERSONAL_NOTES['stu-giulia']['fig-gazelle'], updatedAt: addDays(today, -2) },
    'fig-mermaid': { status: 'riuscita', note: PERSONAL_NOTES['stu-giulia']['fig-mermaid'], updatedAt: addDays(today, -6) },
    'fig-delilah': { status: 'in_progetto', note: PERSONAL_NOTES['stu-giulia']['fig-delilah'], updatedAt: addDays(today, -4) },
  }
  return progress
}

/** Richieste dimostrative in attesa, per mostrare il flusso di approvazione */
function buildRequests(classes: ClassGroup[], lessons: Lesson[], today: string): Pick<OasiDatabase, 'enrollmentRequests' | 'makeupRequests'> {
  const future = (classId: string) =>
    lessons.filter((l) => l.classId === classId && l.date > today && l.status !== 'annullata').sort((a, b) => a.date.localeCompare(b.date))
  const sofiaTarget = future('cls-cerchio-int')[0]
  const missed = lessons.filter((l) => l.classId === 'cls-cerchio-base' && l.date < today && l.status === 'annullata')[0]
  return {
    enrollmentRequests: [
      { id: 'enr-noemi-int', classId: 'cls-cerchio-int', studentId: 'stu-noemi', note: 'Chiara mi ha consigliato di provare il livello intermedio.', status: 'in_attesa', createdAt: addDays(today, -1) },
      { id: 'enr-anna-tint', classId: 'cls-tessuti-int', studentId: 'stu-anna', note: 'Vorrei aggiungere una seconda lezione a settimana.', status: 'in_attesa', createdAt: addDays(today, -2) },
    ],
    makeupRequests: sofiaTarget && classes.length
      ? [{ id: 'mku-sofia', studentId: 'stu-sofia', targetLessonId: sofiaTarget.id, missedLessonId: missed?.id, note: 'Recupero della lezione persa per la chiusura della sede.', status: 'in_attesa', createdAt: addDays(today, -1) }]
      : [],
  }
}

/** Prossima ricorrenza di una data fissa (mese 1-12, giorno) a partire da oggi */
function nextOccurrence(today: string, month: number, day: number): string {
  const y = Number(today.slice(0, 4))
  const candidate = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return candidate >= today ? candidate : `${y + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function buildClosures(today: string): Closure[] {
  const immacolata = nextOccurrence(today, 12, 8)
  return [
    {
      id: 'clo-immacolata',
      kind: 'festivita',
      title: 'Festa dell’Immacolata',
      startDate: immacolata,
      endDate: immacolata,
      note: 'Sede chiusa per festività nazionale: le lezioni del giorno sono sospese.',
    },
  ]
}

/** Le lezioni che cadono in una chiusura risultano annullate */
export function applyClosure(lessons: Lesson[], closure: Closure): Lesson[] {
  return lessons.map((l) =>
    l.date >= closure.startDate && l.date <= closure.endDate && l.status !== 'annullata'
      ? { ...l, status: 'annullata', closureId: closure.id, note: closure.note ? `${closure.title}: ${closure.note}` : closure.title }
      : l,
  )
}

function buildNotifications(today: string): AppNotification[] {
  return [
    { id: 'ntf-var', kind: 'variazione', title: 'Variazione di orario', body: 'Tessuti Intermedio: la lezione tra due settimane è spostata alle 19:00 per le prove dello spettacolo.', to: ['students'], link: { allieva: '/allieva/calendario' }, createdAt: addDays(today, -1), readBy: [] },
    { id: 'ntf-gara', kind: 'evento', title: 'Nuovo evento: Gara regionale UISP', body: 'Iscrizioni aperte fino a un mese prima della gara. Posti limitati.', to: ['students'], link: { allieva: '/allieva/eventi' }, createdAt: addDays(today, -2), readBy: [] },
    { id: 'ntf-req-noemi', kind: 'iscrizione', title: 'Nuova richiesta di iscrizione', body: 'Noemi Rinaldi chiede di entrare in Cerchio Intermedio.', to: ['teacher:tch-chiara', 'admin'], link: { insegnante: '/insegnante/lezioni?tab=richieste', admin: '/admin/classi' }, createdAt: addDays(today, -1), readBy: [] },
    { id: 'ntf-req-sofia', kind: 'recupero', title: 'Richiesta di recupero', body: 'Sofia Galli chiede di recuperare con Cerchio Intermedio.', to: ['teacher:tch-chiara', 'admin'], link: { insegnante: '/insegnante/lezioni?tab=richieste', admin: '/admin/classi' }, createdAt: addDays(today, -1), readBy: [] },
  ]
}

export function createSeedDatabase(today: string = todayISO()): OasiDatabase {
  const students = buildStudents(today)
  const classes = buildClasses(students)
  const figures = buildFigures(today)
  const closures = buildClosures(today)
  const lessons = closures.reduce(applyClosure, buildLessons(classes, today))
  return {
    version: DATABASE_VERSION,
    association: structuredClone(demoAssociation),
    teachers: structuredClone(demoTeachers),
    students,
    classes,
    lessons,
    figures,
    progress: buildProgress(students, figures, classes, today),
    events: demoEventSeeds.map(({ inDays, deadlineInDays, ...e }) => ({
      ...e,
      date: addDays(today, inDays),
      signupDeadline: deadlineInDays !== undefined ? addDays(today, deadlineInDays) : undefined,
    })),
    announcements: demoAnnouncementSeeds.map(({ daysAgo, ...a }) => ({ ...a, date: addDays(today, -daysAgo) })),
    ...buildRequests(classes, lessons, today),
    closures,
    notifications: buildNotifications(today),
    disciplines: structuredClone(demoDisciplines),
    documentTypes: structuredClone(demoDocumentTypes),
    documents: buildDemoDocuments(today),
    sharedDocuments: buildSharedDocuments(today),
  }
}
