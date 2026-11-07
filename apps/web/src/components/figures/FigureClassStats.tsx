import { Link } from 'react-router-dom'
import type { Student } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { StackedBar } from '@/components/common/Charts'
import { STATUS_COLOR, STATUS_STYLE } from '@/lib/statusStyle'
import { useDatabase } from '@/hooks/useDatabase'
import { studentsByFigureStatus } from '@/services/selectors'
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { cn } from '@/lib/utils'

/** Panoramica di come le allieve stanno lavorando sulla figura (dati condivisi con l'area allieva) */
export function FigureClassStats({ figureId, students, studentLinkBase, title = 'Le allieve su questa figura' }: { figureId: string; students: Student[]; studentLinkBase: string; title?: string }) {
  const db = useDatabase()
  const rows = studentsByFigureStatus(db, figureId, students)
  const segments = STATUS_ORDER.map((s) => ({ label: STATUS_LABEL[s], value: rows.filter((r) => r.status === s).length, color: STATUS_COLOR[s] }))

  return (
    <Card>
      <CardContent>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        <StackedBar segments={segments} className="mt-3" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label} <b className="text-ink">{s.value}</b>
            </span>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-line/70">
          {STATUS_ORDER.slice()
            .reverse()
            .flatMap((s) => rows.filter((r) => r.status === s))
            .map(({ student, status, progress }) => (
              <li key={student.id}>
                <Link to={`${studentLinkBase}/${student.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-80">
                  <Avatar person={student} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {student.firstName} {student.lastName}
                    </p>
                    {progress?.note && <p className="truncate text-xs text-ink-muted">“{progress.note}”</p>}
                  </div>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[status].bg, STATUS_STYLE[status].text)}>{STATUS_LABEL[status]}</span>
                </Link>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  )
}
