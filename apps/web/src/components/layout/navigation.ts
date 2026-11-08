import {
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  CalendarHeart,
  FolderArchive,
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
  /** Solo nella sidebar desktop: su smartphone è nell'header */
  sidebarOnly?: boolean
  /** Contatore di richieste da approvare */
  badge?: 'requests' | 'documents'
  /** Altre sezioni che appartengono a questa voce (es. figure sotto Gestione) */
  also?: string[]
}

export const NAVIGATION: Record<Role, NavItem[]> = {
  allieva: [
    { to: '/allieva', label: 'Home', icon: Home, end: true },
    { to: '/allieva/calendario', label: 'Calendario', icon: CalendarDays, module: 'calendar' },
    { to: '/allieva/figure', label: 'Figure', icon: Sparkles, module: 'figure_archive' },
    { to: '/allieva/progressi', label: 'Progressi', icon: BarChart3, module: 'progress' },
    { to: '/allieva/eventi', label: 'Eventi', icon: CalendarHeart, module: 'events' },
    { to: '/allieva/profilo', label: 'Profilo', icon: UserRound, sidebarOnly: true },
  ],
  insegnante: [
    { to: '/insegnante', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/insegnante/lezioni', label: 'Lezioni', icon: BookOpenCheck, badge: 'requests' },
    { to: '/insegnante/allieve', label: 'Allieve', icon: Users },
    { to: '/insegnante/figure', label: 'Figure', icon: Sparkles, module: 'figure_archive' },
    { to: '/insegnante/eventi', label: 'Eventi', icon: CalendarHeart, module: 'events' },
    { to: '/insegnante/profilo', label: 'Profilo', icon: UserRound, sidebarOnly: true },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/utenti', label: 'Utenti', icon: Users },
    { to: '/admin/classi', label: 'Classi', icon: GraduationCap, module: 'classes', badge: 'requests' },
    { to: '/admin/archivio', label: 'Archivio', icon: FolderArchive, module: 'documents', badge: 'documents' },
    { to: '/admin/eventi', label: 'Eventi', icon: CalendarHeart, module: 'events' },
    { to: '/admin/gestione', label: 'Gestione', icon: Settings2, also: ['/admin/figure'] },
  ],
}
