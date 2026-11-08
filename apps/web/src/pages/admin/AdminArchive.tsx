import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, FolderOpen, Lock, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react'
import type { DocumentCategory, DocumentType, SharedDocument } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { DocumentStateBadge } from '@/components/documents/DocumentBits'
import { fmtDay, openDocumentFile, readFileAsDataUrl, STATE_META } from '@/components/documents/documentUtils'
import { DocumentDetailDialog } from '@/components/documents/DocumentDialogs'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { documentState, memberDocuments, missingDocuments, type DocumentState, type MemberDocumentRow } from '@/services/documents'
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/services/localRepository'
import { DOCUMENT_CATEGORY_LABEL } from '@/lib/labels'
import { cn, fullName, uid } from '@/lib/utils'

type Tab = 'documenti' | 'mancanti' | 'tipologie' | 'palestra'
const CATEGORIES = Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[]
const STATES = ['in_verifica', 'approvato', 'da_sostituire', 'rifiutato', 'in_scadenza', 'scaduto'] as const

/**
 * Archivio documentale generale. Legge gli stessi documenti dei profili
 * (nessuna copia): ogni riga apre il documento dell'allieva.
 */
export function AdminArchive() {
  const db = useDatabase()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'documenti'
  const setTab = (t: Tab) => setParams((p) => ({ ...Object.fromEntries(p), tab: t }), { replace: true })
  const pending = db.documents.filter((d) => d.current && d.status === 'in_verifica').length
  const missing = missingDocuments(db)

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader eyebrow="Amministrazione" title="Archivio documenti" description="Moduli, liberatorie, consensi e certificati di tutte le allieve, con verifiche, scadenze e storico." />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'documenti', label: 'Documenti', count: pending || undefined },
          { value: 'mancanti', label: 'Mancanti', count: missing.length || undefined },
          { value: 'tipologie', label: 'Tipologie' },
          { value: 'palestra', label: 'Della palestra' },
        ]}
      />
      {tab === 'documenti' && <DocumentsTab />}
      {tab === 'mancanti' && <MissingTab />}
      {tab === 'tipologie' && <TypesTab />}
      {tab === 'palestra' && <SharedTab />}
    </div>
  )
}

function DocumentsTab() {
  const db = useDatabase()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [typeId, setTypeId] = useState('')
  const status = params.get('stato') ?? ''
  const setStatus = (s: string) => setParams((p) => { const n = Object.fromEntries(p); if (s) n.stato = s; else delete n.stato; return n }, { replace: true })
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [expiresBefore, setExpiresBefore] = useState('')
  const [history, setHistory] = useState(false)
  const [open, setOpen] = useState<{ memberId: string; typeId: string } | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return db.documents
      .filter((d) => history || d.current)
      .map((d) => {
        const student = db.students.find((s) => s.id === d.memberId)
        const type = db.documentTypes.find((t) => t.id === d.typeId)
        return { d, student, type, state: (d.current ? documentState(d) : d.status) as DocumentState }
      })
      .filter(({ d, student, type, state }) =>
        !!student && !!type &&
        (!needle || fullName(student).toLowerCase().includes(needle) || student.email.toLowerCase().includes(needle)) &&
        (!category || type.category === category) &&
        (!typeId || type.id === typeId) &&
        (!status || state === status) &&
        (!from || d.uploadedAt.slice(0, 10) >= from) &&
        (!to || d.uploadedAt.slice(0, 10) <= to) &&
        (!expiresBefore || (!!d.expiresOn && d.expiresOn <= expiresBefore)),
      )
      .sort((a, b) => Number(b.state === 'in_verifica') - Number(a.state === 'in_verifica') || b.d.uploadedAt.localeCompare(a.d.uploadedAt))
  }, [db, q, category, typeId, status, from, to, expiresBefore, history])

  const row: MemberDocumentRow | undefined = open ? memberDocuments(db, open.memberId).find((r) => r.type.id === open.typeId) : undefined
  const reset = () => {
    setQ(''); setCategory(''); setTypeId(''); setStatus(''); setFrom(''); setTo(''); setExpiresBefore('')
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" />
            <Input className="pl-10" placeholder="Cerca per nome o email dell’allieva" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cerca allieva" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
              <option value="">Tutte le categorie</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
            </Select>
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Tipologia">
              <option value="">Tutte le tipologie</option>
              {db.documentTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Stato">
              <option value="">Tutti gli stati</option>
              {STATES.map((s) => <option key={s} value={s}>{STATE_META[s].label}</option>)}
            </Select>
            <label className="text-xs text-ink-muted">Caricati dal<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-ink-muted">al<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="text-xs text-ink-muted">Scadenza entro il<Input type="date" value={expiresBefore} onChange={(e) => setExpiresBefore(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2 text-ink-soft">
              <input type="checkbox" className="size-4 accent-rosa-intenso" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Includi versioni precedenti
            </label>
            <span className="text-ink-muted">
              {rows.length} documenti ·{' '}
              <button type="button" className="font-semibold text-rosa-scuro" onClick={reset}>azzera filtri</button>
            </span>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Nessun documento" description="Nessun documento corrisponde ai filtri scelti." />
      ) : (
        <ul className="space-y-2">
          {rows.map(({ d, student, type, state }) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setOpen({ memberId: d.memberId, typeId: d.typeId })}
                className={cn('flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-soft transition hover:ring-2 hover:ring-rosa/40', !d.current && 'opacity-70')}
              >
                <Avatar person={student!} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {fullName(student!)} <span className="font-normal text-ink-muted">· {type!.name}</span>
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    v{d.version}{!d.current && ' (precedente)'} · caricato il {fmtDay(d.uploadedAt)}
                    {d.expiresOn && ` · scade il ${fmtDay(d.expiresOn)}`}
                    {type!.sensitive && ' · riservato'}
                  </p>
                </div>
                <DocumentStateBadge state={state} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {row && open && (
        <DocumentDetailDialog row={row} mode="admin" onClose={() => setOpen(null)} />
      )}
    </>
  )
}

function MissingTab() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const missing = missingDocuments(db)
  if (!missing.length) return <EmptyState title="Tutto in regola" description="Nessuna allieva ha documenti obbligatori mancanti o scaduti." />

  const remind = async () => {
    for (const { student, rows } of missing) {
      await repo.notify({ kind: 'documento', title: 'Documenti da completare', body: `Mancano o sono scaduti: ${rows.map((r) => r.type.name).join(', ')}.`, to: [`student:${student.id}`], link: { allieva: '/allieva/documenti' } })
    }
    toast(`Promemoria inviato a ${missing.length} allieve`)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{missing.length} allieve con documenti obbligatori mancanti o scaduti.</p>
        <Button size="sm" variant="soft" onClick={remind}>Invia promemoria a tutte</Button>
      </div>
      <ul className="space-y-2">
        {missing.map(({ student, rows }) => (
          <li key={student.id}>
            <Link to={`/admin/utenti/${student.id}#documenti`} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft hover:ring-2 hover:ring-rosa/40">
              <Avatar person={student} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{fullName(student)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {rows.map((r) => (
                    <Badge key={r.type.id} tone={r.state === 'scaduto' ? 'danger' : 'neutral'}>
                      {r.type.name}: {STATE_META[r.state].label.toLowerCase()}
                    </Badge>
                  ))}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

const SIGNATURE_LABEL: Record<DocumentType['signatureMode'], string> = {
  nessuna: 'Nessuna firma',
  caricamento_firmato: 'Da caricare firmato a mano',
}

function TypesTab() {
  const db = useDatabase()
  const [editing, setEditing] = useState<DocumentType | null>(null)
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ id: uid('dt'), name: '', category: 'altro', description: '', required: false, signatureMode: 'nessuna', sensitive: false, active: true })}>
          <Plus /> Nuova tipologia
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {db.documentTypes.map((t) => {
          const count = db.documents.filter((d) => d.typeId === t.id && d.current).length
          return (
            <Card key={t.id} className={cn(!t.active && 'opacity-60')}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-bold">
                      {t.name} {t.sensitive && <Lock className="size-3.5 text-ink-muted" aria-label="Dato riservato" />}
                    </p>
                    <p className="text-xs text-ink-muted">{DOCUMENT_CATEGORY_LABEL[t.category]} · {SIGNATURE_LABEL[t.signatureMode]}</p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Modifica ${t.name}`} onClick={() => setEditing(t)}>
                    <Pencil />
                  </Button>
                </div>
                <p className="text-sm text-ink-soft">{t.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.required ? <Badge tone="rosa">Obbligatorio</Badge> : <Badge>Facoltativo</Badge>}
                  {t.validityMonths && <Badge>Validità {t.validityMonths} mesi</Badge>}
                  {!t.active && <Badge tone="warn">Disattivata</Badge>}
                  <Badge>{count} caricati</Badge>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {editing && <TypeDialog type={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function TypeDialog({ type, onClose }: { type: DocumentType; onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [form, setForm] = useState(type)
  const [error, setError] = useState('')
  const set = <K extends keyof DocumentType>(k: K, v: DocumentType[K]) => setForm({ ...form, [k]: v })
  const save = async () => {
    try {
      await repo.saveDocumentType({ ...form, name: form.name.trim() })
      toast('Tipologia salvata')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={type.name ? 'Modifica tipologia' : 'Nuova tipologia di documento'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save}>Salva</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="dt-name" className="sm:col-span-2">
          <Input id="dt-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Categoria" htmlFor="dt-cat">
          <Select id="dt-cat" value={form.category} onChange={(e) => set('category', e.target.value as DocumentCategory)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
        <Field label="Firma a mano" htmlFor="dt-sign">
          <Select id="dt-sign" value={form.signatureMode} onChange={(e) => set('signatureMode', e.target.value as DocumentType['signatureMode'])}>
            {(Object.keys(SIGNATURE_LABEL) as DocumentType['signatureMode'][]).map((s) => <option key={s} value={s}>{SIGNATURE_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Descrizione per le allieve" htmlFor="dt-desc" className="sm:col-span-2">
          <Textarea id="dt-desc" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Validità (mesi, vuoto = nessuna scadenza)" htmlFor="dt-val">
          <Input id="dt-val" type="number" min={1} value={form.validityMonths ?? ''} onChange={(e) => set('validityMonths', e.target.value ? Number(e.target.value) : undefined)} />
        </Field>
        <div className="space-y-2 text-sm text-ink-soft">
          {([['required', 'Obbligatorio per tutte le allieve'], ['sensitive', 'Dato riservato (es. sanitario)'], ['active', 'Attiva (richiesta alle allieve)']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-rosa-intenso" checked={form[k]} onChange={(e) => set(k, e.target.checked)} /> {label}
            </label>
          ))}
        </div>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
      </div>
    </Dialog>
  )
}

function SharedTab() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">Regolamenti e moduli scaricabili dalle allieve o dalle insegnanti.</p>
        <Button onClick={() => setAdding(true)}>
          <Upload /> Pubblica documento
        </Button>
      </div>
      {db.sharedDocuments.length === 0 ? (
        <EmptyState title="Nessun documento pubblicato" />
      ) : (
        <ul className="space-y-2">
          {db.sharedDocuments.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cipria text-rosa-intenso"><FolderOpen className="size-5" /></span>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDocumentFile(d.fileData, d.fileName)}>
                <p className="truncate font-semibold">{d.title}</p>
                <p className="truncate text-xs text-ink-muted">{d.fileName} · per {d.audience} · {fmtDay(d.uploadedAt)}</p>
              </button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Elimina ${d.title}`}
                onClick={async () => {
                  await repo.deleteSharedDocument(d.id)
                  toast('Documento rimosso', 'info')
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding && <SharedDialog onClose={() => setAdding(false)} />}
    </>
  )
}

function SharedDialog({ onClose }: { onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [audience, setAudience] = useState<SharedDocument['audience']>('tutti')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const save = async () => {
    if (!title.trim() || !file) return setError('Indica titolo e file')
    if (file.size > MAX_DOCUMENT_BYTES || !ALLOWED_DOCUMENT_TYPES.includes(file.type)) return setError('Carica un PDF o un’immagine fino a 4 MB')
    await repo.saveSharedDocument({ id: uid('sh'), title: title.trim(), description: description.trim(), audience, fileName: file.name, fileType: file.type, fileData: await readFileAsDataUrl(file), uploadedAt: new Date().toISOString() })
    toast('Documento pubblicato e notificato')
    onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Pubblica un documento"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save}><FileText /> Pubblica</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titolo" htmlFor="sh-title"><Input id="sh-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Descrizione" htmlFor="sh-desc"><Input id="sh-desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Visibile a" htmlFor="sh-aud">
          <Select id="sh-aud" value={audience} onChange={(e) => setAudience(e.target.value as SharedDocument['audience'])}>
            <option value="tutti">Tutti</option>
            <option value="allieve">Solo allieve</option>
            <option value="insegnanti">Solo insegnanti</option>
          </Select>
        </Field>
        <Field label="File (PDF o immagine, max 4 MB)" htmlFor="sh-file">
          <Input id="sh-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
