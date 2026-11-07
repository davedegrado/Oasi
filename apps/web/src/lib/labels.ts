import type { Discipline, LearningStatus, Level, MembershipStatus, Role } from '@/types'

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  cerchio: 'Cerchio aereo',
  tessuti: 'Tessuti aerei',
}

export const DISCIPLINE_SHORT: Record<Discipline, string> = {
  cerchio: 'Cerchio',
  tessuti: 'Tessuti',
}

export const LEVEL_LABEL: Record<Level, string> = {
  base: 'Base',
  intermedio: 'Intermedio',
  avanzato: 'Avanzato',
}

export const LEVELS: Level[] = ['base', 'intermedio', 'avanzato']
export const DISCIPLINES: Discipline[] = ['cerchio', 'tessuti']

export const STATUS_ORDER: LearningStatus[] = ['da_imparare', 'in_progetto', 'riuscita']

export const STATUS_LABEL: Record<LearningStatus, string> = {
  da_imparare: 'Da imparare',
  riuscita: 'Riuscita',
  in_progetto: 'In progetto',
}

export const STATUS_HINT: Record<LearningStatus, string> = {
  da_imparare: 'Non ancora affrontata',
  riuscita: 'Eseguita in autonomia',
  in_progetto: 'Ci sto lavorando o è un mio obiettivo',
}

export const MEMBERSHIP_LABEL: Record<MembershipStatus, string> = {
  attiva: 'Attiva',
  in_scadenza: 'In scadenza',
  sospesa: 'Sospesa',
  prova: 'Lezione di prova',
}

export const ROLE_LABEL: Record<Role, string> = {
  allieva: 'Allieva',
  insegnante: 'Insegnante',
  admin: 'Amministratore',
}

export const EVENT_TYPE_LABEL = {
  spettacolo: 'Spettacolo',
  workshop: 'Workshop',
  stage: 'Stage',
  sociale: 'Evento sociale',
} as const
