import { useMemo } from 'react'
import type { DisciplineInfo } from '@/types'
import { useDatabase } from './useDatabase'

const FALLBACK: DisciplineInfo = {
  id: 'altro', name: 'Disciplina', shortName: 'Disciplina', description: '', color: '#8D858B', icon: 'star', hasFigureArchive: false, isActive: false,
}

/** Discipline della palestra (dati, non codice) con accesso per slug */
export function useDisciplines() {
  const db = useDatabase()
  return useMemo(() => {
    const list = db.disciplines ?? []
    const byId = new Map(list.map((d) => [d.id, d]))
    return {
      list,
      active: list.filter((d) => d.isActive),
      get: (id: string): DisciplineInfo => byId.get(id) ?? { ...FALLBACK, id, name: id, shortName: id },
    }
  }, [db.disciplines])
}

/** Colore tenue derivato dal colore della disciplina */
export const softColor = (hex: string) => `color-mix(in srgb, ${hex} 14%, white)`
