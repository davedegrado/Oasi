import type { OasiDatabase } from '@/types'
import { createSeedDatabase, DATABASE_VERSION } from '@/data/seed'
import { addDays, startOfWeek, todayISO } from '@/lib/dates'
import type { OasiRepository } from './repository'

const STORAGE_KEY = 'oasi-demo-db'

function loadFromStorage(): OasiDatabase | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as OasiDatabase
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

  private commit(mutator: (draft: OasiDatabase) => OasiDatabase) {
    this.db = mutator(this.db)
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
      const attendance = Object.fromEntries(cls.studentIds.map((id) => [id, mark]))
      return { ...db, lessons: db.lessons.map((l) => (l.id === lessonId ? { ...l, attendance } : l)) }
    })

  updateLesson: OasiRepository['updateLesson'] = (lessonId, patch) =>
    this.commit((db) => ({
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
        lessons = [...lessons, ...generated]
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
      return { ...db, events: exists ? db.events.map((e) => (e.id === event.id ? event : e)) : [...db.events, event] }
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

  updateAssociation: OasiRepository['updateAssociation'] = (patch) =>
    this.commit((db) => ({ ...db, association: { ...db.association, ...patch } }))

  reset: OasiRepository['reset'] = () => this.commit(() => createSeedDatabase())
}
