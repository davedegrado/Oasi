import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Lesson } from '@/types'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { LessonCard } from '@/components/lessons/LessonCard'
import { useDatabase } from '@/hooks/useDatabase'
import { findClass } from '@/services/selectors'
import { addDays, dayNumber, formatDate, formatDateShort, formatDayShort, monthDays, monthLabel, todayISO, weekDays } from '@/lib/dates'
import { cn } from '@/lib/utils'

type View = 'mese' | 'settimana' | 'giorno'

interface WeekCalendarProps {
  lessons: Lesson[]
  onLessonClick?: (lesson: Lesson) => void
  /** Se definito, solo queste lezioni sono cliccabili */
  canClick?: (lesson: Lesson) => boolean
  renderAside?: (lesson: Lesson) => React.ReactNode
  renderFooter?: (lesson: Lesson) => React.ReactNode
  renderBadges?: (lesson: Lesson) => React.ReactNode
  initialView?: View
}

/** Calendario con vista settimanale e giornaliera */
export function WeekCalendar({ lessons, onLessonClick, canClick, renderAside, renderFooter, renderBadges, initialView = 'settimana' }: WeekCalendarProps) {
  const db = useDatabase()
  const today = todayISO()
  const [selected, setSelected] = useState(today)
  const [view, setView] = useState<View>(initialView)
  const clickable = (l: Lesson) => !!onLessonClick && (!canClick || canClick(l))
  const card = (l: Lesson) => (
    <LessonCard
      key={l.id}
      lesson={l}
      onClick={clickable(l) ? () => onLessonClick!(l) : undefined}
      aside={renderAside?.(l)}
      footer={renderFooter?.(l)}
      badges={renderBadges?.(l)}
    />
  )
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
  const step = view === 'giorno' ? 1 : view === 'settimana' ? 7 : 0
  const move = (dir: 1 | -1) => {
    if (view === 'mese') {
      const [y, m] = selected.split('-').map(Number)
      const d = new Date(y, m - 1 + dir, 1)
      setSelected(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    } else setSelected(addDays(selected, dir * step))
  }
  const dayLessons = byDay.get(selected) ?? []

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Button size="icon" variant="outline" aria-label="Periodo precedente" onClick={() => move(-1)}>
            <ChevronLeft />
          </Button>
          <div className="min-w-32 px-1 text-center">
            <p className="font-display font-bold text-ink first-letter:uppercase">{view === 'giorno' ? formatDate(selected, { weekday: true }) : view === 'mese' ? monthLabel(selected) : weekLabel}</p>
          </div>
          <Button size="icon" variant="outline" aria-label="Periodo successivo" onClick={() => move(1)}>
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
            { value: 'mese', label: 'Mese' },
            { value: 'settimana', label: 'Settimana' },
            { value: 'giorno', label: 'Giorno' },
          ]}
        />
      </div>

      {view === 'mese' && (
        <div className="mb-5 rounded-3xl bg-white p-2 shadow-soft sm:p-3">
          <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-ink-muted uppercase">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map((d) => (
              <span key={d} className="py-1">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays(selected).map(({ date, inMonth }) => {
              const items = byDay.get(date) ?? []
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    setSelected(date)
                    setView('giorno')
                  }}
                  className={cn(
                    'flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl text-sm transition sm:aspect-[4/3]',
                    !inMonth && 'opacity-35',
                    date === today ? 'bg-ink font-bold text-white' : 'hover:bg-cipria-50',
                  )}
                  aria-label={`${formatDate(date, { weekday: true })}: ${items.length} lezioni`}
                >
                  <span className="font-display font-semibold">{dayNumber(date)}</span>
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
        </div>
      )}

      {/* Striscia giorni */}
      {view !== 'mese' && (
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
      )}

      {view === 'mese' ? null : view === 'giorno' ? (
        <div className="space-y-3">
          {dayLessons.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-rosa/50 bg-white/60 p-8 text-center">
              <p className="font-display font-bold text-ink">Nessuna lezione</p>
              <p className="mt-1 text-sm text-ink-muted">Giorno di riposo: stretching e idratazione 🌸</p>
            </div>
          ) : (
            dayLessons.map(card)
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
                  <p className={cn('mb-2 text-sm font-bold first-letter:uppercase', d === today ? 'text-rosa-intenso' : 'text-ink-soft')}>
                    {d === today ? 'Oggi · ' : ''}
                    {formatDate(d, { weekday: true })}
                  </p>
                  <div className="space-y-2.5">
                    {byDay.get(d)!.map(card)}
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
                    return (
                      <button
                        key={l.id}
                        type="button"
                        onClick={clickable(l) ? () => onLessonClick!(l) : () => { setSelected(d); setView('giorno') }}
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
                        {renderBadges?.(l)}
                      </button>
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
