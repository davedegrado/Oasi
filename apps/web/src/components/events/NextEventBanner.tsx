import { Link } from 'react-router-dom'
import { CalendarHeart, Clock, MapPin } from 'lucide-react'
import { useDatabase } from '@/hooks/useDatabase'
import { nextMainEvent } from '@/services/selectors'
import { EVENT_TYPE_LABEL } from '@/lib/labels'
import { formatDate } from '@/lib/dates'

/** Home: il prossimo saggio o evento principale, con le informazioni essenziali */
export function NextEventBanner({ to }: { to: string }) {
  const db = useDatabase()
  const event = nextMainEvent(db)
  if (!event) return null
  return (
    <Link to={to} className="flex items-center gap-4 rounded-3xl border border-line/70 bg-white p-4 shadow-soft transition hover:shadow-float">
      <img src={event.image} alt="" className="size-16 shrink-0 rounded-2xl object-cover sm:size-20" loading="lazy" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-rosa-intenso uppercase">
          <CalendarHeart className="size-3.5" /> Prossimo evento · {EVENT_TYPE_LABEL[event.type]}
        </p>
        <p className="mt-0.5 truncate font-display text-lg font-bold text-ink">{event.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-soft">
          <span className="flex items-center gap-1 first-letter:uppercase">
            <Clock className="size-3.5 text-rosa-intenso" /> {formatDate(event.date, { weekday: true })} · {event.startTime}–{event.endTime}
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <MapPin className="size-3.5 shrink-0 text-rosa-intenso" /> <span className="truncate">{event.location}</span>
          </span>
        </p>
      </div>
    </Link>
  )
}
