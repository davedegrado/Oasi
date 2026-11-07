import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Input } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { ProgressBar } from '@/components/ui/progress'
import { EmptyState } from '@/components/common/EmptyState'
import { LevelBadge, MembershipBadge } from '@/components/common/badges'
import { useDatabase } from '@/hooks/useDatabase'
import { useCurrentTeacher } from '@/hooks/useDemo'
import { attendanceRate, findClass, progressSummary, studentAttendance, studentsOfTeacher } from '@/services/selectors'
import { fullName, normalize } from '@/lib/utils'

export function TeacherStudents() {
  const db = useDatabase()
  const teacher = useCurrentTeacher()
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState('tutte')
  const myClasses = db.classes.filter((c) => c.teacherId === teacher.id)
  const students = studentsOfTeacher(db, teacher.id)
    .filter((s) => classId === 'tutte' || s.classIds.includes(classId))
    .filter((s) => !query || normalize(fullName(s)).includes(normalize(query)))
    .sort((a, b) => a.lastName.localeCompare(b.lastName))

  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="Allieve" title="Le tue allieve" description="Presenze e progressi aggiornati in tempo reale dalle schede figure delle allieve." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome" className="pl-11" aria-label="Cerca allieva" />
        </div>
        <Segmented value={classId} onChange={setClassId} size="sm" options={[{ value: 'tutte', label: 'Tutte' }, ...myClasses.map((c) => ({ value: c.id, label: c.name }))]} />
      </div>

      {students.length === 0 ? (
        <EmptyState title="Nessuna allieva trovata" />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {students.map((s) => {
            const att = attendanceRate(studentAttendance(db, s.id))
            const prog = progressSummary(db, s.id)
            return (
              <Link key={s.id} to={`/insegnante/allieve/${s.id}`} className="group flex items-center gap-3.5 rounded-3xl border border-line/70 bg-white p-4 shadow-soft transition hover:border-rosa/70 hover:shadow-float">
                <Avatar person={s} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-display text-[17px] font-bold">{fullName(s)}</p>
                  </div>
                  <p className="truncate text-xs text-ink-muted">{s.classIds.map((id) => findClass(db, id)?.name).filter(Boolean).join(' · ')}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <LevelBadge level={s.level} />
                    {s.membership.status !== 'attiva' && <MembershipBadge status={s.membership.status} />}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <p className="flex justify-between text-[11px] text-ink-muted">
                        Presenze <b className="text-ink">{att.rate}%</b>
                      </p>
                      <ProgressBar value={att.rate} className="mt-1 h-1.5" barClassName="from-ok/70 to-ok" />
                    </div>
                    <div>
                      <p className="flex justify-between text-[11px] text-ink-muted">
                        Figure <b className="text-ink">{prog.counts.riuscita}/{prog.total}</b>
                      </p>
                      <ProgressBar value={prog.completion} className="mt-1 h-1.5" />
                    </div>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-rosa-intenso" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
