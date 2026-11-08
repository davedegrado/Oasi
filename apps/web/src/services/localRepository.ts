import type { AppNotification, MemberDocument, OasiDatabase } from '@/types'
import { applyClosure, createSeedDatabase, DATABASE_VERSION } from '@/data/seed'
import { addDays, formatDate, startOfWeek, todayISO } from '@/lib/dates'
import { uid } from '@/lib/utils'
import type { OasiRepository } from './repository'

const STORAGE_KEY = 'oasi-demo-db'

/** v3 → v4: lo stato "in_apprendimento" confluisce in "in_progetto" mantenendo le note */
function migrateFrom3(db: OasiDatabase): OasiDatabase {
  const progress = Object.fromEntries(
    Object.entries(db.progress).map(([sid, entries]) => [
      sid,
      Object.fromEntries(
        Object.entries(entries).map(([fid, p]) => [fid, { ...p, status: (p.status as string) === 'in_apprendimento' ? 'in_progetto' : p.status }]),
      ),
    ]),
  )
  return { ...db, version: 4, progress }
}

/** v4 → v5: richieste di iscrizione e recupero, presenze annunciate, scadenze eventi */
function migrateFrom4(db: OasiDatabase): OasiDatabase {
  const seed = createSeedDatabase()
  return {
    ...db,
    version: 5,
    enrollmentRequests: db.enrollmentRequests ?? [],
    makeupRequests: db.makeupRequests ?? [],
    lessons: db.lessons.map((l) => ({ ...l, declarations: l.declarations ?? {} })),
    events: [
      ...db.events.map((e) => ({ ...e, signupDeadline: e.signupDeadline ?? seed.events.find((s) => s.id === e.id)?.signupDeadline })),
      ...seed.events.filter((s) => !db.events.some((e) => e.id === s.id) && (s.type === 'gara' || s.type === 'saggio')),
    ],
  }
}

/** v5 → v6: chiusure e centro notifiche; "Ci sarò" diventa il default (restano solo le disdette) */
function migrateFrom5(db: OasiDatabase): OasiDatabase {
  const seed = createSeedDatabase()
  const lessons = db.lessons.map((l) => ({
    ...l,
    declarations: Object.fromEntries(Object.entries(l.declarations ?? {}).filter(([, v]) => v === 'assente')),
  }))
  return {
    ...db,
    version: 6,
    lessons: seed.closures.reduce(applyClosure, lessons),
    closures: db.closures ?? seed.closures,
    notifications: db.notifications ?? seed.notifications,
  }
}

/** v6 → v7: discipline come dati, archivio documentale */
function migrateFrom6(db: OasiDatabase): OasiDatabase {
  const seed = createSeedDatabase()
  return {
    ...db,
    version: DATABASE_VERSION,
    disciplines: db.disciplines ?? seed.disciplines,
    documentTypes: db.documentTypes ?? seed.documentTypes,
    documents: db.documents ?? seed.documents.filter((d) => db.students.some((s) => s.id === d.memberId)),
    sharedDocuments: db.sharedDocuments ?? seed.sharedDocuments,
  }
}

function loadFromStorage(): OasiDatabase | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OasiDatabase
    if (parsed.version === 3) return migrateFrom6(migrateFrom5(migrateFrom4(migrateFrom3(parsed))))
    if (parsed.version === 4) return migrateFrom6(migrateFrom5(migrateFrom4(parsed)))
    if (parsed.version === 5) return migrateFrom6(migrateFrom5(parsed))
    if (parsed.version === 6) return migrateFrom6(parsed)
    if (parsed.version !== DATABASE_VERSION) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Se la demo viene riaperta a distanza di settimane, il calendario rischierebbe
 * di restare "nel passato": in quel caso rigeneriamo le lezioni attorno a oggi
 * mantenendo tutte le altre modifiche (figure, progressi, eventi, classi).
 */
function refreshCalendarIfStale(db: OasiDatabase): OasiDatabase {
  const lastLesson = db.lessons.reduce((max, l) => (l.date > max ? l.date : max), '')
  if (lastLesson >= addDays(startOfWeek(todayISO()), 14)) return db
  const fresh = createSeedDatabase()
  const classIds = new Set(db.classes.map((c) => c.id))
  return { ...db, lessons: fresh.lessons.filter((l) => classIds.has(l.classId)) }
}

function persist(db: OasiDatabase) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (err) {
    // Quota superata (es. troppe immagini caricate): la demo continua in memoria
    console.warn('[Oasi] impossibile salvare su localStorage', err)
  }
}

type NewNotification = Omit<AppNotification, 'id' | 'createdAt' | 'readBy'>

function withNotifications(db: OasiDatabase, items: NewNotification[]): OasiDatabase {
  const now = new Date().toISOString()
  return {
    ...db,
    notifications: [...items.map((n) => ({ ...n, id: uid('ntf'), createdAt: now, readBy: [] })), ...(db.notifications ?? [])].slice(0, 200),
  }
}

const studentName = (db: OasiDatabase, id: string) => {
  const s = db.students.find((x) => x.id === id)
  return s ? `${s.firstName} ${s.lastName}` : 'Un’allieva'
}

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

function addMonths(iso: string, months: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Nuova versione di un documento: la precedente resta nello storico, non è più "corrente" */
function newVersion(
  db: OasiDatabase,
  memberId: string,
  typeId: string,
  data: Pick<MemberDocument, 'status' | 'uploadedBy'> & Partial<MemberDocument>,
  action: 'caricato' | 'firmato',
): OasiDatabase {
  const previous = db.documents.find((d) => d.memberId === memberId && d.typeId === typeId && d.current)
  const now = new Date().toISOString()
  const doc: MemberDocument = {
    ...data,
    id: uid('doc'),
    memberId,
    typeId,
    version: (previous?.version ?? 0) + 1,
    replacesId: previous?.id,
    current: true,
    uploadedAt: now,
    history: [...(previous ? [{ action: 'sostituito' as const, at: now, by: data.uploadedBy, note: `Sostituisce la versione ${previous.version}` }] : []), { action, at: now, by: data.uploadedBy }],
  }
  return { ...db, documents: [doc, ...db.documents.map((d) => (d.id === previous?.id ? { ...d, current: false } : d))] }
}

function restoreLesson(db: OasiDatabase, l: OasiDatabase['lessons'][number]) {
  const cls = db.classes.find((c) => c.id === l.classId)
  return { ...l, status: 'regolare' as const, closureId: undefined, note: undefined, startTime: cls?.startTime ?? l.startTime, endTime: cls?.endTime ?? l.endTime }
}

/** Avvisa le allieve della classe (e i recuperi) quando una lezione viene annullata o variata */
function notifyLessonChange(prev: OasiDatabase, lessonId: string, status: string | undefined, note: string | undefined, next: OasiDatabase): OasiDatabase {
  if (status !== 'annullata' && status !== 'variata') return next
  const lesson = next.lessons.find((l) => l.id === lessonId)
  const cls = prev.classes.find((c) => c.id === lesson?.classId)
  if (!lesson || !cls) return next
  const makeups = prev.makeupRequests.filter((r) => r.targetLessonId === lessonId && r.status === 'approvata').map((r) => r.studentId)
  const to = [...cls.studentIds, ...makeups].map((id) => `student:${id}`)
  return withNotifications(next, [{
    kind: 'variazione',
    title: status === 'annullata' ? `Lezione annullata: ${cls.name}` : `Nuovo orario: ${cls.name}`,
    body: `${formatDate(lesson.date, { weekday: true })}${status === 'variata' ? `, ${lesson.startTime}–${lesson.endTime}` : ''}${note ? `. ${note}` : ''}`,
    to,
    link: { allieva: '/allieva/calendario' },
  }])
}

export class LocalRepository implements OasiRepository {
  private db: OasiDatabase
  private listeners = new Set<() => void>()

  constructor() {
    const stored = loadFromStorage()
    this.db = stored ? refreshCalendarIfStale(stored) : createSeedDatabase()
    persist(this.db)
    if (typeof window !== 'undefined') {
      // Sincronizza più schede aperte contemporaneamente
      window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return
        const next = loadFromStorage()
        if (next) {
          this.db = next
          this.emit()
        }
      })
    }
  }

  getSnapshot = () => this.db

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  private commit(mutator: (draft: OasiDatabase) => OasiDatabase): Promise<void> {
    try {
      this.db = mutator(this.db)
    } catch (err) {
      return Promise.reject(err)
    }
    persist(this.db)
    this.emit()
    return Promise.resolve()
  }

  updateProgress: OasiRepository['updateProgress'] = (studentId, figureId, patch) =>
    this.commit((db) => {
      const current = db.progress[studentId]?.[figureId] ?? { status: 'da_imparare', note: '', updatedAt: todayISO() }
      return {
        ...db,
        progress: {
          ...db.progress,
          [studentId]: {
            ...db.progress[studentId],
            [figureId]: { ...current, ...patch, updatedAt: todayISO() },
          },
        },
      }
    })

  setAttendance: OasiRepository['setAttendance'] = (lessonId, studentId, mark) =>
    this.commit((db) => ({
      ...db,
      lessons: db.lessons.map((l) => {
        if (l.id !== lessonId) return l
        const attendance = { ...l.attendance }
        if (mark) attendance[studentId] = mark
        else delete attendance[studentId]
        return { ...l, attendance }
      }),
    }))

  setAllAttendance: OasiRepository['setAllAttendance'] = (lessonId, mark) =>
    this.commit((db) => {
      const lesson = db.lessons.find((l) => l.id === lessonId)
      const cls = db.classes.find((c) => c.id === lesson?.classId)
      if (!lesson || !cls) return db
      const makeups = db.makeupRequests.filter((r) => r.targetLessonId === lessonId && r.status === 'approvata').map((r) => r.studentId)
      const attendance = Object.fromEntries([...cls.studentIds, ...makeups].map((id) => [id, mark]))
      return { ...db, lessons: db.lessons.map((l) => (l.id === lessonId ? { ...l, attendance } : l)) }
    })

  setDeclaration: OasiRepository['setDeclaration'] = (lessonId, studentId, mark) =>
    this.commit((db) => ({
      ...db,
      lessons: db.lessons.map((l) => {
        if (l.id !== lessonId) return l
        const declarations = { ...(l.declarations ?? {}) }
        if (mark) declarations[studentId] = mark
        else delete declarations[studentId]
        return { ...l, declarations }
      }),
    }))

  requestEnrollment: OasiRepository['requestEnrollment'] = (classId, studentId, note) =>
    this.commit((db) => {
      const open = db.enrollmentRequests.some((r) => r.classId === classId && r.studentId === studentId && r.status === 'in_attesa')
      const enrolled = db.classes.find((c) => c.id === classId)?.studentIds.includes(studentId)
      if (open || enrolled) return db
      const cls = db.classes.find((c) => c.id === classId)
      return withNotifications(
        {
          ...db,
          enrollmentRequests: [{ id: uid('enr'), classId, studentId, note, status: 'in_attesa', createdAt: todayISO() }, ...db.enrollmentRequests],
        },
        [{ kind: 'iscrizione', title: 'Nuova richiesta di iscrizione', body: `${studentName(db, studentId)} chiede di entrare in ${cls?.name ?? 'una classe'}.`, to: [`teacher:${cls?.teacherId}`, 'admin'], link: { insegnante: '/insegnante/lezioni?tab=richieste', admin: '/admin/classi' } }],
      )
    })

  requestMakeup: OasiRepository['requestMakeup'] = (studentId, targetLessonId, missedLessonId, note) =>
    this.commit((db) => {
      const open = db.makeupRequests.some((r) => r.targetLessonId === targetLessonId && r.studentId === studentId && r.status !== 'rifiutata')
      if (open) return db
      const lesson = db.lessons.find((l) => l.id === targetLessonId)
      const cls = db.classes.find((c) => c.id === lesson?.classId)
      return withNotifications(
        {
          ...db,
          makeupRequests: [{ id: uid('mku'), studentId, targetLessonId, missedLessonId, note, status: 'in_attesa', createdAt: todayISO() }, ...db.makeupRequests],
        },
        [{ kind: 'recupero', title: 'Richiesta di recupero', body: `${studentName(db, studentId)} chiede di recuperare con ${cls?.name ?? 'una classe'}${lesson ? ` ${formatDate(lesson.date, { weekday: true })} alle ${lesson.startTime}` : ''}.`, to: [`teacher:${cls?.teacherId}`, 'admin'], link: { insegnante: '/insegnante/lezioni?tab=richieste', admin: '/admin/classi' } }],
      )
    })

  decideEnrollment: OasiRepository['decideEnrollment'] = (requestId, approve, decidedBy) => {
    const req = this.db.enrollmentRequests.find((r) => r.id === requestId)
    const cls = this.db.classes.find((c) => c.id === req?.classId)
    if (!req || !cls || req.status !== 'in_attesa') return Promise.resolve()
    if (approve && cls.studentIds.length >= cls.capacity) return Promise.reject(new Error('La classe ha raggiunto la capienza massima.'))
    return this.commit((db) => withNotifications({
      ...db,
      enrollmentRequests: db.enrollmentRequests.map((r) =>
        r.id === requestId ? { ...r, status: approve ? 'approvata' : 'rifiutata', decidedAt: todayISO(), decidedBy } : r,
      ),
      classes: approve ? db.classes.map((c) => (c.id === cls.id ? { ...c, studentIds: [...c.studentIds, req.studentId] } : c)) : db.classes,
      students: approve
        ? db.students.map((s) => (s.id === req.studentId ? { ...s, classIds: [...new Set([...s.classIds, cls.id])] } : s))
        : db.students,
    }, [{
      kind: 'iscrizione',
      title: approve ? `Iscrizione confermata: ${cls.name}` : `Iscrizione non accettata: ${cls.name}`,
      body: approve ? 'Le lezioni della classe sono ora nel tuo calendario.' : 'Contatta la segreteria per trovare un’altra classe adatta.',
      to: [`student:${req.studentId}`],
      link: { allieva: approve ? '/allieva/calendario' : '/allieva/classi' },
    }]))
  }

  decideMakeup: OasiRepository['decideMakeup'] = (requestId, approve, decidedBy) => {
    const req = this.db.makeupRequests.find((r) => r.id === requestId)
    const lesson = this.db.lessons.find((l) => l.id === req?.targetLessonId)
    const cls = this.db.classes.find((c) => c.id === lesson?.classId)
    if (!req || !lesson || !cls || req.status !== 'in_attesa') return Promise.resolve()
    if (approve && lesson.status === 'annullata') return Promise.reject(new Error('Quella lezione è stata annullata: rifiuta la richiesta così l’allieva sceglie un’altra data.'))
    const makeups = this.db.makeupRequests.filter((r) => r.targetLessonId === lesson.id && r.status === 'approvata').length
    if (approve && cls.studentIds.length + makeups >= cls.capacity) return Promise.reject(new Error('La lezione non ha più posti disponibili.'))
    return this.commit((db) => withNotifications({
      ...db,
      makeupRequests: db.makeupRequests.map((r) =>
        r.id === requestId ? { ...r, status: approve ? 'approvata' : 'rifiutata', decidedAt: todayISO(), decidedBy } : r,
      ),
    }, [{
      kind: 'recupero',
      title: approve ? 'Recupero confermato' : 'Recupero non accettato',
      body: approve ? `Ti aspettiamo a ${cls.name} ${formatDate(lesson.date, { weekday: true })} alle ${lesson.startTime}.` : `La lezione di ${cls.name} del ${formatDate(lesson.date)} non è disponibile: scegli un’altra data.`,
      to: [`student:${req.studentId}`],
      link: { allieva: '/allieva/calendario' },
    }]))
  }

  cancelRequest: OasiRepository['cancelRequest'] = (kind, requestId) =>
    this.commit((db) =>
      kind === 'enrollment'
        ? { ...db, enrollmentRequests: db.enrollmentRequests.filter((r) => r.id !== requestId) }
        : { ...db, makeupRequests: db.makeupRequests.filter((r) => r.id !== requestId) },
    )

  updateLesson: OasiRepository['updateLesson'] = (lessonId, patch) =>
    this.commit((db) => notifyLessonChange(db, lessonId, patch.status, patch.note, {
      ...db,
      lessons: db.lessons.map((l) => {
        if (l.id !== lessonId) return l
        const cls = db.classes.find((c) => c.id === l.classId)
        const next = { ...l, ...patch }
        if (patch.status === 'regolare' && cls) {
          next.startTime = cls.startTime
          next.endTime = cls.endTime
          next.originalStartTime = undefined
          next.originalEndTime = undefined
          next.note = undefined
        } else if (patch.status === 'variata' && cls) {
          next.originalStartTime = cls.startTime
          next.originalEndTime = cls.endTime
        }
        return next
      }),
    }))

  addStudent: OasiRepository['addStudent'] = (student) =>
    this.commit((db) => ({
      ...db,
      students: [...db.students, student],
      classes: db.classes.map((c) => (student.classIds.includes(c.id) ? { ...c, studentIds: [...new Set([...c.studentIds, student.id])] } : c)),
    }))

  addTeacher: OasiRepository['addTeacher'] = (teacher) => this.commit((db) => ({ ...db, teachers: [...db.teachers, teacher] }))

  saveClosure: OasiRepository['saveClosure'] = (closure) =>
    this.commit((db) => {
      // ripristina le lezioni della versione precedente, poi applica le nuove date
      const restored = db.lessons.map((l) => (l.closureId === closure.id ? restoreLesson(db, l) : l))
      const lessons = applyClosure(restored, closure)
      // Nessun appuntamento incompatibile: i recuperi fissati nei giorni di chiusura vengono annullati
      const closed = new Set(lessons.filter((l) => l.closureId === closure.id).map((l) => l.id))
      const hit = db.makeupRequests.filter((r) => closed.has(r.targetLessonId) && r.status !== 'rifiutata')
      const now = new Date().toISOString()
      const next: OasiDatabase = {
        ...db,
        closures: [...db.closures.filter((c) => c.id !== closure.id), closure].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        lessons,
        makeupRequests: db.makeupRequests.map((r) => (hit.includes(r) ? { ...r, status: 'rifiutata', decidedAt: now, decidedBy: 'admin', note: `${r.note} [Annullato: palestra chiusa]`.trim() } : r)),
      }
      return hit.length
        ? withNotifications(next, [{ kind: 'recupero', title: 'Recupero annullato', body: `La lezione scelta per il recupero cade in un giorno di chiusura (${closure.title}): richiedine un’altra.`, to: [...new Set(hit.map((r) => `student:${r.studentId}`))], link: { allieva: '/allieva/calendario' } }])
        : next
    })

  deleteClosure: OasiRepository['deleteClosure'] = (closureId) =>
    this.commit((db) => ({
      ...db,
      closures: db.closures.filter((c) => c.id !== closureId),
      lessons: db.lessons.map((l) => (l.closureId === closureId ? restoreLesson(db, l) : l)),
    }))

  sendClosureReminder: OasiRepository['sendClosureReminder'] = (closureId) =>
    this.commit((db) => {
      const c = db.closures.find((x) => x.id === closureId)
      if (!c) return db
      const when = c.startDate === c.endDate ? formatDate(c.startDate, { weekday: true }) : `dal ${formatDate(c.startDate)} al ${formatDate(c.endDate)}`
      return withNotifications(
        { ...db, closures: db.closures.map((x) => (x.id === closureId ? { ...x, reminderSentAt: new Date().toISOString() } : x)) },
        [{ kind: 'chiusura', title: `Oasi chiusa: ${c.title}`, body: `Nessuna lezione ${when}.${c.note ? ` ${c.note}` : ''}`, to: ['students', 'teachers'], link: { allieva: '/allieva/calendario', insegnante: '/insegnante/lezioni' } }],
      )
    })

  notify: OasiRepository['notify'] = (n) => this.commit((db) => withNotifications(db, [n]))

  markNotificationsRead: OasiRepository['markNotificationsRead'] = (key, ids) =>
    this.commit((db) => ({
      ...db,
      notifications: db.notifications.map((n) => (ids.includes(n.id) && !n.readBy.includes(key) ? { ...n, readBy: [...n.readBy, key] } : n)),
    }))

  saveFigure: OasiRepository['saveFigure'] = (figure) =>
    this.commit((db) => {
      const exists = db.figures.some((f) => f.id === figure.id)
      return {
        ...db,
        figures: exists ? db.figures.map((f) => (f.id === figure.id ? figure : f)) : [figure, ...db.figures],
      }
    })

  deleteFigure: OasiRepository['deleteFigure'] = (figureId) =>
    this.commit((db) => {
      const progress = Object.fromEntries(
        Object.entries(db.progress).map(([sid, entries]) => {
          const copy = { ...entries }
          delete copy[figureId]
          return [sid, copy]
        }),
      )
      return { ...db, figures: db.figures.filter((f) => f.id !== figureId), progress }
    })

  saveClass: OasiRepository['saveClass'] = (cls) =>
    this.commit((db) => {
      const exists = db.classes.some((c) => c.id === cls.id)
      const discipline = db.disciplines.find((d) => d.id === cls.discipline)
      if (!discipline) throw new Error('Scegli una disciplina configurata')
      if (!discipline.isActive && db.classes.find((c) => c.id === cls.id)?.discipline !== cls.discipline)
        throw new Error(`La disciplina ${discipline.name} è disattivata: riattivala per creare nuove classi`)
      const classes = exists ? db.classes.map((c) => (c.id === cls.id ? cls : c)) : [...db.classes, cls]
      // Mantiene coerenti le iscrizioni lato allieva
      const students = db.students.map((s) => {
        const enrolled = cls.studentIds.includes(s.id)
        const has = s.classIds.includes(cls.id)
        if (enrolled && !has) return { ...s, classIds: [...s.classIds, cls.id] }
        if (!enrolled && has) return { ...s, classIds: s.classIds.filter((id) => id !== cls.id) }
        return s
      })
      let lessons = db.lessons
      if (!exists) {
        // Genera il calendario della nuova classe per le prossime settimane
        const monday = startOfWeek(todayISO())
        const generated = Array.from({ length: 4 }, (_, w) => {
          const date = addDays(monday, w * 7 + cls.weekday - 1)
          return {
            id: `les-${cls.id}-${date}`,
            classId: cls.id,
            date,
            startTime: cls.startTime,
            endTime: cls.endTime,
            status: 'regolare' as const,
            attendance: {},
          }
        })
        // le chiusure già pianificate valgono anche per la nuova classe
        lessons = [...lessons, ...db.closures.reduce(applyClosure, generated)]
      } else {
        // Aggiorna orari delle lezioni future regolari
        const today = todayISO()
        lessons = lessons.map((l) =>
          l.classId === cls.id && l.date >= today && l.status === 'regolare'
            ? { ...l, startTime: cls.startTime, endTime: cls.endTime }
            : l,
        )
      }
      return { ...db, classes, students, lessons }
    })

  deleteClass: OasiRepository['deleteClass'] = (classId) =>
    this.commit((db) => ({
      ...db,
      classes: db.classes.filter((c) => c.id !== classId),
      lessons: db.lessons.filter((l) => l.classId !== classId),
      students: db.students.map((s) => ({ ...s, classIds: s.classIds.filter((id) => id !== classId) })),
    }))

  updateStudent: OasiRepository['updateStudent'] = (studentId, patch) =>
    this.commit((db) => ({
      ...db,
      students: db.students.map((s) => (s.id === studentId ? { ...s, ...patch } : s)),
    }))

  saveEvent: OasiRepository['saveEvent'] = (event) =>
    this.commit((db) => {
      const exists = db.events.some((e) => e.id === event.id)
      const next = { ...db, events: exists ? db.events.map((e) => (e.id === event.id ? event : e)) : [...db.events, event] }
      return exists
        ? next
        : withNotifications(next, [{ kind: 'evento', title: `Nuovo evento: ${event.title}`, body: `${formatDate(event.date, { weekday: true })} · ${event.location}${event.signupDeadline ? ` · iscrizioni entro il ${formatDate(event.signupDeadline)}` : ''}`, to: ['students'], link: { allieva: '/allieva/eventi' } }])
    })

  deleteEvent: OasiRepository['deleteEvent'] = (eventId) =>
    this.commit((db) => ({ ...db, events: db.events.filter((e) => e.id !== eventId) }))

  toggleEventParticipation: OasiRepository['toggleEventParticipation'] = (eventId, studentId) =>
    this.commit((db) => ({
      ...db,
      events: db.events.map((e) => {
        if (e.id !== eventId) return e
        const joined = e.participantIds.includes(studentId)
        return {
          ...e,
          participantIds: joined ? e.participantIds.filter((id) => id !== studentId) : [...e.participantIds, studentId],
        }
      }),
    }))

  saveDiscipline: OasiRepository['saveDiscipline'] = (discipline) =>
    this.commit((db) => {
      const name = discipline.name.trim()
      if (!name) throw new Error('Il nome della disciplina è obbligatorio')
      if (db.disciplines.some((d) => d.id !== discipline.id && d.name.toLowerCase() === name.toLowerCase())) throw new Error('Esiste già una disciplina con questo nome')
      const exists = db.disciplines.some((d) => d.id === discipline.id)
      const item = { ...discipline, name, shortName: discipline.shortName.trim() || name }
      return { ...db, disciplines: exists ? db.disciplines.map((d) => (d.id === item.id ? item : d)) : [...db.disciplines, item] }
    })

  saveDocumentType: OasiRepository['saveDocumentType'] = (type) =>
    this.commit((db) => {
      if (!type.name.trim()) throw new Error('Il nome della tipologia è obbligatorio')
      if (type.signatureMode === 'elettronica' && !type.templateText?.trim()) throw new Error('Per la firma elettronica serve il testo da firmare')
      const exists = db.documentTypes.some((t) => t.id === type.id)
      return { ...db, documentTypes: exists ? db.documentTypes.map((t) => (t.id === type.id ? type : t)) : [...db.documentTypes, type] }
    })

  uploadDocument: OasiRepository['uploadDocument'] = (input) =>
    this.commit((db) => {
      const type = db.documentTypes.find((t) => t.id === input.typeId && t.active)
      if (!type) throw new Error('Tipologia di documento non disponibile')
      if (!db.students.some((s) => s.id === input.memberId)) throw new Error('Profilo non trovato')
      if (input.fileSize > MAX_DOCUMENT_BYTES) throw new Error('Il file supera i 4 MB consentiti nella demo')
      if (!ALLOWED_DOCUMENT_TYPES.includes(input.fileType)) throw new Error('Formato non ammesso: carica un PDF o un’immagine')
      const today = todayISO()
      const expiresOn = input.expiresOn || (type.validityMonths ? addMonths(today, type.validityMonths) : undefined)
      const next = newVersion(db, input.memberId, input.typeId, {
        status: 'in_verifica',
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
        fileData: input.fileData,
        signature: input.signedUpload ? { method: 'caricamento_firmato', signedAt: new Date().toISOString(), signerName: studentName(db, input.memberId) } : undefined,
        uploadedBy: input.uploadedBy,
        expiresOn,
      }, 'caricato')
      return withNotifications(next, [{
        kind: 'documento',
        title: 'Documento da verificare',
        body: `${studentName(db, input.memberId)} ha caricato “${type.name}”.`,
        to: ['admin'],
        link: { admin: `/admin/archivio?stato=in_verifica` },
      }])
    })

  signDocument: OasiRepository['signDocument'] = (memberId, typeId, signerName) =>
    this.commit((db) => {
      const type = db.documentTypes.find((t) => t.id === typeId && t.active)
      if (!type || type.signatureMode !== 'elettronica' || !type.templateText) throw new Error('Questo documento non si firma nell’app')
      const expected = studentName(db, memberId)
      if (signerName.trim().toLowerCase() !== expected.toLowerCase()) throw new Error(`Per firmare scrivi il tuo nome completo: ${expected}`)
      const today = todayISO()
      return newVersion(db, memberId, typeId, {
        status: 'approvato',
        signature: { method: 'elettronica', signedAt: new Date().toISOString(), signerName: expected },
        uploadedBy: memberId,
        expiresOn: type.validityMonths ? addMonths(today, type.validityMonths) : undefined,
      }, 'firmato')
    })

  reviewDocument: OasiRepository['reviewDocument'] = (documentId, decision, note) =>
    this.commit((db) => {
      const doc = db.documents.find((d) => d.id === documentId)
      if (!doc || !doc.current) throw new Error('Si può verificare solo la versione corrente')
      if (decision !== 'approva' && !note.trim()) throw new Error('Spiega all’allieva cosa correggere')
      const status = decision === 'approva' ? 'approvato' : decision === 'rifiuta' ? 'rifiutato' : 'da_sostituire'
      const action = decision === 'approva' ? 'approvato' : decision === 'rifiuta' ? 'rifiutato' : 'sostituzione_richiesta'
      const now = new Date().toISOString()
      const type = db.documentTypes.find((t) => t.id === doc.typeId)
      const next = {
        ...db,
        documents: db.documents.map((d) =>
          d.id === documentId
            ? { ...d, status, reviewNote: note.trim() || undefined, reviewedAt: now, history: [...d.history, { action, at: now, by: 'admin', note: note.trim() || undefined }] }
            : d,
        ),
      } satisfies OasiDatabase
      return withNotifications(next, [{
        kind: 'documento',
        title: decision === 'approva' ? `Documento approvato: ${type?.name}` : `Documento da ricaricare: ${type?.name}`,
        body: decision === 'approva' ? 'La segreteria ha verificato il documento.' : note.trim(),
        to: [`student:${doc.memberId}`],
        link: { allieva: '/allieva/documenti' },
      }])
    })

  saveSharedDocument: OasiRepository['saveSharedDocument'] = (doc) =>
    this.commit((db) => {
      const exists = db.sharedDocuments.some((d) => d.id === doc.id)
      const next = { ...db, sharedDocuments: exists ? db.sharedDocuments.map((d) => (d.id === doc.id ? doc : d)) : [doc, ...db.sharedDocuments] }
      if (exists) return next
      const to = doc.audience === 'tutti' ? ['students', 'teachers'] : doc.audience === 'allieve' ? ['students'] : ['teachers']
      return withNotifications(next, [{ kind: 'documento', title: `Nuovo documento: ${doc.title}`, body: doc.description, to, link: { allieva: '/allieva/documenti' } }])
    })

  deleteSharedDocument: OasiRepository['deleteSharedDocument'] = (id) =>
    this.commit((db) => ({ ...db, sharedDocuments: db.sharedDocuments.filter((d) => d.id !== id) }))

  updateAssociation: OasiRepository['updateAssociation'] = (patch) =>
    this.commit((db) => ({ ...db, association: { ...db.association, ...patch } }))

  reset: OasiRepository['reset'] = () => this.commit(() => createSeedDatabase())
}
