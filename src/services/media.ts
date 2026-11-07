import { demoPhotoLibrary } from '@/data/figures'
import type { Discipline } from '@/types'

/**
 * Libreria immagini disponibile per comporre le sequenze.
 * In produzione verrà sostituita da uno storage remoto (es. Supabase Storage).
 */
export function getPhotoLibrary(discipline?: Discipline): string[] {
  if (!discipline) return demoPhotoLibrary
  return demoPhotoLibrary.filter((src) => src.includes(`/${discipline}-`))
}
