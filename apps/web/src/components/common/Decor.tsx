import { cn } from '@/lib/utils'

/** Arco decorativo che richiama il cerchio aereo */
export function HoopArc({ className, strokeWidth = 1.5 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" className={cn('pointer-events-none', className)} aria-hidden>
      <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth={strokeWidth} strokeDasharray="2 7" strokeLinecap="round" />
      <path d="M100 8a92 92 0 0 1 92 92" stroke="currentColor" strokeWidth={strokeWidth * 2} strokeLinecap="round" />
    </svg>
  )
}

/** Linee morbide che richiamano i tessuti */
export function SilkLines({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 120" fill="none" preserveAspectRatio="none" className={cn('pointer-events-none', className)} aria-hidden>
      <path d="M0 80C60 40 110 110 180 70S300 10 400 50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M0 95C70 60 120 120 200 85S320 30 400 70" stroke="currentColor" strokeOpacity=".55" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M0 108C80 82 140 125 220 100S330 55 400 88" stroke="currentColor" strokeOpacity=".3" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
