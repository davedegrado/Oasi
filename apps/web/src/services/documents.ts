import type { DocumentStatus, DocumentType, MemberDocument, OasiDatabase } from '@/types'
import { addDays, todayISO } from '@/lib/dates'

/** Giorni di preavviso per i documenti in scadenza */
export const EXPIRY_WARNING_DAYS = 30

/** Stato visibile: ai quattro stati di verifica si aggiungono mancante, scaduto e in scadenza */
export type DocumentState = DocumentStatus | 'mancante' | 'scaduto' | 'in_scadenza'

export function documentState(doc: MemberDocument | undefined, today = todayISO()): DocumentState {
  if (!doc) return 'mancante'
  if (doc.status === 'approvato' && doc.expiresOn) {
    if (doc.expiresOn < today) return 'scaduto'
    if (doc.expiresOn <= addDays(today, EXPIRY_WARNING_DAYS)) return 'in_scadenza'
  }
  return doc.status
}

/** Lo stato richiede un'azione dell'allieva */
export const needsAction = (s: DocumentState) => s === 'mancante' || s === 'scaduto' || s === 'da_sostituire' || s === 'rifiutato' || s === 'in_scadenza'

export interface MemberDocumentRow {
  type: DocumentType
  doc?: MemberDocument
  state: DocumentState
  /** versioni precedenti (dalla più recente) */
  previous: MemberDocument[]
}

/** Situazione documentale di un profilo: una riga per tipologia attiva (o con documenti caricati) */
export function memberDocuments(db: OasiDatabase, memberId: string, today = todayISO()): MemberDocumentRow[] {
  const mine = (db.documents ?? []).filter((d) => d.memberId === memberId)
  return (db.documentTypes ?? [])
    .filter((t) => t.active || mine.some((d) => d.typeId === t.id))
    .map((type) => {
      const versions = mine.filter((d) => d.typeId === type.id).sort((a, b) => b.version - a.version)
      const doc = versions.find((d) => d.current)
      return { type, doc, state: documentState(doc, today), previous: versions.filter((d) => !d.current) }
    })
    .sort((a, b) => Number(b.type.required) - Number(a.type.required) || a.type.name.localeCompare(b.type.name))
}

export function documentSummary(rows: MemberDocumentRow[]) {
  const required = rows.filter((r) => r.type.required)
  return {
    missing: required.filter((r) => r.state === 'mancante'),
    toFix: rows.filter((r) => r.state === 'da_sostituire' || r.state === 'rifiutato' || (r.state === 'scaduto' && r.type.required)),
    expiring: rows.filter((r) => r.state === 'in_scadenza'),
    pending: rows.filter((r) => r.state === 'in_verifica'),
    complete: required.length > 0 && required.every((r) => r.state === 'approvato' || r.state === 'in_scadenza'),
  }
}

/** Documenti obbligatori mancanti per ogni allieva attiva */
export function missingDocuments(db: OasiDatabase, today = todayISO()) {
  return db.students
    .filter((s) => s.membership.status !== 'sospesa')
    .map((s) => ({ student: s, rows: memberDocuments(db, s.id, today).filter((r) => r.type.required && (r.state === 'mancante' || r.state === 'scaduto')) }))
    .filter((x) => x.rows.length > 0)
}

export function formatBytes(n?: number) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
