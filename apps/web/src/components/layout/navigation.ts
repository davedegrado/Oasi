import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CalendarHeart,
  GraduationCap,
  Home,
  LayoutDashboard,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Modulo richiesto: la voce sparisce se il modulo non è attivo per la palestra */
  module?: string
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  allieva: [
    { to: '/allieva', label: 'Home', icon: Home, end: true },
    { to: '/allieva/calendario', label: 'Calendario', icon: CalendarDays, module: 'calendar' },
    { to: '/allieva/figure', label: 'Figure', icon: Sparkles, module: 'figure_archive' },
    { to: '/allieva/progressi', label: 'Progressi', icon: BarChart3, module: 'progress' },
    { to: '/allieva/profilo', label: 'Profilo', icon: UserRound },
  ],
  insegnante: [
    { to: '/insegnante', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/insegnante/lezioni', label: 'Lezioni', icon: BookOpenCheck },
    { to: '/insegnante/allieve', label: 'Allieve', icon: Users },
    { to: '/insegnante/figure', label: 'Figure', icon: Sparkles, module: 'figure_archive' },
    { to: '/insegnante/profilo', label: 'Profilo', icon: UserRound },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/utenti', label: 'Utenti', icon: Users },
    { to: '/admin/classi', label: 'Classi', icon: GraduationCap, module: 'classes' },
    { to: '/admin/figure', label: 'Archivio', icon: Sparkles, module: 'figure_archive' },
    { to: '/admin/eventi', label: 'Eventi', icon: CalendarHeart, module: 'events' },
    { to: '/admin/gestione', label: 'Gestione', icon: Settings2 },
  ],
}
