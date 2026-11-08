import { AlertTriangle, CheckCircle2, Clock3, FileWarning, FileX2, Hourglass, CircleDashed } from 'lucide-react'
import type { MemberDocument, OasiDatabase } from '@/types'
import type { DocumentState } from '@/services/documents'
import { formatDate } from '@/lib/dates'

export const STATE_META: Record<DocumentState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'rosa'; icon: typeof Clock3 }> = {
  mancante: { label: 'Mancante', tone: 'neutral', icon: CircleDashed },
  in_verifica: { label: 'In verifica', tone: 'rosa', icon: Hourglass },
  approvato: { label: 'Approvato', tone: 'ok', icon: CheckCircle2 },
  rifiutato: { label: 'Rifiutato', tone: 'danger', icon: FileX2 },
  da_sostituire: { label: 'Da sostituire', tone: 'warn', icon: FileWarning },
  scaduto: { label: 'Scaduto', tone: 'danger', icon: AlertTriangle },
  in_scadenza: { label: 'In scadenza', tone: 'warn', icon: Clock3 },
}

/** Date ISO o timestamp → "12 marzo 2026" */
export const fmtDay = (iso?: string) => (iso ? formatDate(iso.slice(0, 10), { year: true }) : '')

export const ACTION_LABEL: Record<MemberDocument['history'][number]['action'], string> = {
  caricato: 'Caricato',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  sostituzione_richiesta: 'Sostituzione richiesta',
  sostituito: 'Nuova versione',
}

/** Apre il file (demo: data URL salvato nel browser; in produzione URL firmato e temporaneo dall'API) */
export function openDocumentFile(data: string | undefined, name = 'documento') {
  if (!data) return
  try {
    const [meta, b64] = data.split(',')
    const type = meta.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream'
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type }))
    const win = window.open(url, '_blank', 'noopener')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch {
    /* file non leggibile */
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export const actorName = (db: OasiDatabase, id: string) => {
  if (id === 'admin') return 'Segreteria'
  const p = db.students.find((s) => s.id === id) ?? db.teachers.find((t) => t.id === id)
  return p ? `${p.firstName} ${p.lastName}` : id
}

