import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CalendarHeart, DoorClosed } from 'lucide-react'
import { WeekCalendar } from '@/components/calendar/WeekCalendar'
import { Card, CardContent } from '@/components/ui/card'
import { useDatabase } from '@/hooks/useDatabase'
import { EVENT_TYPE_LABEL } from '@/lib/labels'
import { CLOSURE_KIND_LABEL } from '@/components/closures/closureLabels'

/**
 * Calendario generale della palestra: tutte le lezioni di tutte le classi,
 * le chiusure (che annullano le lezioni nei calendari di allieve e insegnanti)
 * e gli eventi. Le chiusure si gestiscono subito sotto.
 */
export function GeneralCalendar() {
  const db = useDatabase()
  const closureOn = useMemo(() => (date: string) => db.closures.filter((c) => c.startDate <= date && c.endDate >= date), [db.closures])
  const eventsOn = (date: string) => db.events.filter((e) => e.date === date)

  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 text-base font-bold">Calendario generale</h2>
        <p className="mb-4 text-sm text-ink-muted">Tutte le lezioni, le chiusure e gli eventi. Ciò che cambi qui si riflette nei calendari di allieve e insegnanti.</p>
        <WeekCalendar
          lessons={db.lessons}
          initialView="mese"
          markDay={(d) => ({ closed: closureOn(d).length > 0, event: eventsOn(d).length > 0 })}
          renderDayHeader={(d) => (
            <>
              {closureOn(d).map((c) => (
                <a key={c.id} href="#chiusure" className="flex items-start gap-3 rounded-3xl bg-danger-soft p-3.5 text-sm text-danger">
                  <DoorClosed className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>{CLOSURE_KIND_LABEL[c.kind]}: {c.title}</strong>
                    <span className="block text-ink-soft">Lezioni annullate per tutti{c.note ? ` · ${c.note}` : ''}</span>
                  </span>
                </a>
              ))}
              {eventsOn(d).map((e) => (
                <Link key={e.id} to="/admin/eventi" className="flex items-start gap-3 rounded-3xl bg-cipria p-3.5 text-sm text-rosa-scuro">
                  <CalendarHeart className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <strong>{EVENT_TYPE_LABEL[e.type]}: {e.title}</strong>
                    <span className="block text-ink-soft">{e.startTime}–{e.endTime} · {e.location} · {e.participantIds.length}/{e.capacity} iscritte</span>
                  </span>
                </Link>
              ))}
            </>
          )}
        />
      </CardContent>
    </Card>
  )
}
