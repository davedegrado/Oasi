import { useState } from 'react'
import { AlertTriangle, Banknote, CalendarRange, Plus, Receipt, Wallet } from 'lucide-react'
import type { Charge, FeePlan, PaymentMethod } from '@/types'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { accountSummary, chargePaid, chargeState, euro, findStudent, type ChargeState } from '@/services/selectors'
import { formatDate, todayISO } from '@/lib/dates'
import { fullName } from '@/lib/utils'

type Tab = 'quote' | 'listino' | 'stagione'

const STATE: Record<ChargeState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'rosa' }> = {
  pagata: { label: 'Pagata', tone: 'ok' },
  parziale: { label: 'Acconto', tone: 'warn' },
  scaduta: { label: 'Scaduta', tone: 'danger' },
  aperta: { label: 'Da pagare', tone: 'rosa' },
  annullata: { label: 'Annullata', tone: 'neutral' },
}
const BILLING: Record<FeePlan['billing'], string> = { annuale: 'Annuale', periodico: 'Periodico', mensile: 'Mensile', una_tantum: 'Una tantum' }
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'contanti', label: 'Contanti' },
  { value: 'bonifico', label: 'Bonifico' },
  { value: 'pos', label: 'POS' },
  { value: 'altro', label: 'Altro' },
]

/**
 * Piani e quote. I pagamenti avvengono fuori dall'app: qui l'amministrazione
 * registra ciò che ha ricevuto e tiene sotto controllo scadenze e insoluti.
 */
export function AdminFees() {
  const db = useDatabase()
  const today = todayISO()
  const [tab, setTab] = useState<Tab>('quote')
  const [filter, setFilter] = useState<'aperte' | 'scadute' | 'tutte'>('aperte')
  const [paying, setPaying] = useState<Charge | null>(null)
  const [assigning, setAssigning] = useState(false)
  const summary = accountSummary(db, today)
  const charges = db.charges
    .filter((c) => {
      const s = chargeState(c, today)
      return filter === 'tutte' ? true : filter === 'scadute' ? s === 'scaduta' : s !== 'pagata' && s !== 'annullata'
    })
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
  const categories = [...new Set(db.plans.map((p) => p.category))]

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Quote"
        title="Piani, quote e pagamenti"
        description="I pagamenti si ricevono in segreteria o con bonifico: qui li registri e controlli scadenze e insoluti. L’app non incassa e non conserva dati bancari."
        className="mb-0"
        actions={
          <Button onClick={() => setAssigning(true)}>
            <Plus /> Assegna un piano
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Receipt />} label="Dovuto" value={euro(summary.due)} />
        <StatCard icon={<Banknote />} label="Registrato" value={euro(summary.paid)} />
        <StatCard icon={<Wallet />} label="Da ricevere" value={euro(summary.residual)} />
        <StatCard icon={<AlertTriangle />} label={`Insoluti (${summary.overdue.length})`} value={euro(summary.overdueCents)} />
      </div>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'quote', label: 'Quote' },
          { value: 'listino', label: 'Listino' },
          { value: 'stagione', label: 'Stagione' },
        ]}
      />

      {tab === 'quote' && (
        <section className="space-y-3">
          <Segmented
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'aperte', label: 'Da ricevere' },
              { value: 'scadute', label: 'Scadute' },
              { value: 'tutte', label: 'Tutte' },
            ]}
          />
          <Card>
            <CardContent className="p-3 sm:p-4">
              {charges.length === 0 && <p className="p-3 text-sm text-ink-muted">Nessuna quota in questo elenco.</p>}
              <ul className="divide-y divide-line/70">
                {charges.map((c) => {
                  const s = findStudent(db, c.studentId)
                  const state = chargeState(c, today)
                  const paid = chargePaid(c)
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate text-sm font-semibold text-ink">{s ? fullName(s) : '—'}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {c.description}
                          {c.periodLabel ? ` · ${c.periodLabel}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-ink">{euro(c.amountCents)}</p>
                        <p className="text-xs text-ink-muted">
                          {paid > 0 && paid < c.amountCents ? `ricevuti ${euro(paid)} · ` : ''}scad. {formatDate(c.dueOn)}
                        </p>
                      </div>
                      <Badge tone={STATE[state].tone}>{STATE[state].label}</Badge>
                      <Button size="sm" variant={state === 'pagata' ? 'ghost' : 'soft'} onClick={() => setPaying(c)}>
                        {state === 'pagata' ? 'Dettaglio' : 'Registra'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {tab === 'listino' && (
        <section className="space-y-5">
          <p className="rounded-3xl bg-cipria-50 p-4 text-sm text-ink-soft">
            Il listino è una configurazione della palestra per la stagione {db.season.name}: annuali, periodici, mensili, rate e pacchetti sono combinazioni degli stessi campi. Le rate sono un modo di pagare lo stesso piano.
          </p>
          {categories.map((cat) => (
            <div key={cat}>
              <SectionTitle title={cat} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {db.plans
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <PlanCard key={p.id} plan={p} />
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'stagione' && (
        <section className="space-y-3">
          <Card>
            <CardContent>
              <p className="flex items-center gap-2 font-display text-lg font-bold">
                <CalendarRange className="size-5 text-rosa-intenso" /> Stagione {db.season.name}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Dal {formatDate(db.season.startDate, { year: true })} al {formatDate(db.season.endDate, { year: true })}
              </p>
              <ul className="mt-4 divide-y divide-line/70">
                {db.season.periods.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-semibold text-ink">{p.name}</span>
                    <span className="text-ink-muted">
                      {formatDate(p.startDate)} – {formatDate(p.endDate, { year: true })}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-muted">Le chiusure si gestiscono da Gestione → Calendario: nei giorni di chiusura non ci sono lezioni, presenze né recuperi.</p>
            </CardContent>
          </Card>
          <SeasonWarnings />
        </section>
      )}

      {paying && <PaymentDialog charge={db.charges.find((c) => c.id === paying.id) ?? paying} onClose={() => setPaying(null)} />}
      {assigning && <AssignDialog onClose={() => setAssigning(false)} />}
    </div>
  )
}

function PlanCard({ plan }: { plan: FeePlan }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [price, setPrice] = useState(String(plan.amountCents / 100))
  const [editing, setEditing] = useState(false)
  const details = [
    BILLING[plan.billing],
    plan.weeklyFrequency ? `${plan.weeklyFrequency} a settimana` : '',
    plan.entries ? `${plan.entries} ingressi` : '',
    plan.validityWeeks ? `${plan.validityWeeks} settimane consecutive` : '',
    plan.bookingHoursBefore ? `prenotazione ${plan.bookingHoursBefore} ore prima` : '',
  ].filter(Boolean)
  const save = async () => {
    const cents = Math.round(Number(price.replace(',', '.')) * 100)
    if (!Number.isFinite(cents) || cents < 0) return toast('Importo non valido', 'info')
    await repo.savePlan({ ...plan, amountCents: cents })
    setEditing(false)
    toast('Prezzo aggiornato: le quote già generate non cambiano')
  }
  return (
    <Card className={plan.active ? '' : 'opacity-60'}>
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display leading-snug font-bold text-ink">{plan.name}</p>
          {editing ? (
            <span className="flex items-center gap-1.5">
              <Input aria-label={`Prezzo di ${plan.name}`} className="h-9 w-24" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              <Button size="sm" onClick={save}>
                Salva
              </Button>
            </span>
          ) : (
            <button type="button" className="shrink-0 font-display text-lg font-extrabold text-rosa-intenso" onClick={() => setEditing(true)} aria-label={`Modifica il prezzo di ${plan.name}`}>
              {euro(plan.amountCents)}
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted">{details.join(' · ')}</p>
        {plan.installments && (
          <p className="text-xs text-ink-soft">
            Oppure {plan.installments.length} rate da {euro(plan.installments[0].amountCents)} ({plan.installments.map((i) => formatDate(i.dueOn)).join(', ')})
          </p>
        )}
        {(plan.validFrom || plan.note) && (
          <p className="text-xs text-ink-muted">
            {plan.validFrom && plan.validUntil ? `Valido ${formatDate(plan.validFrom)} – ${formatDate(plan.validUntil, { year: true })}` : ''}
            {plan.validFrom && plan.note ? ' · ' : ''}
            {plan.note}
          </p>
        )}
        <label className="flex items-center gap-2 pt-1 text-xs font-semibold text-ink-soft">
          <input type="checkbox" className="size-4 accent-[var(--color-rosa-intenso)]" checked={plan.active} onChange={(e) => repo.savePlan({ ...plan, active: e.target.checked })} />
          Attivo
        </label>
      </CardContent>
    </Card>
  )
}

/** Incongruenze della configurazione: vengono segnalate, non corrette in automatico */
function SeasonWarnings() {
  const db = useDatabase()
  const warnings: string[] = []
  const { season } = db
  season.periods.forEach((p, i) => {
    const prev = season.periods[i - 1]
    if (prev && p.startDate <= prev.endDate) warnings.push(`I periodi «${prev.name}» e «${p.name}» si sovrappongono.`)
  })
  for (const p of db.plans.filter((x) => x.active)) {
    if ((p.validFrom && p.validFrom < season.startDate) || (p.validUntil && p.validUntil > season.endDate))
      warnings.push(`Il piano «${p.name}» ha una validità che esce dalle date della stagione (${formatDate(p.validFrom ?? season.startDate)} – ${formatDate(p.validUntil ?? season.endDate)}).`)
    const total = p.installments?.reduce((s, i) => s + i.amountCents, 0)
    if (total !== undefined && total < p.amountCents) warnings.push(`Piano «${p.name}»: la somma delle rate è inferiore al prezzo in unica soluzione.`)
  }
  if (warnings.length === 0) return <p className="rounded-3xl bg-white p-4 text-sm text-ink-muted shadow-soft">Nessuna incongruenza nella configurazione della stagione.</p>
  return (
    <div className="rounded-3xl bg-warn-soft p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-warn">
        <AlertTriangle className="size-4" /> Da verificare prima di attivare
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  )
}

function PaymentDialog({ charge, onClose }: { charge: Charge; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const today = todayISO()
  const residual = charge.amountCents - chargePaid(charge)
  const [amount, setAmount] = useState(String(residual / 100))
  const [paidOn, setPaidOn] = useState(today)
  const [method, setMethod] = useState<PaymentMethod>('contanti')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const student = findStudent(db, charge.studentId)

  const save = async () => {
    try {
      await repo.recordPayment(charge.id, { amountCents: Math.round(Number(amount.replace(',', '.')) * 100), paidOn, method, note: note.trim() })
      toast('Pagamento registrato')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={charge.description}
      description={`${student ? fullName(student) : ''} · ${euro(charge.amountCents)} · scadenza ${formatDate(charge.dueOn, { year: true })}`}
      footer={
        residual > 0 ? (
          <>
            <Button variant="outline" onClick={onClose}>
              Chiudi
            </Button>
            <Button onClick={save}>Registra pagamento</Button>
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {charge.payments.length > 0 && (
          <ul className="divide-y divide-line/70 rounded-2xl bg-cipria-50 px-3">
            {charge.payments.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">
                  <b>{euro(p.amountCents)}</b> · {formatDate(p.paidOn, { year: true })} · {METHODS.find((m) => m.value === p.method)?.label}
                  {p.note ? ` · ${p.note}` : ''}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await repo.deletePayment(charge.id, p.id)
                    toast('Pagamento eliminato', 'info')
                  }}
                >
                  Elimina
                </Button>
              </li>
            ))}
          </ul>
        )}
        {residual > 0 ? (
          <>
            {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
            <p className="text-sm text-ink-soft">
              Residuo: <b>{euro(residual)}</b>. Puoi registrare anche un acconto.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Importo ricevuto (€)" htmlFor="pay-amount">
                <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Data" htmlFor="pay-date">
                <Input id="pay-date" type="date" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} />
              </Field>
              <Field label="Modalità" htmlFor="pay-method">
                <Select id="pay-method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note" htmlFor="pay-note">
                <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facoltative" />
              </Field>
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold text-ok">Quota interamente pagata.</p>
        )}
      </div>
    </Dialog>
  )
}

function AssignDialog({ onClose }: { onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const plans = db.plans.filter((p) => p.active)
  const [studentId, setStudentId] = useState(db.students[0]?.id ?? '')
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [mode, setMode] = useState<'unica' | 'rate'>('unica')
  const [periodId, setPeriodId] = useState(db.season.periods[0]?.id ?? '')
  const [validFrom, setValidFrom] = useState(todayISO())
  const [error, setError] = useState('')
  const plan = plans.find((p) => p.id === planId)

  const save = async () => {
    try {
      await repo.assignPlan({ studentId, planId, paymentMode: plan?.installments ? mode : 'unica', periodId: plan?.billing === 'periodico' ? periodId : undefined, validFrom: plan?.validityWeeks ? validFrom : undefined })
      toast('Piano assegnato: quote generate')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assegna un piano"
      description="Vengono generate le quote da pagare: una sola, oppure una per rata."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save} disabled={!studentId || !planId}>
            Assegna
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <Field label="Allieva" htmlFor="as-student">
          <Select id="as-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            {db.students.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Piano" htmlFor="as-plan">
          <Select id="as-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {euro(p.amountCents)}
              </option>
            ))}
          </Select>
        </Field>
        {plan?.installments && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'unica', label: `Unica soluzione · ${euro(plan.amountCents)}` },
              { value: 'rate', label: `${plan.installments.length} rate da ${euro(plan.installments[0].amountCents)}` },
            ]}
          />
        )}
        {plan?.billing === 'periodico' && (
          <Field label="Periodo" htmlFor="as-period">
            <Select id="as-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              {db.season.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {formatDate(p.startDate)} – {formatDate(p.endDate)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {plan?.validityWeeks && (
          <Field label={`Inizio (vale ${plan.validityWeeks} settimane consecutive)`} htmlFor="as-from">
            <Input id="as-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
        )}
      </div>
    </Dialog>
  )
}
