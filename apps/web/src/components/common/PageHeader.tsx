import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { HoopArc } from './Decor'

interface PageHeaderProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('relative mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <HoopArc className="absolute -top-16 -right-4 size-40 text-rosa/30 sm:-top-20 sm:right-0 sm:size-48" />
      <div className="relative min-w-0">
        {eyebrow && <p className="mb-1.5 text-xs font-semibold tracking-[0.18em] text-rosa-intenso uppercase">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight font-extrabold text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="relative flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {action}
    </div>
  )
}
