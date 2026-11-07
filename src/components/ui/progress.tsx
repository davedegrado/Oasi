import { cn } from '@/lib/utils'

export function ProgressBar({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-cipria-100', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full bg-gradient-to-r from-rosa to-rosa-intenso transition-all duration-700', barClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}
