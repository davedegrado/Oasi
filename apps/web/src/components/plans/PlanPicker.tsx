import type { FeePlan } from '@/types'
import { euro } from '@/services/selectors'
import { cn } from '@/lib/utils'
import { PlanFacts } from './PlanFacts'

/** Scelta del piano (listino della palestra): una scheda per piano, con prezzo e regole */
export function PlanPicker({ plans, value, onChange }: { plans: FeePlan[]; value: string; onChange: (id: string) => void }) {
  if (plans.length === 0) return <p className="rounded-2xl bg-warn-soft p-3 text-sm text-ink-soft">Nessun piano disponibile per questa classe: chiedi in segreteria.</p>
  return (
    <div role="radiogroup" aria-label="Piano" className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {plans.map((p) => (
        <label
          key={p.id}
          className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition', value === p.id ? 'border-rosa-intenso bg-cipria-50' : 'border-line/70 hover:bg-cipria-50/60')}
        >
          <input type="radio" name="plan" className="mt-1 size-4 accent-rosa-intenso" checked={value === p.id} onChange={() => onChange(p.id)} />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold text-ink">{p.name}</span>
              <span className="shrink-0 font-bold text-ink">{euro(p.priceCents)}</span>
            </span>
            <PlanFacts plan={p} />
            {p.note && <span className="block text-xs text-ink-soft">{p.note}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
