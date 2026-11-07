import type { ReactNode } from 'react'
import { HoopArc } from './Decor'

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-3xl border border-dashed border-rosa/50 bg-white/60 px-6 py-12 text-center">
      <HoopArc className="mb-4 size-16 text-rosa" strokeWidth={3} />
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
