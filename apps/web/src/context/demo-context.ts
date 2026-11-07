import { createContext } from 'react'
import type { DemoPersona, Role } from '@/types'

export interface DemoContextValue {
  persona: DemoPersona | null
  selectRole: (role: Role) => void
  enterAs: (role: Role, userId: string | null) => void
  setUserId: (userId: string) => void
  exit: () => void
}

export const DemoContext = createContext<DemoContextValue | null>(null)

export const DEFAULT_USER: Record<Role, string | null> = {
  allieva: 'stu-giulia',
  insegnante: 'tch-chiara',
  admin: null,
}

export const ROLE_HOME: Record<Role, string> = {
  allieva: '/allieva',
  insegnante: '/insegnante',
  admin: '/admin',
}
