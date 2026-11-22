import { CalendarCheck, CalendarRange, Repeat, Ticket } from 'lucide-react'
import type { FeePlan } from '@/types'
import { planValidityLabel } from '@/services/selectors'

/** Riga di dettaglio di un piano: lezioni, frequenza, validità, partecipazione */
export function PlanFacts({ plan }: { plan: FeePlan }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1">
        <Ticket className="size-3.5" /> {plan.lessons ? `${plan.lessons} ${plan.lessons === 1 ? 'lezione' : 'lezioni'}` : 'lezioni senza limite'}
      </span>
      {plan.weeklyFrequency ? (
        <span className="inline-flex items-center gap-1">
          <Repeat className="size-3.5" /> {plan.weeklyFrequency} {plan.weeklyFrequency === 1 ? 'giorno' : 'giorni'} a settimana
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <CalendarRange className="size-3.5" /> {planValidityLabel(plan)}
      </span>
      <span className="inline-flex items-center gap-1">
        <CalendarCheck className="size-3.5" /> {plan.autoAttendance ? 'partecipazione automatica' : 'serve “ci sarò” a ogni lezione'}
      </span>
    </p>
  )
}
