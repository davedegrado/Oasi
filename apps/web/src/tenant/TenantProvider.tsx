import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DATA_SOURCE, applyTheme, demoTenant, fetchTenantConfig, setDemoBrand } from './config'
import { TenantContext } from './tenant-context'
import type { TenantConfig } from './types'

/** Carica la configurazione white-label e applica il tema prima di mostrare l'app */
export function TenantProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<TenantConfig | null>(() => (DATA_SOURCE === 'demo' ? demoTenant() : null))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (DATA_SOURCE !== 'api') return
    fetchTenantConfig().then(setConfig, (e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (config) applyTheme(config)
  }, [config])

  const previewBrand = useCallback((slug: string) => {
    setDemoBrand(slug)
    setConfig(demoTenant())
  }, [])

  const value = useMemo(
    () => (config ? { config, previewBrand, hasModule: (key: string) => config.modules.includes(key) } : null),
    [config, previewBrand],
  )

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-display text-xl font-bold">Palestra non trovata</p>
          <p className="mt-1 text-sm text-ink-muted">Questo indirizzo non è collegato a nessuna palestra. ({error})</p>
        </div>
      </div>
    )
  }
  if (!value) return <div className="min-h-dvh bg-cipria-50" aria-busy="true" />
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}
