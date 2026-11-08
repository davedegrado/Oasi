import type { ReactNode } from 'react'
import { AlertTriangle, Ban, Clock, MapPin } from 'lucide-react'
import type { Lesson } from '@/types'
import { DisciplineBadge } from '@/components/common/badges'
import { Badge } from '@/components/ui/badge'
import { useDatabase } from '@/hooks/useDatabase'
import { findClass, findTeacher } from '@/services/selectors'
import { formatDate, relativeDayLabel } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'
import { useDisciplines } from '@/hooks/useDisciplines'

interface LessonCardProps {
  lesson: Lesson
  showDate?: boolean
  onClick?: () => void
  aside?: ReactNode
  /** Contenuto sotto la scheda (es. "Ci sarò / Non ci sarò") */
  footer?: ReactNode
  /** Etichette extra accanto alla disciplina (es. "Recupero") */
  badges?: ReactNode
  compact?: boolean
  className?: string
}

export function LessonStatusBadge({ lesson }: { lesson: Lesson }) {
  if (lesson.status === 'annullata')
    return (
      <Badge tone="danger">
        <Ban /> Annullata
      </Badge>
    )
  if (lesson.status === 'variata')
    return (
      <Badge tone="warn">
        <AlertTriangle /> Orario variato
      </Badge>
    )
  return null
}

export function LessonCard({ lesson, showDate, onClick, aside, footer, badges, compact, className }: LessonCardProps) {
  const db = useDatabase()
  const disciplines = useDisciplines()
  const cls = findClass(db, lesson.classId)
  const teacher = findTeacher(db, cls?.teacherId)
  if (!cls) return null
  const cancelled = lesson.status === 'annullata'
  const Comp = onClick ? 'button' : 'div'

  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-3xl border border-line/70 bg-white p-3.5 text-left shadow-soft transition sm:p-4',
        onClick && 'hover:border-rosa/70 hover:shadow-float active:scale-[0.995]',
        cancelled && 'bg-white/70',
        className,
      )}
    >
      <div className="flex w-full items-stretch gap-3.5">
      <span className={cn('w-1.5 shrink-0 rounded-full', cancelled && 'opacity-30')} style={{ background: disciplines.get(cls.discipline).color }} />
      <div className="flex w-16 shrink-0 flex-col justify-center">
        <span className={cn('font-display text-lg leading-none font-extrabold text-ink', cancelled && 'text-ink-muted line-through')}>{lesson.startTime}</span>
        <span className="mt-1 text-xs text-ink-muted">{lesson.endTime}</span>
      </div>
      <div className="min-w-0 flex-1">
        {showDate && <p className="mb-0.5 text-xs font-semibold text-rosa-intenso first-letter:uppercase">{relativeDayLabel(lesson.date) === formatDate(lesson.date) ? formatDate(lesson.date, { weekday: true }) : `${relativeDayLabel(lesson.date)} · ${formatDate(lesson.date)}`}</p>}
        <p className={cn('truncate font-display font-bold text-ink', cancelled && 'text-ink-muted')}>{cls.name}</p>
        {!compact && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            <span>{teacher ? fullName(teacher) : '—'}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {cls.room}
            </span>
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <DisciplineBadge discipline={cls.discipline} />
          <LessonStatusBadge lesson={lesson} />
          {badges}
        </div>
        {lesson.status === 'variata' && lesson.originalStartTime && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
            <Clock className="mt-px size-3.5 shrink-0" />
            <span>
              Era {lesson.originalStartTime}–{lesson.originalEndTime}
              {lesson.note ? ` · ${lesson.note}` : ''}
            </span>
          </p>
        )}
        {lesson.status === 'annullata' && lesson.note && <p className="mt-2 text-xs text-danger">{lesson.note}</p>}
      </div>
      {aside && <div className="flex shrink-0 items-center">{aside}</div>}
      </div>
      {footer && <div className="mt-3 border-t border-line/70 pt-3">{footer}</div>}
    </Comp>
  )
}
