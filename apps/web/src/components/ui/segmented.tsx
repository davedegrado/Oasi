import { cn } from '@/lib/utils'

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  className?: string
  size?: 'sm' | 'md'
}

/** Controllo a pillole (tab) usato per filtri e viste */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: SegmentedProps<T>) {
  return (
    <div role="tablist" className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-cipria-100 p-1 scrollbar-none', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-all',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
              active ? 'bg-white text-ink shadow-soft' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[11px]', active ? 'bg-cipria text-rosa-scuro' : 'bg-white/70')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
