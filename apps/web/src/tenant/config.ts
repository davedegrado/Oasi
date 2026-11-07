import { DEMO_TENANTS, PLATFORM_DEFAULTS } from '@/data/tenants'
import type { TenantConfig } from './types'

/** "demo" = dati locali (default); "api" = backend ASP.NET Core (VITE_API_URL) */
export const DATA_SOURCE: 'demo' | 'api' = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'demo'
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

const PREVIEW_KEY = 'oasi-demo-brand'

export function demoTenant(): TenantConfig {
  let slug: string | null = null
  try {
    slug = localStorage.getItem(PREVIEW_KEY)
  } catch {
    /* storage non disponibile */
  }
  return DEMO_TENANTS.find((t) => t.slug === slug) ?? DEMO_TENANTS[0]
}

export function setDemoBrand(slug: string) {
  try {
    localStorage.setItem(PREVIEW_KEY, slug)
  } catch {
    /* ignora */
  }
}

interface ApiTenantConfig {
  tenant: { slug: string }
  branding: {
    appName: string
    shortName: string
    logoPath: string | null
    coverPath: string | null
    colors: Partial<TenantConfig['colors']>
    texts: Partial<TenantConfig['texts']>
    contacts: TenantConfig['contacts']
  }
  modules: string[]
}

/** Legge la configurazione del tenant dal backend (individuato dal dominio della pagina) */
export async function fetchTenantConfig(): Promise<TenantConfig> {
  const res = await fetch(`${API_URL}/v1/public/tenant-config`, { credentials: 'omit' })
  if (!res.ok) throw new Error(`Configurazione non disponibile (${res.status})`)
  const data = (await res.json()) as ApiTenantConfig
  const b = data.branding
  return {
    slug: data.tenant.slug,
    appName: b.appName,
    shortName: b.shortName,
    logoUrl: b.logoPath,
    coverUrl: b.coverPath,
    colors: { ...PLATFORM_DEFAULTS.colors, ...b.colors },
    texts: { ...PLATFORM_DEFAULTS.texts, welcomeTitle: `Benvenuta in ${b.shortName}`, ...b.texts },
    contacts: b.contacts ?? {},
    modules: data.modules,
    source: 'api',
  }
}

/**
 * Applica il tema: le variabili CSS del design system (Tailwind v4) vengono
 * sovrascritte a runtime, quindi tutti i componenti cambiano colore senza
 * modifiche al codice.
 */
export function applyTheme(config: TenantConfig) {
  const root = document.documentElement.style
  const c = config.colors
  root.setProperty('--color-rosa-intenso', c.primary)
  root.setProperty('--color-cerchio', c.primary)
  root.setProperty('--color-rosa', c.primaryMid)
  root.setProperty('--color-cipria', c.primarySoft)
  root.setProperty('--color-cerchio-soft', c.primarySoft)
  root.setProperty('--color-rosa-scuro', c.primaryStrong)
  root.setProperty('--color-cipria-50', c.background)
  root.setProperty('--color-cipria-100', `color-mix(in srgb, ${c.primarySoft} 45%, white)`)
  root.setProperty('--color-line', `color-mix(in srgb, ${c.primarySoft} 60%, #ebe6e8)`)
  root.setProperty('--color-ink', c.ink)
  document.title = config.appName
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.themeColor)
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', config.shortName)
}
