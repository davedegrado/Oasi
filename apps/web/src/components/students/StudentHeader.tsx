import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Student } from '@/types'
import { Avatar } from '@/components/ui/avatar'
import { DisciplineBadge, LevelBadge, MembershipBadge } from '@/components/common/badges'
import { HoopArc } from '@/components/common/Decor'
import { useDatabase } from '@/hooks/useDatabase'
import { findClass, findTeacher } from '@/services/selectors'
import { ageFrom, formatDate } from '@/lib/dates'
import { fullName } from '@/lib/utils'

export function StudentHeader({ student, actions, classesLink }: { student: Student; actions?: ReactNode; classesLink?: string }) {
  const db = useDatabase()
  const classes = student.classIds.map((id) => findClass(db, id)).filter((c) => !!c)
  const teachers = [...new Set(classes.map((c) => c.teacherId))].map((id) => findTeacher(db, id)).filter((t) => !!t)

  return (
    <div className="relative overflow-hidden rounded-4xl bg-white p-5 shadow-soft sm:p-7">
      <HoopArc className="absolute -top-16 -right-16 size-56 text-rosa/30" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar person={student} size="xl" ring className="shadow-float" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={student.level} />
            <DisciplineBadge discipline={student.mainDiscipline} />
            <MembershipBadge status={student.membership.status} />
          </div>
          <h1 className="mt-2 text-3xl font-extrabold text-ink">{fullName(student)}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {ageFrom(student.birthDate)} anni · allieva dal {formatDate(student.joinedAt, { year: true })}
          </p>
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      <div className="relative mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-cipria-50 p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Classi frequentate</p>
          <ul className="mt-2 space-y-1.5">
            {classes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink">{c.name}</span>
                <DisciplineBadge discipline={c.discipline} />
              </li>
            ))}
            {classes.length === 0 && <li className="text-sm text-ink-muted">Nessuna classe assegnata</li>}
          </ul>
          {classesLink && (
            <Link to={classesLink} className="mt-3 inline-block text-sm font-semibold text-rosa-intenso">
              Iscriviti a un altro corso →
            </Link>
          )}
        </div>
        <div className="rounded-3xl bg-cipria-50 p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-muted uppercase">Insegnanti</p>
          <ul className="mt-2 space-y-1.5">
            {teachers.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Avatar person={t} size="xs" />
                <span className="font-semibold text-ink">{fullName(t)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
