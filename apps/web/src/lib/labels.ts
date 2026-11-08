import type { DocumentCategory, DocumentStatus, LearningStatus, Level, MembershipStatus, Role } from '@/types'

export const LEVEL_LABEL: Record<Level, string> = {
  base: 'Base',
  intermedio: 'Intermedio',
  avanzato: 'Avanzato',
}

export const LEVELS: Level[] = ['base', 'intermedio', 'avanzato']

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
  workshop: 'Workshop',
  stage: 'Stage',
  gara: 'Gara',
  saggio: 'Saggio',
  spettacolo: 'Spettacolo',
  sociale: 'Evento sociale',
} as const

export const REQUEST_STATUS_LABEL = {
  in_attesa: 'In attesa',
  approvata: 'Approvata',
  rifiutata: 'Rifiutata',
} as const

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  personale: 'Documenti personali',
  iscrizione: 'Moduli di iscrizione',
  liberatoria: 'Liberatorie',
  consenso: 'Consensi',
  certificato_medico: 'Certificati medici',
  altro: 'Altri documenti',
}

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  in_verifica: 'In verifica',
  approvato: 'Approvato',
  rifiutato: 'Rifiutato',
  da_sostituire: 'Da sostituire',
}
