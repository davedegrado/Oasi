import { LocalRepository } from './localRepository'
import type { OasiRepository } from './repository'

/**
 * Punto unico di scelta dell'implementazione dati.
 * In futuro: `export const repository = new SupabaseRepository(client)`.
 */
export const repository: OasiRepository = new LocalRepository()

export type { OasiRepository }
