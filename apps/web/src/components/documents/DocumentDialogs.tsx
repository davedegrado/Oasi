import { useState } from 'react'
import { Download, FileCheck2, FileText, History, RefreshCcw, Upload, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { formatBytes, type MemberDocumentRow } from '@/services/documents'
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/services/localRepository'
import type { DocumentDecision } from '@/services/repository'
import { DOCUMENT_CATEGORY_LABEL } from '@/lib/labels'
import { DocumentStateBadge } from './DocumentBits'
import { ACTION_LABEL, actorName, fmtDay, openDocumentFile, readFileAsDataUrl } from './documentUtils'

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Operazione non riuscita')

export function UploadDocumentDialog({ row, memberId, uploadedBy, onClose }: { row: MemberDocumentRow; memberId: string; uploadedBy: string; onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [signed, setSigned] = useState(false)
  const [expires, setExpires] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { type } = row

  const submit = async () => {
    if (!file) return setError('Scegli un file da caricare')
    if (file.size > MAX_DOCUMENT_BYTES) return setError('Il file supera i 4 MB consentiti')
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) return setError('Formato non ammesso: carica un PDF o un’immagine (JPG, PNG)')
    if (type.signatureMode === 'caricamento_firmato' && !signed) return setError('Il modulo va caricato firmato a mano: conferma la firma')
    setBusy(true)
    try {
      const fileData = await readFileAsDataUrl(file)
      await repo.uploadDocument({ memberId, typeId: type.id, uploadedBy, fileName: file.name, fileType: file.type, fileSize: file.size, fileData, signedUpload: signed, expiresOn: expires || undefined })
      toast(uploadedBy === 'admin' ? 'Documento caricato nel profilo' : 'Documento inviato alla segreteria per la verifica')
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={row.doc ? `Sostituisci: ${type.name}` : `Carica: ${type.name}`}
      description={type.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={busy}>
            <Upload /> {busy ? 'Caricamento…' : 'Carica'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {row.doc?.reviewNote && row.doc.status !== 'approvato' && (
          <p className="rounded-2xl bg-warn-soft p-3 text-sm text-ink-soft">
            <strong>Nota della segreteria:</strong> {row.doc.reviewNote}
          </p>
        )}
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-rosa/50 bg-cipria-50 px-4 py-6 text-center">
          <FileText className="size-7 text-rosa-intenso" />
          <span className="font-semibold text-ink">{file ? file.name : 'Scegli un file o scatta una foto'}</span>
          <span className="text-xs text-ink-muted">{file ? formatBytes(file.size) : 'PDF, JPG o PNG · massimo 4 MB'}</span>
          <input
            type="file"
            className="sr-only"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError('')
            }}
          />
        </label>
        {type.signatureMode === 'caricamento_firmato' && (
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" className="mt-0.5 size-4 accent-rosa-intenso" checked={signed} onChange={(e) => setSigned(e.target.checked)} />
            Confermo che il documento è firmato a mano (scansione o foto del modulo firmato).
          </label>
        )}
        {(type.validityMonths || type.category === 'certificato_medico') && (
          <Field label="Data di scadenza (se indicata sul documento)" htmlFor="doc-exp" hint={type.validityMonths ? `Se vuota: ${type.validityMonths} mesi da oggi` : undefined}>
            <Input id="doc-exp" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        )}
        {row.doc && <p className="text-xs text-ink-muted">La versione attuale resta nello storico: nessun documento viene cancellato.</p>}
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}

/** Dettaglio: anteprima, dati, storico delle versioni e (per la segreteria) verifica */
export function DocumentDetailDialog({ row, mode, onClose, onReplace }: { row: MemberDocumentRow; mode: 'allieva' | 'admin'; onClose: () => void; onReplace?: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const { type, doc, state, previous } = row

  const decide = async (decision: DocumentDecision) => {
    try {
      await repo.reviewDocument(doc!.id, decision, note)
      toast(decision === 'approva' ? 'Documento approvato' : 'Richiesta inviata all’allieva')
      onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const history = [doc, ...previous].filter(Boolean).flatMap((d) => d!.history.map((h) => ({ ...h, version: d!.version }))).sort((a, b) => b.at.localeCompare(a.at))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={type.name} description={`${DOCUMENT_CATEGORY_LABEL[type.category]}${type.required ? ' · obbligatorio' : ''}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DocumentStateBadge state={state} />
          {doc && <span className="text-sm text-ink-muted">Versione {doc.version}</span>}
        </div>
        {!doc ? (
          <p className="text-sm text-ink-soft">{type.description}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-2xl bg-cipria-50 p-4 text-sm">
            <dt className="text-ink-muted">Intestatario</dt>
            <dd className="font-semibold">{actorName(db, doc.memberId)}</dd>
            <dt className="text-ink-muted">Caricato il</dt>
            <dd>{fmtDay(doc.uploadedAt)} da {actorName(db, doc.uploadedBy)}</dd>
            {doc.signedByHand && (
              <>
                <dt className="text-ink-muted">Firma</dt>
                <dd>Modulo firmato a mano</dd>
              </>
            )}
            {doc.expiresOn && (
              <>
                <dt className="text-ink-muted">Scadenza</dt>
                <dd>{fmtDay(doc.expiresOn)}</dd>
              </>
            )}
            {doc.reviewedAt && (
              <>
                <dt className="text-ink-muted">Verificato il</dt>
                <dd>{fmtDay(doc.reviewedAt)}</dd>
              </>
            )}
            {doc.reviewNote && (
              <>
                <dt className="text-ink-muted">Nota</dt>
                <dd>{doc.reviewNote}</dd>
              </>
            )}
          </dl>
        )}

        {doc?.fileData && (
          <Button variant="outline" className="w-full" onClick={() => openDocumentFile(doc.fileData, doc.fileName)}>
            <Download /> Apri {doc.fileName} {doc.fileSize ? `(${formatBytes(doc.fileSize)})` : ''}
          </Button>
        )}
        {mode === 'admin' && doc?.current && doc.status !== 'rifiutato' && (
          <div className="space-y-3 rounded-2xl border border-line/70 p-3">
            <p className="flex items-center gap-2 text-sm font-bold">
              <FileCheck2 className="size-4 text-rosa-intenso" /> Verifica della segreteria
            </p>
            <Textarea rows={2} placeholder="Nota per l’allieva (obbligatoria se chiedi una correzione)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Nota di verifica" />
            <div className="flex flex-wrap gap-2">
              {doc.status !== 'approvato' && (
                <Button size="sm" onClick={() => decide('approva')}>
                  <FileCheck2 /> Approva
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => decide('richiedi_sostituzione')}>
                <RefreshCcw /> Chiedi sostituzione
              </Button>
              {doc.status === 'in_verifica' && (
                <Button size="sm" variant="danger" onClick={() => decide('rifiuta')}>
                  <X /> Rifiuta
                </Button>
              )}
            </div>
          </div>
        )}
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

        {mode === 'allieva' && onReplace && state !== 'in_verifica' && (
          <Button className="w-full" variant={state === 'approvato' ? 'outline' : 'primary'} onClick={onReplace}>
            <Upload /> {doc ? 'Carica una nuova versione' : 'Carica'}
          </Button>
        )}

        {history.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-bold">
              <History className="size-4 text-rosa-intenso" /> Storico
            </p>
            <ol className="space-y-2 border-l-2 border-cipria pl-3 text-sm">
              {history.map((h, i) => (
                <li key={i}>
                  <span className="font-semibold">{ACTION_LABEL[h.action]}</span> <span className="text-ink-muted">· v{h.version} · {fmtDay(h.at)} · {actorName(db, h.by)}</span>
                  {h.note && <p className="text-ink-soft">{h.note}</p>}
                </li>
              ))}
            </ol>
            {previous.some((p) => p.fileData) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {previous.filter((p) => p.fileData).map((p) => (
                  <Button key={p.id} size="sm" variant="ghost" onClick={() => openDocumentFile(p.fileData, p.fileName)}>
                    <Download /> Versione {p.version}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
