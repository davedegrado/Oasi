import { Undo2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { accountSummary, chargePaid, chargeState, euro } from '@/services/selectors'
import { formatDate, todayISO } from '@/lib/dates'

const LABEL = { pagata: ['Pagata', 'ok'], parziale: ['Acconto', 'warn'], scaduta: ['Scaduta', 'danger'], aperta: ['Da pagare', 'rosa'], annullata: ['Annullata', 'neutral'] } as const

/** Quote e pagamenti registrati di un'atleta. I pagamenti avvengono fuori dall'app. */
/** `asAdmin`: la segreteria può restituire a mano un ingresso di un pacchetto */
export function AccountCard({ studentId, asAdmin = false }: { studentId: string; asAdmin?: boolean }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const today = todayISO()
  const summary = accountSummary(db, today, studentId)
  const plans = db.memberPlans.filter((p) => p.studentId === studentId)
  if (summary.charges.length === 0 && plans.length === 0) return null
  return (
    <Card>
      <CardContent>
        <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
          <Wallet className="size-4 text-rosa-intenso" /> Quote e pagamenti
        </h2>
        <p className="mb-3 text-sm text-ink-muted">
          Registrati {euro(summary.paid)} su {euro(summary.due)}
          {summary.overdueCents > 0 ? ` · ${euro(summary.overdueCents)} scaduti` : ''}. I pagamenti si effettuano in segreteria o con bonifico.
        </p>
        {plans.map((p) => {
          const plan = db.plans.find((x) => x.id === p.planId)
          return (
            <p key={p.id} className="mb-2 rounded-2xl bg-cipria-50 p-3 text-sm">
              <b>{plan?.name}</b> · valido fino al {formatDate(p.validUntil, { year: true })}
              {p.entriesTotal ? ` · ingressi residui ${p.entriesTotal - (p.entriesUsed ?? 0)} su ${p.entriesTotal}` : ''}
              {asAdmin && !!p.entriesTotal && (p.entriesUsed ?? 0) > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-1"
                  onClick={async () => {
                    const note = window.prompt('Motivo della restituzione (facoltativo, es. assenza per malattia):') ?? null
                    if (note === null) return
                    await repo.refundEntry(p.id, note)
                    toast('Ingresso restituito: l’atleta è avvisata')
                  }}
                >
                  <Undo2 /> Restituisci un ingresso
                </Button>
              )}
            </p>
          )
        })}
        <ul className="divide-y divide-line/70">
          {summary.charges
            .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
            .map((c) => {
              const [label, tone] = LABEL[chargeState(c, today)]
              return (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.description}</p>
                    <p className="text-xs text-ink-muted">
                      {euro(c.amountCents)} · scadenza {formatDate(c.dueOn, { year: true })}
                      {chargePaid(c) > 0 && chargePaid(c) < c.amountCents ? ` · ricevuti ${euro(chargePaid(c))}` : ''}
                    </p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              )
            })}
        </ul>
      </CardContent>
    </Card>
  )
}
