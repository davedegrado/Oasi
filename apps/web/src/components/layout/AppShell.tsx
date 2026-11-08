import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ArrowLeftRight, Sparkles } from 'lucide-react'
import type { Role } from '@/types'
import { Logo } from '@/components/common/Logo'
import { SilkLines } from '@/components/common/Decor'
import { Avatar } from '@/components/ui/avatar'
import { useDemo, useCurrentStudent, useCurrentTeacher } from '@/hooks/useDemo'
import { ROLE_LABEL } from '@/lib/labels'
import { useTenant } from '@/hooks/useTenant'
import { cn, fullName } from '@/lib/utils'
import { NAVIGATION } from './navigation'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useDatabase } from '@/hooks/useDatabase'
import { pendingRequests } from '@/services/selectors'
import { RoleSwitcher } from './RoleSwitcher'

function usePersonaCard(role: Role) {
  const student = useCurrentStudent()
  const teacher = useCurrentTeacher()
  const { config } = useTenant()
  if (role === 'allieva') return { person: student, name: fullName(student) }
  if (role === 'insegnante') return { person: teacher, name: fullName(teacher) }
  return { person: { id: 'admin', firstName: 'Segreteria', lastName: config.shortName }, name: `Segreteria ${config.shortName}` }
}

export function AppShell({ role }: { role: Role }) {
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const { pathname } = useLocation()
  const { persona } = useDemo()
  const card = usePersonaCard(role)
  const { hasModule } = useTenant()
  const items = NAVIGATION[role].filter((i) => !i.module || hasModule(i.module))
  const bottomItems = items.filter((i) => !i.sidebarOnly)
  const profileItem = items.find((i) => i.sidebarOnly)
  const db = useDatabase()
  const requestCount = role === 'admin' ? pendingRequests(db, null).total : role === 'insegnante' && persona?.userId ? pendingRequests(db, persona.userId).total : 0
  const notificationsPath = `/${role}/notifiche`
  const on = (item: { also?: string[] }, active: boolean) => active || !!item.also?.some((p) => pathname.startsWith(p))
  const docsToReview = role === 'admin' ? (db.documents ?? []).filter((d) => d.current && d.status === 'in_verifica').length : 0
  const countFor = (b?: string) => (b === 'requests' ? requestCount : b === 'documents' ? docsToReview : 0)
  const badge = (b?: string) =>
    countFor(b) > 0 ? (
      <span className="absolute -top-0.5 right-[calc(50%-20px)] grid min-w-[18px] place-items-center rounded-full bg-rosa-intenso px-1 text-[10px] leading-[18px] font-bold text-white ring-2 ring-white">{countFor(b)}</span>
    ) : null

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh lg:pl-72">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-line/70 bg-white/80 px-5 py-6 backdrop-blur-xl lg:flex">
        <SilkLines className="absolute inset-x-0 bottom-28 h-28 w-full text-rosa/40" />
        <NavLink to={items[0].to} className="px-2">
          <Logo />
        </NavLink>
        <div className="mt-6 flex items-center justify-between gap-2 px-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-cipria px-3 py-1 text-xs font-semibold text-rosa-scuro">
            <Sparkles className="size-3" /> Demo · {ROLE_LABEL[role]}
          </span>
          <NotificationBell to={notificationsPath} />
        </div>
        <nav className="relative mt-6 flex flex-col gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive: a }) =>
                cn(
                  'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[15px] font-semibold transition',
                  on(item, a) ? 'bg-cipria text-ink' : 'text-ink-muted hover:bg-cipria-50 hover:text-ink',
                )
              }
            >
              {({ isActive: a }) => (
                <>
                  <span className={cn('grid size-9 place-items-center rounded-full transition', on(item, a) ? 'bg-rosa-intenso text-white shadow-soft' : 'bg-cipria-100 text-ink-soft group-hover:bg-cipria')}>
                    <item.icon className="size-[18px]" />
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {countFor(item.badge) > 0 && (
                    <span className="rounded-full bg-rosa-intenso px-2 py-0.5 text-xs font-bold text-white">{countFor(item.badge)}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="relative mt-auto">
          <button
            type="button"
            onClick={() => setSwitcherOpen(true)}
            className="flex w-full items-center gap-3 rounded-3xl border border-line bg-white p-3 text-left shadow-soft transition hover:border-rosa"
          >
            <Avatar person={card.person} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{card.name}</span>
              <span className="block text-xs text-ink-muted">Cambia ruolo demo</span>
            </span>
            <ArrowLeftRight className="size-4 text-rosa-intenso" />
          </button>
        </div>
      </aside>

      {/* Barra superiore mobile/tablet */}
      <header className="sticky top-0 z-30 border-b border-line/60 bg-cipria-50/85 pt-safe backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <NavLink to={items[0].to} aria-label="Home">
            <Logo />
          </NavLink>
          <div className="flex items-center gap-2">
            <NotificationBell to={notificationsPath} />
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-3 shadow-soft transition active:scale-95"
              aria-label="Cambia ruolo demo"
            >
              <span className="text-xs font-semibold text-ink">{ROLE_LABEL[role]}</span>
              <ArrowLeftRight className="size-3.5 text-rosa-intenso" />
            </button>
            {profileItem ? (
              <NavLink
                to={profileItem.to}
                aria-label="Profilo"
                className={({ isActive }) => cn('rounded-full ring-2 transition active:scale-95', isActive ? 'ring-rosa-intenso' : 'ring-transparent')}
              >
                <Avatar person={card.person} size="sm" />
              </NavLink>
            ) : (
              <Avatar person={card.person} size="sm" />
            )}
          </div>
        </div>
      </header>

      <main key={persona?.userId ?? role} className="mx-auto w-full max-w-3xl px-4 pt-6 pb-32 sm:px-6 lg:max-w-6xl lg:px-10 lg:pt-10 lg:pb-16">
        <Outlet />
      </main>

      {/* Navigazione inferiore mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="Navigazione principale">
        <div className="mx-auto flex max-w-lg items-stretch justify-between rounded-[1.75rem] border border-line/80 bg-white/92 p-1.5 shadow-float backdrop-blur-xl">
          {bottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive: a }) =>
                cn(
                  'relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[1.25rem] py-2 text-[10.5px] font-semibold transition',
                  on(item, a) ? 'bg-cipria text-rosa-scuro' : 'text-ink-muted active:bg-cipria-50',
                )
              }
            >
              <span className="relative w-full">
                <item.icon className="mx-auto size-[21px]" strokeWidth={2} />
                {badge(item.badge)}
              </span>
              <span className="w-full truncate px-0.5 text-center">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <RoleSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </div>
  )
}
