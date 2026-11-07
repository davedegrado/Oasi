import { useSyncExternalStore } from 'react'
import { repository } from '@/services'

/** Snapshot reattivo del database demo (si aggiorna a ogni modifica) */
export function useDatabase() {
  return useSyncExternalStore(repository.subscribe, repository.getSnapshot, repository.getSnapshot)
}

/** Accesso alle operazioni di scrittura */
export function useRepository() {
  return repository
}
