/** Configurazione white-label di un tenant (palestra), letta da /v1/public/tenant-config */
export interface TenantColors {
  primary: string
  primaryMid: string
  primarySoft: string
  primaryStrong: string
  background: string
  ink: string
  themeColor: string
}

export interface TenantTexts {
  welcomeTitle: string
  welcomeEyebrow: string
  welcomeBody: string
}

export interface TenantConfig {
  slug: string
  appName: string
  shortName: string
  logoUrl: string | null
  coverUrl: string | null
  colors: TenantColors
  texts: TenantTexts
  contacts: { email?: string; phone?: string; address?: string; website?: string; legalForm?: string; affiliation?: string }
  modules: string[]
  source: 'demo' | 'api'
}

export type ModuleKey =
  | 'users' | 'students' | 'guardians' | 'teachers' | 'classes' | 'calendar' | 'bookings' | 'attendance' | 'makeups'
  | 'payments' | 'events' | 'communications' | 'notifications' | 'figure_archive' | 'progress' | 'media' | 'reports' | 'administration'
