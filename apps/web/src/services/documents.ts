import type { DocumentStatus, DocumentType, MemberDocument, OasiDatabase } from '@/types'
import { addDays, todayISO } from '@/lib/dates'
import { isCompetitive } from './selectors'

/** Giorni di preavviso per i documenti in scadenza */
export const EXPIRY_WARNING_DAYS = 30

/** Stato visibile: ai quattro stati di verifica si aggiungono mancante, scaduto e in scadenza */
export type DocumentState = DocumentStatus | 'mancante' | 'scaduto' | 'in_scadenza'

export function documentState(doc: MemberDocument | undefined, today = todayISO(), type?: DocumentType): DocumentState {
  if (!doc) return 'mancante'
  // Documento ricorrente (es. mensile): vale solo per il proprio periodo
  if (type?.recurrence === 'mensile' && doc.periodKey !== today.slice(0, 7)) return 'mancante'
  if (doc.status === 'approvato' && doc.expiresOn) {
    if (doc.expiresOn < today) return 'scaduto'
    if (doc.expiresOn <= addDays(today, EXPIRY_WARNING_DAYS)) return 'in_scadenza'
  }
  return doc.status
}

/** Lo stato richiede un'azione dell'atleta */
export const needsAction = (s: DocumentState) => s === 'mancante' || s === 'scaduto' || s === 'da_sostituire' || s === 'rifiutato' || s === 'in_scadenza'

/** Documento senza tipologia: chi carica sceglie il titolo e, se serve, la scadenza */
export const FREE_TYPE: DocumentType = {
  id: '',
  name: 'Altro documento',
  category: 'altro',
  description: 'Un documento qualsiasi: dagli un titolo e indica la data di scadenza.',
  required: false,
  signatureMode: 'nessuna',
  sensitive: false,
  active: true,
}

/** "Posto" di un documento: per i liberi e le tipologie che ne chiedono più d'uno conta il titolo */
export const documentSlot = (type: DocumentType | undefined, title: string | undefined) =>
  !type || type.id === '' || (type.requiredCount ?? 1) > 1 ? (title ?? '').trim().toLowerCase() : ''

export interface MemberDocumentRow {
  key: string
  type: DocumentType
  doc?: MemberDocument
  state: DocumentState
  /** versioni precedenti (dalla più recente) */
  previous: MemberDocument[]
  /** Titolo del documento (liberi e tipologie con più documenti) */
  title?: string
  /** Al caricamento serve un titolo */
  needsTitle?: boolean
}

/**
 * Situazione documentale di un profilo: una riga per tipologia attiva (o con documenti caricati);
 * per le tipologie che chiedono più documenti, una riga per documento più una per ogni mancante;
 * in fondo i documenti liberi, senza tipologia.
 */
/** Scadenza obbligatoria: la decide la tipologia (Archivio → Tipologie); i documenti liberi la chiedono sempre */
export function expiryRequired(_db: OasiDatabase, type: DocumentType | undefined): boolean {
  return !type || type.id === FREE_TYPE.id || type.expiryRequired === true
}

export function memberDocuments(db: OasiDatabase, memberId: string, today = todayISO()): MemberDocumentRow[] {
  const mine = (db.documents ?? []).filter((d) => d.memberId === memberId)
  const competitive = isCompetitive(db, memberId)
  const who = db.teachers.some((t) => t.id === memberId) ? 'insegnanti' : 'allieve'
  const sameSlot = (a: MemberDocument, b: MemberDocument) => a.typeId === b.typeId && (a.title ?? '').toLowerCase() === (b.title ?? '').toLowerCase()
  const history = (doc: MemberDocument) => mine.filter((d) => !d.current && sameSlot(d, doc)).sort((a, b) => b.version - a.version)
  const typed = (db.documentTypes ?? [])
    // Solo le tipologie destinate a questo profilo (atleti o insegnanti)
    .filter((t) => (t.audience ?? 'allieve') === 'tutti' || (t.audience ?? 'allieve') === who || mine.some((d) => d.typeId === t.id))
    // Le tipologie per soli agonisti non compaiono ai non agonisti (a meno che abbiano già caricato qualcosa)
    .filter((t) => (t.active && (!t.requiredForCompetitive || t.required || competitive)) || mine.some((d) => d.typeId === t.id))
    // "required" diventa l'obbligo effettivo per questa persona
    .map((t) => ({ ...t, required: t.required || (!!t.requiredForCompetitive && competitive) }))
    .sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name))
    .flatMap((type): MemberDocumentRow[] => {
      const count = type.requiredCount ?? 1
      if (count <= 1) {
        const versions = mine.filter((d) => d.typeId === type.id).sort((a, b) => b.version - a.version)
        const doc = versions.find((d) => d.current)
        return [{ key: type.id, type, doc, state: documentState(doc, today, type), previous: versions.filter((d) => !d.current) }]
      }
      // Più documenti per periodo, ciascuno con il suo titolo
      const inPeriod = mine.filter((d) => d.typeId === type.id && d.current && (type.recurrence !== 'mensile' || d.periodKey === today.slice(0, 7)))
      const rows: MemberDocumentRow[] = inPeriod.map((doc) => ({ key: doc.id, type, doc, state: documentState(doc, today, type), previous: history(doc), title: doc.title }))
      for (let i = inPeriod.length; i < count; i++) rows.push({ key: `${type.id}:${i}`, type, state: 'mancante', previous: [], needsTitle: true, title: undefined })
      return rows
    })
  const free = mine
    .filter((d) => d.typeId === '' && d.current)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map((doc): MemberDocumentRow => ({ key: doc.id, type: { ...FREE_TYPE, name: doc.title ?? FREE_TYPE.name }, doc, state: documentState(doc, today), previous: history(doc), title: doc.title }))
  return [...typed, ...free]
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

/** Termine del periodo corrente di un documento ricorrente (mensile: ultimo giorno del mese) */
export function periodDue(today = todayISO()): string {
  const [y, m] = today.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${today.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

/** Documenti obbligatori mancanti per ogni atleta attiva e per ogni insegnante */
export function missingDocuments(db: OasiDatabase, today = todayISO()) {
  return [...db.students.filter((s) => s.membership.status !== 'sospesa'), ...db.teachers]
    .map((s) => ({ student: s, rows: memberDocuments(db, s.id, today).filter((r) => r.type.required && (r.state === 'mancante' || r.state === 'scaduto')) }))
    .filter((x) => x.rows.length > 0)
}

export function formatBytes(n?: number) {
  if (!n) return ''
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
}
