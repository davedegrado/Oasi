import { useState } from 'react'
import { Pencil, Plus, Undo2 } from 'lucide-react'
import { PlanFacts } from '@/components/plans/PlanFacts'
import type { FeePlan } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { euro, findClass, findStudent, planUsage } from '@/services/selectors'
import { formatDate, todayISO } from '@/lib/dates'
import { fullName, uid } from '@/lib/utils'

type Tab = 'listino' | 'atleti'

const emptyPlan = (): FeePlan => ({ id: uid('plan'), name: '', priceCents: 0, validity: 'mesi', months: 1, autoAttendance: true, active: true })

/**
 * Piani e listino. L'amministrazione scrive i piani tra cui l'atleta sceglie quando si
 * iscrive a una classe; il prezzo è solo informativo: l'app non calcola né registra pagamenti.
 */
export function AdminPlans() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const today = todayISO()
  const [tab, setTab] = useState<Tab>('listino')
  const [editing, setEditing] = useState<FeePlan | null>(null)
  const plans = [...db.plans].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  const subscriptions = [...db.memberPlans].sort((a, b) => a.validUntil.localeCompare(b.validUntil))

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Piani"
        title="Piani e listino"
        description="I piani che gli atleti possono scegliere quando si iscrivono a una classe, con prezzo, lezioni, frequenza e validità. I pagamenti avvengono fuori dall’app."
        className="mb-0"
        actions={
          <Button onClick={() => setEditing(emptyPlan())}>
            <Plus /> Aggiungi piano
          </Button>
        }
      />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'listino', label: 'Listino', count: db.plans.filter((p) => p.active).length },
          { value: 'atleti', label: 'Piani degli atleti', count: db.memberPlans.length },
        ]}
      />

      {tab === 'listino' && (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className={p.active ? '' : 'opacity-60'}>
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{p.name}</p>
                    {p.areas?.length ? <p className="text-xs text-ink-muted">Classi: {p.areas.join(', ')}</p> : null}
                  </div>
                  <p className="shrink-0 font-display text-xl font-extrabold text-ink">{euro(p.priceCents)}</p>
                </div>
                <PlanFacts plan={p} />
                {p.note && <p className="text-sm text-ink-soft">{p.note}</p>}
                <div className="flex items-center justify-between gap-2 pt-1">
                  {p.active ? <Badge tone="ok">Selezionabile</Badge> : <Badge tone="neutral">Non selezionabile</Badge>}
                  <Button size="sm" variant="outline" onClick={() => setEditing(structuredClone(p))}>
                    <Pencil /> Modifica
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'atleti' && (
        <Card>
          <CardContent className="p-3 sm:p-4">
            {subscriptions.length === 0 && <p className="p-3 text-sm text-ink-muted">Nessun piano sottoscritto.</p>}
            <ul className="divide-y divide-line/70">
              {subscriptions.map((mp) => {
                const s = findStudent(db, mp.studentId)
                const plan = db.plans.find((p) => p.id === mp.planId)
                const usage = planUsage(db, mp)
                const expired = mp.validUntil < today
                const finished = usage.remaining === 0
                return (
                  <li key={mp.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-sm font-semibold text-ink">{s ? fullName(s) : '—'}</p>
                      <p className="truncate text-xs text-ink-muted">
                        {plan?.name ?? 'Piano eliminato'}
                        {mp.classId ? ` · ${findClass(db, mp.classId)?.name ?? ''}` : ''}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {formatDate(mp.validFrom)} – {formatDate(mp.validUntil, { year: true })}
                        {mp.lessons !== undefined ? ` · ${usage.remaining} di ${mp.lessons} lezioni residue` : ''}
                      </p>
                    </div>
                    {expired ? <Badge tone="danger">Scaduto</Badge> : finished ? <Badge tone="warn">Lezioni finite</Badge> : <Badge tone="ok">Valido</Badge>}
                    {mp.lessons !== undefined && usage.used > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const note = window.prompt('Motivo della restituzione (facoltativo, es. assenza per malattia):') ?? null
                          if (note === null) return
                          await repo.refundEntry(mp.id, note)
                          toast('Lezione restituita: l’atleta è avvisato')
                        }}
                      >
                        <Undo2 /> Restituisci una lezione
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {editing && <PlanDialog plan={editing} isNew={!db.plans.some((p) => p.id === editing.id)} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PlanDialog({ plan, isNew, onClose }: { plan: FeePlan; isNew: boolean; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [p, setP] = useState(plan)
  const [price, setPrice] = useState(plan.priceCents ? (plan.priceCents / 100).toString() : '')
  const [error, setError] = useState('')
  const areas = db.association.settings.classCategories ?? []
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v))))

  const save = async () => {
    const cents = Math.round(Number(price.replace(',', '.')) * 100)
    if (!p.name.trim()) return setError('Dai un nome al piano.')
    if (!Number.isFinite(cents) || cents < 0) return setError('Prezzo non valido.')
    if (p.validity === 'mesi' && !(p.months && p.months > 0)) return setError('Indica per quanti mesi vale il piano.')
    if (p.validity === 'periodo' && (!p.validFrom || !p.validUntil || p.validUntil < p.validFrom)) return setError('Indica un periodo valido: dal giorno… al giorno…')
    try {
      await repo.savePlan({
        ...p,
        name: p.name.trim(),
        priceCents: cents,
        months: p.validity === 'mesi' ? p.months : undefined,
        validFrom: p.validity === 'periodo' ? p.validFrom : undefined,
        validUntil: p.validity === 'periodo' ? p.validUntil : undefined,
        note: p.note?.trim() || undefined,
      })
      toast(isNew ? 'Piano aggiunto al listino' : 'Piano aggiornato')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Aggiungi piano' : 'Modifica piano'}
      description="Gli atleti lo scelgono quando si iscrivono a una classe. Le modifiche valgono per le nuove sottoscrizioni."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save}>Salva</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Field label="Nome del piano" htmlFor="pl-name">
            <Input id="pl-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Es. Trimestrale 2 volte a settimana" />
          </Field>
          <Field label="Prezzo (€)" htmlFor="pl-price">
            <Input id="pl-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Numero di lezioni" htmlFor="pl-lessons" hint="Vuoto = senza limite nel periodo (es. abbonamenti)">
            <Input id="pl-lessons" type="number" min={1} inputMode="numeric" value={p.lessons ?? ''} onChange={(e) => setP({ ...p, lessons: num(e.target.value) || undefined })} placeholder="Senza limite" />
          </Field>
          <Field label="Frequenza (giorni a settimana)" htmlFor="pl-freq">
            <Input id="pl-freq" type="number" min={1} max={7} inputMode="numeric" value={p.weeklyFrequency ?? ''} onChange={(e) => setP({ ...p, weeklyFrequency: num(e.target.value) || undefined })} placeholder="—" />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-ink-soft">Validità</legend>
          <Segmented
            size="sm"
            value={p.validity}
            onChange={(v) => setP({ ...p, validity: v, months: v === 'mesi' ? (p.months ?? 1) : p.months })}
            options={[
              { value: 'mesi', label: 'Mesi dalla sottoscrizione' },
              { value: 'periodo', label: 'Periodo preciso' },
            ]}
          />
          {p.validity === 'mesi' ? (
            <Field label="Numero di mesi" htmlFor="pl-months" hint="Dal giorno in cui l’iscrizione viene accettata">
              <Input id="pl-months" type="number" min={1} inputMode="numeric" value={p.months ?? ''} onChange={(e) => setP({ ...p, months: num(e.target.value) })} />
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Dal giorno" htmlFor="pl-from">
                <Input id="pl-from" type="date" value={p.validFrom ?? ''} onChange={(e) => setP({ ...p, validFrom: e.target.value })} />
              </Field>
              <Field label="Al giorno" htmlFor="pl-until">
                <Input id="pl-until" type="date" value={p.validUntil ?? ''} onChange={(e) => setP({ ...p, validUntil: e.target.value })} />
              </Field>
            </div>
          )}
        </fieldset>

        <label className="flex items-start gap-2.5 rounded-2xl bg-cipria-50 p-3 text-sm text-ink">
          <input type="checkbox" className="mt-0.5 size-4 accent-rosa-intenso" checked={p.autoAttendance} onChange={(e) => setP({ ...p, autoAttendance: e.target.checked })} />
          <span>
            <strong>Partecipazione automatica</strong>
            <span className="block text-ink-soft">
              Attivo: l’atleta è atteso a ogni lezione e disdice solo quando non viene. Non attivo: deve premere “ci sarò” per ogni lezione a cui vuole partecipare.
            </span>
          </span>
        </label>

        {areas.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink-soft">Per le classi delle aree (nessuna scelta = tutte)</legend>
            <div className="flex flex-wrap gap-3">
              {areas.map((a) => (
                <label key={a} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-rosa-intenso"
                    checked={!!p.areas?.includes(a)}
                    onChange={(e) => setP({ ...p, areas: e.target.checked ? [...(p.areas ?? []), a] : (p.areas ?? []).filter((x) => x !== a) })}
                  />
                  {a}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Field label="Note (facoltative)" htmlFor="pl-note">
          <Textarea id="pl-note" rows={2} value={p.note ?? ''} onChange={(e) => setP({ ...p, note: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-rosa-intenso" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
          Selezionabile dagli atleti
        </label>
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  )
}
