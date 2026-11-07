import { cn } from '@/lib/utils'

/** Marchio: un cerchio aereo sospeso attraversato da un tessuto */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn('size-10', className)} aria-hidden>
      <circle cx="24" cy="24" r="23" fill="#F7DCE8" />
      <path d="M24 3.5v6.5" stroke="#242124" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="24" cy="25.5" r="13.5" stroke="#D66A9B" strokeWidth="3" />
      <path d="M24 5C14 9 6 18 8.5 28S16 39 13 45" stroke="#E9A4C0" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 5c6 5 17 10 15.5 21" stroke="#F0C4D6" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className, compact, light }: { className?: string; compact?: boolean; light?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cn('font-display text-xl font-extrabold tracking-tight', light ? 'text-white' : 'text-ink')}>Oasi</span>
          <span className={cn('text-[10px] font-semibold tracking-[0.22em] uppercase', light ? 'text-white/80' : 'text-rosa-intenso')}>Metropolitana</span>
        </span>
      )}
    </span>
  )
}
