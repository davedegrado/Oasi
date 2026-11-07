import { useState } from 'react'
import { Check, Minus, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Ring } from '@/components/common/Charts'
import { useDatabase } from '@/hooks/useDatabase'
import { attendanceRate, studentAttendance } from '@/services/selectors'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Storico presenze: alimentato dal registro compilato dalle insegnanti */
export function AttendanceHistory({ studentId, title = 'Storico presenze' }: { studentId: string; title?: string }) {
  const db = useDatabase()
  const entries = studentAttendance(db, studentId)
  const stats = attendanceRate(entries)
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? entries : entries.slice(0, 6)

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-4">
          <Ring value={stats.rate} size={72} thickness={8} color="#4F9C84">
            <span className="font-display text-base font-extrabold">{stats.rate}%</span>
          </Ring>
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            <p className="text-sm text-ink-muted">
              {stats.present} presenze · {stats.absent} assenze
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Ultime lezioni">
          {entries
            .slice(0, 16)
            .reverse()
            .map((e) => (
              <span
                key={e.lesson.id}
                title={`${formatDate(e.lesson.date)} · ${e.mark ?? 'da registrare'}`}
                className={cn('size-4 rounded-full', e.mark === 'presente' ? 'bg-ok' : e.mark === 'assente' ? 'bg-danger/70' : 'bg-line')}
              />
            ))}
        </div>
        <ul className="mt-4 divide-y divide-line/70">
          {shown.map((e) => (
            <li key={e.lesson.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full',
                  e.mark === 'presente' ? 'bg-ok-soft text-ok' : e.mark === 'assente' ? 'bg-danger-soft text-danger' : 'bg-cipria-100 text-ink-muted',
                )}
              >
                {e.mark === 'presente' ? <Check className="size-4" /> : e.mark === 'assente' ? <X className="size-4" /> : <Minus className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{e.cls?.name}</p>
                <p className="text-xs text-ink-muted capitalize">
                  {formatDate(e.lesson.date, { weekday: true })} · {e.lesson.startTime}
                </p>
              </div>
              <span className={cn('text-xs font-semibold', e.mark === 'presente' ? 'text-ok' : e.mark === 'assente' ? 'text-danger' : 'text-ink-muted')}>
                {e.mark === 'presente' ? 'Presente' : e.mark === 'assente' ? 'Assente' : 'Da registrare'}
              </span>
            </li>
          ))}
        </ul>
        {entries.length > 6 && (
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Mostra meno' : `Mostra tutte (${entries.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
