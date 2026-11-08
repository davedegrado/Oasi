import { useNavigate } from 'react-router-dom'
import { BellOff, CalendarClock, CalendarHeart, CheckCheck, DoorClosed, FileText, GraduationCap, Megaphone, RefreshCcw } from 'lucide-react'
import type { AppNotification, NotificationKind, Role } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Button } from '@/components/ui/button'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { notificationsFor } from '@/services/selectors'
import { relativeDayLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'

const ICONS: Record<NotificationKind, typeof Megaphone> = {
  iscrizione: GraduationCap,
  recupero: RefreshCcw,
  variazione: CalendarClock,
  chiusura: DoorClosed,
  evento: CalendarHeart,
  comunicazione: Megaphone,
  documento: FileText,
}

/** Centro notifiche (nella versione reale si aggiungeranno le notifiche push) */
export function NotificationsPage() {
  const db = useDatabase()
  const repo = useRepository()
  const navigate = useNavigate()
  const { persona } = useDemo()
  const { list, unread, me } = notificationsFor(db, persona)
  const role = (persona?.role ?? 'allieva') as Role

  const open = async (n: AppNotification) => {
    await repo.markNotificationsRead(me, [n.id])
    const to = n.link?.[role]
    if (to) navigate(to)
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Notifiche"
        title="Novità per te"
        description="Variazioni, recuperi, iscrizioni, chiusure ed eventi."
        actions={
          unread > 0 ? (
            <Button size="sm" variant="soft" onClick={() => repo.markNotificationsRead(me, list.map((n) => n.id))}>
              <CheckCheck /> Segna tutte come lette
            </Button>
          ) : undefined
        }
      />
      {list.length === 0 ? (
        <EmptyState title="Nessuna notifica" description="Qui troverai gli avvisi della palestra." />
      ) : (
        <ul className="space-y-2.5">
          {list.map((n) => {
            const Icon = ICONS[n.kind] ?? BellOff
            const isUnread = !n.readBy.includes(me)
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-3xl border p-4 text-left shadow-soft transition hover:border-rosa',
                    isUnread ? 'border-rosa/60 bg-white' : 'border-line/70 bg-white/60',
                  )}
                >
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', isUnread ? 'bg-rosa-intenso text-white' : 'bg-cipria-100 text-ink-muted')}>
                    <Icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={cn('font-semibold', isUnread ? 'text-ink' : 'text-ink-soft')}>{n.title}</span>
                      {isUnread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-rosa-intenso" aria-label="Da leggere" />}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">{n.body}</span>
                    <span className="mt-1 block text-xs text-ink-muted first-letter:uppercase">{relativeDayLabel(n.createdAt.slice(0, 10))}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-6 text-center text-xs text-ink-muted">Nella versione definitiva questi avvisi arriveranno anche come notifiche push sul telefono.</p>
    </div>
  )
}
