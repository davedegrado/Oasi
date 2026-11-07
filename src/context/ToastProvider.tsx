import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Info } from 'lucide-react'
import { ToastContext } from './toast-context'

interface ToastItem {
  id: number
  message: string
  tone: 'success' | 'info'
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const toast = useCallback((message: string, tone: 'success' | 'info' = 'success') => {
    const id = ++counter.current
    setItems((prev) => [...prev.slice(-2), { id, message, tone }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-8"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="flex max-w-sm animate-fade-up items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-float"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-rosa text-ink">
              {t.tone === 'success' ? <Check className="size-3.5" /> : <Info className="size-3.5" />}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
