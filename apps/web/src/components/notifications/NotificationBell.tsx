import { NavLink } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useDatabase } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { notificationsFor } from '@/services/selectors'
import { cn } from '@/lib/utils'

export function NotificationBell({ to, className }: { to: string; className?: string }) {
  const db = useDatabase()
  const { persona } = useDemo()
  const { unread } = notificationsFor(db, persona)
  return (
    <NavLink
      to={to}
      aria-label={unread ? `Notifiche, ${unread} da leggere` : 'Notifiche'}
      className={({ isActive }) =>
        cn('relative grid size-9 place-items-center rounded-full border border-line bg-white text-ink-soft shadow-soft transition active:scale-95', isActive && 'border-rosa-intenso text-rosa-intenso', className)
      }
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-rosa-intenso px-1 text-[10px] leading-5 font-bold text-white ring-2 ring-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </NavLink>
  )
}
