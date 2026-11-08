import type { DisciplineInfo } from '@/types'

/** Discipline iniziali della demo Oasi: l'amministrazione può aggiungerne, modificarle e disattivarle */
export const demoDisciplines: DisciplineInfo[] = [
  {
    id: 'cerchio',
    name: 'Cerchio aereo',
    shortName: 'Cerchio',
    description: 'Figure, transizioni ed equilibri sul cerchio sospeso.',
    color: '#D66A9B',
    icon: 'circle',
    hasFigureArchive: true,
    isActive: true,
  },
  {
    id: 'tessuti',
    name: 'Tessuti aerei',
    shortName: 'Tessuti',
    description: 'Arrampicate, chiavi, avvolgimenti e cadute sul tessuto.',
    color: '#8A7BB8',
    icon: 'wind',
    hasFigureArchive: true,
    isActive: true,
  },
]
