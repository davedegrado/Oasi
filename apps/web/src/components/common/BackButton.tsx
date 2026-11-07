import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canGoBackInApp } from './navigationDepth'

/**
 * Torna alla pagina da cui si è arrivati (cronologia dell'app). Se la pagina
 * è stata aperta direttamente (link, ricarica) usa la destinazione di riserva.
 */
export function BackButton({ fallback, label = 'Indietro', className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => (canGoBackInApp() ? navigate(-1) : navigate(fallback))}
      className={cn('mb-4 inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-sm font-semibold text-ink-soft transition hover:text-rosa-intenso', className)}
    >
      <ArrowLeft className="size-4" /> {label}
    </button>
  )
}
