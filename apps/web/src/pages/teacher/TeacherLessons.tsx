import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Lesson } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { LessonCard } from '@/components/lessons/LessonCard'
import { WeekCalendar } from '@/components/calendar/WeekCalendar'
import { EmptyState } from '@/components/common/EmptyState'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentTeacher } from '@/hooks/useDemo'
import { expectedAttendance, findClass, isLessonPast, lessonsForTeacher } from '@/services/selectors'
import { compareDateTime } from '@/lib/dates'

type Tab = 'prossime' | 'storico' | 'calendario'

export function TeacherLessons() {
  const db = useDatabase()
  const teacher = useCurrentTeacher()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('prossime')
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
      <PageHeader eyebrow="Lezioni" title="Le tue lezioni" description="Apri una lezione per consultare le iscritte e compilare il registro presenze." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'prossime', label: 'Prossime', count: upcoming.length },
            { value: 'storico', label: 'Storico', count: history.length },
            { value: 'calendario', label: 'Calendario' },
          ]}
        />
        <Segmented
          value={classFilter}
          onChange={setClassFilter}
          size="sm"
          options={[{ value: 'tutte', label: 'Tutte le classi' }, ...myClasses.map((c) => ({ value: c.id, label: c.name }))]}
        />
      </div>

      {tab === 'calendario' && <WeekCalendar lessons={all} onLessonClick={open} />}

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
                      <p className="text-[10px] text-ink-muted">iscritte</p>
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
