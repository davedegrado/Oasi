import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  tone?: 'rosa' | 'ok' | 'warn' | 'tessuti' | 'neutral'
  className?: string
}

const TONES = {
  rosa: 'bg-cipria text-rosa-scuro',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  tessuti: 'bg-tessuti-soft text-tessuti',
  neutral: 'bg-cipria-100 text-ink-soft',
}

export function StatCard({ label, value, icon, hint, tone = 'rosa', className }: StatCardProps) {
  return (
    <div className={cn('rounded-3xl border border-line/70 bg-white p-4 shadow-soft sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted sm:text-sm">{label}</p>
        {icon && <span className={cn('grid size-8 place-items-center rounded-full [&_svg]:size-4', TONES[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}
