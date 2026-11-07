import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { DemoPersona, Role } from '@/types'
import { DEFAULT_USER, DemoContext } from './demo-context'

const STORAGE_KEY = 'oasi-demo-persona'

function load(): DemoPersona | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DemoPersona) : null
  } catch {
    return null
  }
}

function save(p: DemoPersona | null) {
  try {
    if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* demo: ignora */
  }
}

/** Gestisce il ruolo demo selezionato (nessuna autenticazione reale) */
export function DemoProvider({ children }: { children: ReactNode }) {
  const [persona, setPersona] = useState<DemoPersona | null>(load)

  const update = useCallback((p: DemoPersona | null) => {
    setPersona(p)
    save(p)
  }, [])

  const value = useMemo(
    () => ({
      persona,
      selectRole: (role: Role) => update({ role, userId: DEFAULT_USER[role] }),
      enterAs: (role: Role, userId: string | null) => update({ role, userId }),
      setUserId: (userId: string) => persona && update({ ...persona, userId }),
      exit: () => update(null),
    }),
    [persona, update],
  )

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}
