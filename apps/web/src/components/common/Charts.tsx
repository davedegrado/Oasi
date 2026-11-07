import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DonutSegment {
  value: number
  color: string
  label: string
}

/** Grafico ad anello: richiama la forma del cerchio aereo */
export function Donut({ segments, size = 168, thickness = 16, children, className }: { segments: DonutSegment[]; size?: number; thickness?: number; children?: ReactNode; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const offsets = segments.reduce<number[]>((acc, _s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + (segments[i - 1].value / total) * c], [])
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-cipria-100)" strokeWidth={thickness} fill="none" />
        {segments.map((s, i) => {
          const len = (s.value / total) * c
          return (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - (s.value > 0 && len > 6 ? 3 : 0))} ${c}`}
              strokeDashoffset={-offsets[i]}
              strokeLinecap="butt"
              className="transition-all duration-700"
            >
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/** Anello di avanzamento singolo */
export function Ring({ value, size = 64, thickness = 7, color = 'var(--color-rosa-intenso)', children }: { value: number; size?: number; thickness?: number; color?: string; children?: ReactNode }) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-cipria-100)" strokeWidth={thickness} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={thickness} fill="none" strokeLinecap="round" strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Barra impilata orizzontale */
export function StackedBar({ segments, className }: { segments: DonutSegment[]; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  return (
    <div className={cn('flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-cipria-100', className)}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div key={s.label} title={`${s.label}: ${s.value}`} className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
    </div>
  )
}

export function Legend({ items, className }: { items: { label: string; color: string; value?: ReactNode }[]; className?: string }) {
  return (
    <ul className={cn('grid gap-2', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-ink-soft">
            <span className="size-2.5 rounded-full" style={{ background: i.color }} />
            {i.label}
          </span>
          {i.value !== undefined && <span className="font-semibold text-ink">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Barre verticali semplici (es. presenze) */
export function MiniBars({ data, max, className }: { data: { label: string; value: number; sub?: string }[]; max?: number; className?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value))
  return (
    <div className={cn('flex h-36 items-end gap-2 sm:gap-3', className)}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-semibold text-ink">{d.value}</span>
          <div className="flex w-full max-w-10 flex-1 items-end rounded-full bg-cipria-100">
            <div className="w-full rounded-full bg-gradient-to-t from-rosa-intenso to-rosa transition-all duration-700" style={{ height: `${Math.max(6, (d.value / top) * 100)}%` }} />
          </div>
          <span className="w-full truncate text-center text-[11px] text-ink-muted">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
