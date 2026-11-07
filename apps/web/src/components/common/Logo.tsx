import { useTenant } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'

/** Marchio predefinito: un cerchio aereo sospeso con un tessuto (colori dal tema del tenant) */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn('size-10', className)} aria-hidden>
      <circle cx="24" cy="24" r="23" fill="var(--color-cipria)" />
      <path d="M24 3.5v6.5" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="25.5" r="13.5" stroke="var(--color-rosa-intenso)" strokeWidth="3" />
      <path d="M24 5C14 9 6 18 8.5 28S16 39 13 45" stroke="var(--color-rosa)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 5c6 5 17 10 15.5 21" stroke="var(--color-rosa)" strokeOpacity=".6" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className, compact, light }: { className?: string; compact?: boolean; light?: boolean }) {
  const { config } = useTenant()
  const subtitle = config.appName.replace(config.shortName, '').trim()
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {config.logoUrl ? <img src={config.logoUrl} alt="" className="size-10 rounded-full object-cover" /> : <LogoMark />}
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cn('font-display text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>{config.shortName}</span>
          {subtitle && (
            <span className={cn('text-[10px] font-semibold tracking-[0.22em] uppercase', light ? 'text-white/80' : 'text-rosa-intenso')}>{subtitle}</span>
          )}
        </span>
      )}
    </span>
  )
}
