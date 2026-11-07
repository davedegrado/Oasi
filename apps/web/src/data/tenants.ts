import type { TenantConfig } from '@/tenant/types'
import { asset, photo } from '@/lib/assets'

const ALL_MODULES = [
  'users', 'students', 'guardians', 'teachers', 'classes', 'calendar', 'bookings', 'attendance', 'makeups',
  'payments', 'events', 'communications', 'notifications', 'figure_archive', 'progress', 'media', 'reports', 'administration',
]

/** Valori predefiniti della piattaforma: usati quando un tenant non configura un elemento */
export const PLATFORM_DEFAULTS: Pick<TenantConfig, 'colors' | 'texts'> = {
  colors: {
    primary: '#D66A9B',
    primaryMid: '#E9A4C0',
    primarySoft: '#F7DCE8',
    primaryStrong: '#B8507F',
    background: '#FFF7FA',
    ink: '#242124',
    themeColor: '#E9A4C0',
  },
  texts: {
    welcomeTitle: 'Benvenuta',
    welcomeEyebrow: 'La tua palestra',
    welcomeBody:
      'Il tuo spazio per seguire le lezioni, ritrovare ogni figura con la sua sequenza fotografica e vedere crescere i tuoi progressi, lezione dopo lezione.',
  },
}

/**
 * Configurazioni dimostrative (modalità demo, senza backend).
 * Studio Prova serve solo come anteprima del marchio: i dati restano quelli della demo Oasi.
 */
export const DEMO_TENANTS: TenantConfig[] = [
  {
    slug: 'oasi-metropolitana',
    appName: 'Oasi Metropolitana',
    shortName: 'Oasi',
    logoUrl: asset('images/logo-oasi.webp'),
    coverUrl: photo('cerchio-12'),
    colors: PLATFORM_DEFAULTS.colors,
    texts: {
      welcomeTitle: 'Benvenuta nella tua Oasi',
      welcomeEyebrow: 'Danza aerea · Modena',
      welcomeBody:
        'Il tuo spazio per seguire le lezioni di cerchio e tessuti aerei, ritrovare ogni figura con la sua sequenza fotografica e vedere crescere i tuoi progressi, lezione dopo lezione.',
    },
    contacts: {
      email: 'oasimetropolitana@gmail.com',
      address: 'Viale Giuseppe Verdi 186, 41121 Modena',
      legalForm: 'Associazione Sportiva Dilettantistica e di Promozione Sociale',
      affiliation: 'Affiliata UISP — Modena',
    },
    modules: ALL_MODULES,
    source: 'demo',
  },
  {
    slug: 'studio-prova',
    appName: 'Studio Prova',
    shortName: 'Prova',
    logoUrl: null,
    coverUrl: photo('tessuti-28'),
    colors: {
      primary: '#2F7D74',
      primaryMid: '#8CC7BD',
      primarySoft: '#D7EFEA',
      primaryStrong: '#1F5C55',
      background: '#F6FBFA',
      ink: '#1E2524',
      themeColor: '#2F7D74',
    },
    texts: {
      welcomeTitle: 'Benvenuta allo Studio Prova',
      welcomeEyebrow: 'Anteprima marchio · demo',
      welcomeBody: 'Stessa piattaforma, identità diversa: colori, nome e testi arrivano dalla configurazione della palestra.',
    },
    contacts: { email: 'info@studio-prova.example', address: 'Via di Prova 1, Bologna' },
    modules: ALL_MODULES,
    source: 'demo',
  },
]
