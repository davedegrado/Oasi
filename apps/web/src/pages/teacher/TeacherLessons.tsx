import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Lesson } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { LessonCard } from '@/components/lessons/LessonCard'
import { WeekCalendar } from '@/components/calendar/WeekCalendar'
import { EmptyState } from '@/components/common/EmptyState'
import { RequestsPanel } from '@/components/requests/RequestsPanel'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentTeacher } from '@/hooks/useDemo'
import { expectedAttendance, findClass, findStudent, isLessonPast, lessonsForTeacher, pendingRequests } from '@/services/selectors'
import { RequestStatusBadge } from '@/components/requests/RequestStatusBadge'
import { fullName } from '@/lib/utils'
import { compareDateTime } from '@/lib/dates'

type Tab = 'prossime' | 'storico' | 'richieste'

export function TeacherLessons() {
  const db = useDatabase()
  const teacher = useCurrentTeacher()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'richieste' ? 'richieste' : 'prossime')
  const [classFilter, setClassFilter] = useState<string>('tutte')
  const myClasses = db.classes.filter((c) => c.teacherId === teacher.id)
  const all = lessonsForTeacher(db, teacher.id).filter((l) => classFilter === 'tutte' || l.classId === classFilter)
  const upcoming = all.filter((l) => !isLessonPast(l))
  const history = all.filter((l) => isLessonPast(l)).sort((a, b) => compareDateTime(b, a))
  const open = (l: Lesson) => navigate(`/insegnante/lezioni/${l.id}`)

  const historyAside = (l: Lesson) => {
    if (l.status === 'annullata') return null
    const cls = findClass(db, l.classId)
    const marks = Object.values(l.attendance)
    if (marks.length === 0) return <Badge tone="warn">Da compilare</Badge>
    const present = marks.filter((m) => m === 'presente').length
    return (
      <div className="flex items-center gap-1.5">
        <div className="text-center">
          <p className="font-display text-lg font-extrabold">
            {present}
            <span className="text-sm text-ink-muted">/{cls?.studentIds.length}</span>
          </p>
          <p className="text-[10px] text-ink-muted">presenti</p>
        </div>
        <ChevronRight className="size-4 text-ink-muted" />
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Lezioni" title="Le tue lezioni" description="Prima il calendario, poi le prossime lezioni, lo storico e le richieste." />
      {myClasses.length > 1 && (
        <Segmented
          className="mb-4"
          value={classFilter}
          onChange={setClassFilter}
          size="sm"
          options={[{ value: 'tutte', label: 'Tutte le classi' }, ...myClasses.map((c) => ({ value: c.id, label: c.name }))]}
        />
      )}

      {/* 1. Calendario (vista settimanale) */}
      <section className="mb-8">
        <WeekCalendar lessons={all} onLessonClick={open} />
      </section>

      {/* 2–4. Tre aree distinte */}
      <Segmented<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'prossime', label: 'Prossime lezioni', count: upcoming.length },
          { value: 'storico', label: 'Storico lezioni', count: history.length },
          { value: 'richieste', label: 'Richieste', count: pendingRequests(db, teacher.id).total },
        ]}
      />

      {tab === 'richieste' && (
        <div className="space-y-5">
          <RequestsPanel teacherId={teacher.id} decidedBy={teacher.id} title="Da gestire: iscrizioni e recuperi" />
          <RequestHistory teacherId={teacher.id} />
        </div>
      )}

      {tab === 'prossime' && (
        <div className="space-y-3">
          {upcoming.length === 0 && <EmptyState title="Nessuna lezione in programma" />}
          {upcoming.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              showDate
              onClick={() => open(l)}
              aside={
                l.status !== 'annullata' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="text-center">
                      <p className="font-display text-lg font-extrabold">{expectedAttendance(db, l)}</p>
                      <p className="text-[10px] text-ink-muted">previste</p>
                    </div>
                    <ChevronRight className="size-4 text-ink-muted" />
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {tab === 'storico' && (
        <div className="space-y-3">
          {history.map((l) => (
            <LessonCard key={l.id} lesson={l} showDate onClick={() => open(l)} aside={historyAside(l)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Richieste già gestite delle proprie classi, distinte per tipologia e stato */
function RequestHistory({ teacherId }: { teacherId: string }) {
  const db = useDatabase()
  const mine = new Set(db.classes.filter((c) => c.teacherId === teacherId).map((c) => c.id))
  const rows = [
    ...db.enrollmentRequests.filter((r) => mine.has(r.classId) && r.status !== 'in_attesa').map((r) => ({ id: r.id, kind: 'Iscrizione', status: r.status, studentId: r.studentId, classId: r.classId, date: r.decidedAt ?? r.createdAt })),
    ...db.makeupRequests
      .map((r) => ({ r, lesson: db.lessons.find((l) => l.id === r.targetLessonId) }))
      .filter(({ r, lesson }) => !!lesson && mine.has(lesson.classId) && r.status !== 'in_attesa')
      .map(({ r, lesson }) => ({ id: r.id, kind: 'Recupero', status: r.status, studentId: r.studentId, classId: lesson!.classId, date: r.decidedAt ?? r.createdAt })),
  ].sort((a, b) => b.date.localeCompare(a.date))
  if (rows.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 text-base font-bold">Richieste gestite</h2>
      <ul className="divide-y divide-line/70 rounded-3xl bg-white px-4 shadow-soft">
        {rows.slice(0, 20).map((r) => {
          const s = findStudent(db, r.studentId)
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              <Badge tone={r.kind === 'Iscrizione' ? 'neutral' : 'rosa'}>{r.kind}</Badge>
              <span className="min-w-0 flex-1 truncate">
                <b>{s ? fullName(s) : '—'}</b> · {findClass(db, r.classId)?.name}
              </span>
              <RequestStatusBadge status={r.status} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
