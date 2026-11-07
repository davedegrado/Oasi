import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTenant } from '@/hooks/useTenant'

/** Avvisa quando è disponibile una nuova versione della webapp installata */
export function UpdatePrompt() {
  const { config } = useTenant()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Controllo aggiornamenti ogni ora mentre l'app è aperta
      if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md animate-fade-up items-center gap-3 rounded-3xl border border-line bg-white p-3 pl-4 shadow-float">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cipria text-rosa-scuro">
        <RefreshCw className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-medium text-ink">È disponibile una nuova versione di {config.shortName}.</p>
      <Button size="sm" onClick={() => updateServiceWorker(true)}>
        Aggiorna
      </Button>
      <button type="button" aria-label="Più tardi" onClick={() => setNeedRefresh(false)} className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-cipria-100">
        <X className="size-4" />
      </button>
    </div>
  )
}
