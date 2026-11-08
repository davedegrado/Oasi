import { useState } from 'react'
import { ChevronRight, FileSignature, FileText, Lock, PenLine, ShieldCheck, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useDatabase } from '@/hooks/useDatabase'
import { DOCUMENT_CATEGORY_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { documentSummary, memberDocuments, needsAction, type MemberDocumentRow } from '@/services/documents'
import { DocumentStateBadge } from './DocumentBits'
import { fmtDay } from './documentUtils'
import { DocumentDetailDialog, SignDocumentDialog, UploadDocumentDialog } from './DocumentDialogs'

type Mode = 'allieva' | 'admin'

/**
 * Documenti di un profilo. Allieva: carica, firma, sostituisce e consulta.
 * Amministrazione: verifica, approva, rifiuta, chiede la sostituzione, carica per conto dell'allieva.
 * Le insegnanti non vedono questa sezione (dati personali e sanitari).
 */
export function MemberDocumentsPanel({ memberId, mode }: { memberId: string; mode: Mode }) {
  const db = useDatabase()
  const rows = memberDocuments(db, memberId)
  const summary = documentSummary(rows)
  const [upload, setUpload] = useState<MemberDocumentRow | null>(null)
  const [sign, setSign] = useState<MemberDocumentRow | null>(null)
  const [detail, setDetail] = useState<MemberDocumentRow | null>(null)
  const current = detail ? memberDocuments(db, memberId).find((r) => r.type.id === detail.type.id) ?? null : null

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <FileText className="size-4 text-rosa-intenso" /> Documenti
            </h2>
            <p className="text-sm text-ink-muted">
              {summary.complete
                ? 'Documentazione obbligatoria completa.'
                : `${summary.missing.length} obbligatori mancanti · ${summary.toFix.length} da correggere · ${summary.pending.length} in verifica`}
            </p>
          </div>
          {summary.complete ? (
            <Badge tone="ok">
              <ShieldCheck /> In regola
            </Badge>
          ) : (
            summary.missing.length + summary.toFix.length > 0 && <Badge tone="warn">Da completare</Badge>
          )}
        </div>

        <ul className="space-y-2.5">
          {rows.map((row) => {
            const { type, doc, state } = row
            const canSign = type.signatureMode === 'elettronica' && mode === 'allieva'
            const action = needsAction(state)
            return (
              <li key={type.id} className={cn('rounded-2xl border p-3', action && mode === 'allieva' ? 'border-warn/40 bg-warn-soft/40' : 'border-line/70 bg-white')}>
                <div className="flex items-start gap-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(row)} aria-label={`Dettaglio ${type.name}`}>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
                      {type.name}
                      {type.required && <span className="text-[11px] font-semibold text-rosa-intenso uppercase">obbligatorio</span>}
                      {type.sensitive && <Lock className="size-3.5 text-ink-muted" aria-label="Dato riservato" />}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {DOCUMENT_CATEGORY_LABEL[type.category]}
                      {doc && ` · v${doc.version} del ${fmtDay(doc.uploadedAt)}`}
                      {doc?.expiresOn && ` · scade il ${fmtDay(doc.expiresOn)}`}
                      {doc?.signature && ` · ${doc.signature.method === 'elettronica' ? 'firmato nell’app' : 'caricato già firmato'}`}
                    </p>
                    {doc?.reviewNote && (state === 'da_sostituire' || state === 'rifiutato') && <p className="mt-1.5 rounded-xl bg-white/80 px-2.5 py-1.5 text-sm text-ink-soft">“{doc.reviewNote}”</p>}
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <DocumentStateBadge state={state} />
                    {mode === 'allieva' && state !== 'approvato' && state !== 'in_verifica' && (
                      canSign ? (
                        <Button size="sm" onClick={() => setSign(row)}>
                          <PenLine /> Firma
                        </Button>
                      ) : (
                        <Button size="sm" variant={state === 'mancante' ? 'primary' : 'outline'} onClick={() => setUpload(row)}>
                          <Upload /> {doc ? 'Sostituisci' : 'Carica'}
                        </Button>
                      )
                    )}
                    {mode === 'admin' && doc?.status === 'in_verifica' && (
                      <Button size="sm" onClick={() => setDetail(row)}>
                        Verifica <ChevronRight />
                      </Button>
                    )}
                    {mode === 'admin' && !doc && type.signatureMode !== 'elettronica' && (
                      <Button size="sm" variant="outline" onClick={() => setUpload(row)}>
                        <Upload /> Carica
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
          {rows.length === 0 && <p className="text-sm text-ink-muted">La palestra non ha ancora configurato documenti richiesti.</p>}
        </ul>
        {mode === 'allieva' && (
          <p className="mt-4 flex items-start gap-2 text-xs text-ink-muted">
            <FileSignature className="mt-0.5 size-3.5 shrink-0" />I documenti sono visibili solo a te e alla segreteria. Il certificato medico è un dato riservato e non è accessibile alle insegnanti.
          </p>
        )}
      </CardContent>
      {upload && <UploadDocumentDialog row={upload} memberId={memberId} uploadedBy={mode === 'admin' ? 'admin' : memberId} onClose={() => setUpload(null)} />}
      {sign && <SignDocumentDialog row={sign} memberId={memberId} onClose={() => setSign(null)} />}
      {current && (
        <DocumentDetailDialog
          row={current}
          mode={mode}
          onClose={() => setDetail(null)}
          onReplace={() => {
            setDetail(null)
            if (current.type.signatureMode === 'elettronica' && mode === 'allieva') setSign(current)
            else setUpload(current)
          }}
        />
      )}
    </Card>
  )
}
