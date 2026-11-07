/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'demo' | 'api'
  readonly VITE_API_URL?: string
  readonly VITE_ROUTER?: 'memory' | 'browser'
}
