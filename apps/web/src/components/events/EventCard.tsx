import type { ReactNode } from 'react'
import { Clock, MapPin, Users } from 'lucide-react'
import type { OasiEvent } from '@/types'
import { Badge } from '@/components/ui/badge'
import { EVENT_TYPE_LABEL } from '@/lib/labels'
import { dayNumber, monthShort } from '@/lib/dates'
import { cn } from '@/lib/utils'

interface EventCardProps {
  event: OasiEvent
  footer?: ReactNode
  variant?: 'vertical' | 'horizontal'
  className?: string
}

export function EventDate({ date, className }: { date: string; className?: string }) {
  return (
    <span className={cn('flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-ink shadow-soft', className)}>
      <span className="font-display text-xl leading-none font-extrabold">{dayNumber(date)}</span>
      <span className="text-[11px] font-semibold text-rosa-intenso uppercase">{monthShort(date)}</span>
    </span>
  )
}

export function EventCard({ event, footer, variant = 'vertical', className }: EventCardProps) {
  const spots = event.capacity - event.participantIds.length
  if (variant === 'horizontal') {
    return (
      <div className={cn('flex items-center gap-3.5 rounded-3xl border border-line/70 bg-white p-3 shadow-soft', className)}>
        <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl">
          <img src={event.image} alt="" className="size-full object-cover" loading="lazy" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rosa-intenso">
            {dayNumber(event.date)} {monthShort(event.date)} · {event.startTime}
          </p>
          <p className="line-clamp-2 font-display leading-snug font-bold text-ink">{event.title}</p>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{event.location}</p>
        </div>
        {footer}
      </div>
    )
  }
  return (
    <article className={cn('flex flex-col overflow-hidden rounded-3xl border border-line/70 bg-white shadow-soft', className)}>
      <div className="relative aspect-[16/9] overflow-hidden">
        <img src={event.image} alt="" className="size-full object-cover transition duration-700 hover:scale-105" loading="lazy" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/40 to-transparent" />
        <EventDate date={event.date} className="absolute top-3 left-3" />
        <Badge tone="white" className="absolute top-3 right-3">
          {EVENT_TYPE_LABEL[event.type]}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-lg leading-snug font-bold text-ink">{event.title}</h3>
        <div className="mt-2 grid gap-1 text-sm text-ink-muted">
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-rosa" /> {event.startTime} – {event.endTime}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-rosa" /> <span className="truncate">{event.location}</span>
          </span>
          <span className="flex items-center gap-2">
            <Users className="size-4 text-rosa" /> {event.participantIds.length} adesioni · {spots > 0 ? `${spots} posti liberi` : 'completo'}
          </span>
        </div>
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">{event.description}</p>
        {footer && <div className="mt-4 flex flex-wrap gap-2 pt-1">{footer}</div>}
      </div>
    </article>
  )
}
