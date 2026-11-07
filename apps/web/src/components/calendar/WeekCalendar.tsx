import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Lesson } from '@/types'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { LessonCard } from '@/components/lessons/LessonCard'
import { useDatabase } from '@/hooks/useDatabase'
import { findClass } from '@/services/selectors'
import { addDays, dayNumber, formatDate, formatDateShort, formatDayShort, todayISO, weekDays } from '@/lib/dates'
import { cn } from '@/lib/utils'

type View = 'settimana' | 'giorno'

interface WeekCalendarProps {
  lessons: Lesson[]
  onLessonClick?: (lesson: Lesson) => void
  renderAside?: (lesson: Lesson) => React.ReactNode
}

/** Calendario con vista settimanale e giornaliera */
export function WeekCalendar({ lessons, onLessonClick, renderAside }: WeekCalendarProps) {
  const db = useDatabase()
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [view, setView] = useState<View>('settimana')
  const days = weekDays(selected)

  const byDay = useMemo(() => {
    const map = new Map<string, Lesson[]>()
    for (const l of lessons) {
      const list = map.get(l.date) ?? []
      list.push(l)
      map.set(l.date, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    return map
  }, [lessons])

  const weekLabel = `${formatDateShort(days[0])} – ${formatDateShort(days[6])}`
  const dayLessons = byDay.get(selected) ?? []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="outline" aria-label="Settimana precedente" onClick={() => setSelected(addDays(selected, view === 'giorno' ? -1 : -7))}>
            <ChevronLeft />
          </Button>
          <div className="min-w-32 px-1 text-center">
            <p className="font-display font-bold text-ink capitalize">{view === 'giorno' ? formatDate(selected, { weekday: true }) : weekLabel}</p>
          </div>
          <Button size="icon" variant="outline" aria-label="Settimana successiva" onClick={() => setSelected(addDays(selected, view === 'giorno' ? 1 : 7))}>
            <ChevronRight />
          </Button>
          {selected !== today && (
            <Button size="sm" variant="ghost" onClick={() => setSelected(today)}>
              Oggi
            </Button>
          )}
        </div>
        <Segmented<View>
          value={view}
          onChange={setView}
          size="sm"
          options={[
            { value: 'settimana', label: 'Settimana' },
            { value: 'giorno', label: 'Giorno' },
          ]}
        />
      </div>

      {/* Striscia giorni */}
      <div className="mb-5 grid grid-cols-7 gap-1.5 rounded-3xl bg-white p-1.5 shadow-soft sm:gap-2 sm:p-2">
        {days.map((d) => {
          const items = byDay.get(d) ?? []
          const active = d === selected
          const isToday = d === today
          return (
            <button
              key={d}
              type="button"
              onClick={() => {
                setSelected(d)
                setView('giorno')
              }}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl py-2 transition',
                active && view === 'giorno' ? 'bg-ink text-white' : isToday ? 'bg-cipria text-ink' : 'text-ink-soft hover:bg-cipria-50',
              )}
              aria-label={formatDate(d, { weekday: true })}
            >
              <span className="text-[11px] font-semibold uppercase opacity-75">{formatDayShort(d)}</span>
              <span className="font-display text-lg leading-none font-bold">{dayNumber(d)}</span>
              <span className="flex h-1.5 gap-0.5">
                {items.slice(0, 3).map((l) => {
                  const cls = findClass(db, l.classId)
                  return <span key={l.id} className={cn('size-1.5 rounded-full', l.status === 'annullata' ? 'bg-ink-muted/40' : cls?.discipline === 'cerchio' ? 'bg-cerchio' : 'bg-tessuti')} />
                })}
              </span>
            </button>
          )
        })}
      </div>

      {view === 'giorno' ? (
        <div className="space-y-3">
          {dayLessons.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rosa/50 bg-white/60 p-8 text-center">
              <p className="font-display font-bold text-ink">Nessuna lezione</p>
              <p className="mt-1 text-sm text-ink-muted">Giorno di riposo: stretching e idratazione 🌸</p>
            </div>
          ) : (
            dayLessons.map((l) => <LessonCard key={l.id} lesson={l} onClick={onLessonClick ? () => onLessonClick(l) : undefined} aside={renderAside?.(l)} />)
          )}
        </div>
      ) : (
        <>
          {/* Mobile: elenco per giorno */}
          <div className="space-y-5 md:hidden">
            {days.filter((d) => byDay.get(d)?.length).length === 0 && <p className="rounded-3xl bg-white p-6 text-center text-sm text-ink-muted">Nessuna lezione in questa settimana.</p>}
            {days
              .filter((d) => byDay.get(d)?.length)
              .map((d) => (
                <div key={d}>
                  <p className={cn('mb-2 text-sm font-bold capitalize', d === today ? 'text-rosa-intenso' : 'text-ink-soft')}>
                    {d === today ? 'Oggi · ' : ''}
                    {formatDate(d, { weekday: true })}
                  </p>
                  <div className="space-y-2.5">
                    {byDay.get(d)!.map((l) => (
                      <LessonCard key={l.id} lesson={l} onClick={onLessonClick ? () => onLessonClick(l) : undefined} aside={renderAside?.(l)} />
                    ))}
                  </div>
                </div>
              ))}
          </div>
          {/* Tablet/desktop: griglia settimanale */}
          <div className="hidden grid-cols-7 gap-2 md:grid">
            {days.map((d) => (
              <div key={d} className={cn('min-h-56 rounded-3xl p-2', d === today ? 'bg-cipria/60' : 'bg-white/60')}>
                <p className={cn('mb-2 px-1 text-xs font-bold uppercase', d === today ? 'text-rosa-intenso' : 'text-ink-muted')}>
                  {formatDayShort(d)} {dayNumber(d)}
                </p>
                <div className="space-y-2">
                  {(byDay.get(d) ?? []).map((l) => {
                    const cls = findClass(db, l.classId)
                    if (!cls) return null
                    const cancelled = l.status === 'annullata'
                    const Comp = onLessonClick ? 'button' : 'div'
                    return (
                      <Comp
                        key={l.id}
                        type={onLessonClick ? 'button' : undefined}
                        onClick={onLessonClick ? () => onLessonClick(l) : () => { setSelected(d); setView('giorno') }}
                        className={cn(
                          'block w-full cursor-pointer rounded-2xl border-l-4 bg-white p-2.5 text-left shadow-soft transition hover:shadow-float',
                          cls.discipline === 'cerchio' ? 'border-cerchio' : 'border-tessuti',
                          cancelled && 'opacity-60',
                        )}
                      >
                        <p className={cn('text-xs font-bold text-ink', cancelled && 'line-through')}>
                          {l.startTime}–{l.endTime}
                        </p>
                        <p className="mt-0.5 text-[13px] leading-tight font-semibold text-ink">{cls.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-ink-muted">{cls.room}</p>
                        {l.status !== 'regolare' && (
                          <span className={cn('mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold', cancelled ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>
                            {cancelled ? 'Annullata' : 'Variata'}
                          </span>
                        )}
                      </Comp>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-cerchio" /> Cerchio aereo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-tessuti" /> Tessuti aerei
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-warn" /> Orario variato
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-danger" /> Annullata
        </span>
      </div>
    </div>
  )
}
