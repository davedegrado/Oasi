import { createContext } from 'react'
import type { TenantConfig } from './types'

export interface TenantContextValue {
  config: TenantConfig
  /** Solo modalità demo: anteprima di un altro marchio */
  previewBrand: (slug: string) => void
  hasModule: (key: string) => boolean
}

export const TenantContext = createContext<TenantContextValue | null>(null)
