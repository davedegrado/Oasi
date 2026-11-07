import type { Student, Teacher } from '@/types'

/**
 * Persone dimostrative. Nomi di fantasia: nessun riferimento a persone reali.
 * Le date relative (iscrizione, scadenze) vengono calcolate in seed.ts.
 */
export const demoTeachers: Teacher[] = [
  {
    id: 'tch-chiara',
    firstName: 'Chiara',
    lastName: 'Ferrari',
    avatar: '',
    disciplines: ['cerchio'],
    bio: 'Insegnante di cerchio aereo, formazione in ginnastica ritmica e danza contemporanea. Ama le linee pulite e le transizioni fluide.',
    email: 'chiara.ferrari@oasi-demo.it',
    phone: '+39 333 000 1101',
    since: 2017,
  },
  {
    id: 'tch-elena',
    firstName: 'Elena',
    lastName: 'Martinelli',
    avatar: '',
    disciplines: ['tessuti'],
    bio: 'Specializzata in tessuti aerei e sicurezza delle prese. Costruisce i percorsi partendo da forza, consapevolezza e respiro.',
    email: 'elena.martinelli@oasi-demo.it',
    phone: '+39 333 000 1102',
    since: 2019,
  },
  {
    id: 'tch-valentina',
    firstName: 'Valentina',
    lastName: 'Rossi',
    avatar: '',
    disciplines: ['cerchio', 'tessuti'],
    bio: 'Performer e coreografa, segue i gruppi avanzati e la preparazione degli spettacoli di fine anno.',
    email: 'valentina.rossi@oasi-demo.it',
    phone: '+39 333 000 1103',
    since: 2015,
  },
]

type StudentSeed = Omit<Student, 'joinedAt' | 'membership'> & {
  joinedMonthsAgo: number
  membershipStatus: Student['membership']['status']
  feePlan: string
}

export const demoStudentSeeds: StudentSeed[] = [
  {
    id: 'stu-giulia', firstName: 'Giulia', lastName: 'Bianchi', avatar: '', birthDate: '1994-03-18',
    email: 'giulia.bianchi@email-demo.it', phone: '+39 347 120 0001', level: 'intermedio', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-int', 'cls-tessuti-int'], joinedMonthsAgo: 26, membershipStatus: 'attiva', feePlan: 'Bisettimanale annuale',
    goals: ['Chiudere la Gazelle con le gambe tese', 'Imparare la Delilah entro la primavera', 'Preparare un piccolo duo per lo spettacolo di Natale'],
  },
  {
    id: 'stu-sofia', firstName: 'Sofia', lastName: 'Galli', avatar: '', birthDate: '1998-07-02',
    email: 'sofia.galli@email-demo.it', phone: '+39 347 120 0002', level: 'base', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-base'], joinedMonthsAgo: 4, membershipStatus: 'attiva', feePlan: 'Monosettimanale trimestrale',
    goals: ['Salire nel cerchio senza aiuto', 'Tenere il Man in the Moon per 10 secondi'],
  },
  {
    id: 'stu-martina', firstName: 'Martina', lastName: 'Conti', avatar: '', birthDate: '1991-11-25',
    email: 'martina.conti@email-demo.it', phone: '+39 347 120 0003', level: 'intermedio', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-int'], joinedMonthsAgo: 18, membershipStatus: 'attiva', feePlan: 'Monosettimanale annuale',
    goals: ['Russian Climb fino in cima', 'Cross Back Straddle pulita'],
  },
  {
    id: 'stu-alice', firstName: 'Alice', lastName: 'Ricci', avatar: '', birthDate: '2001-01-09',
    email: 'alice.ricci@email-demo.it', phone: '+39 347 120 0004', level: 'avanzato', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-int', 'cls-avanzato'], joinedMonthsAgo: 40, membershipStatus: 'attiva', feePlan: 'Bisettimanale annuale',
    goals: ['Prima caduta Star Drop', 'Coreografia solista per la primavera'],
  },
  {
    id: 'stu-francesca', firstName: 'Francesca', lastName: 'Moretti', avatar: '', birthDate: '1988-05-30',
    email: 'francesca.moretti@email-demo.it', phone: '+39 347 120 0005', level: 'base', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-base'], joinedMonthsAgo: 2, membershipStatus: 'prova', feePlan: 'Carnet 10 ingressi',
    goals: ['Foot Lock su entrambi i piedi'],
  },
  {
    id: 'stu-sara', firstName: 'Sara', lastName: 'Lombardi', avatar: '', birthDate: '1996-09-14',
    email: 'sara.lombardi@email-demo.it', phone: '+39 347 120 0006', level: 'intermedio', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-int'], joinedMonthsAgo: 14, membershipStatus: 'in_scadenza', feePlan: 'Monosettimanale annuale',
    goals: ['Mermaid con apertura completa', 'Migliorare la forza delle spalle'],
  },
  {
    id: 'stu-beatrice', firstName: 'Beatrice', lastName: 'Marchetti', avatar: '', birthDate: '2003-04-21',
    email: 'beatrice.marchetti@email-demo.it', phone: '+39 347 120 0007', level: 'base', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-base'], joinedMonthsAgo: 6, membershipStatus: 'attiva', feePlan: 'Monosettimanale trimestrale',
    goals: ['Bird’s Nest con assistenza', 'Lavorare sulla flessibilità delle anche'],
  },
  {
    id: 'stu-anna', firstName: 'Anna', lastName: 'Barbieri', avatar: '', birthDate: '1985-12-03',
    email: 'anna.barbieri@email-demo.it', phone: '+39 347 120 0008', level: 'base', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-base'], joinedMonthsAgo: 7, membershipStatus: 'attiva', feePlan: 'Monosettimanale annuale',
    goals: ['Prima inversione in aria', 'Hip Key in autonomia'],
  },
  {
    id: 'stu-elisa', firstName: 'Elisa', lastName: 'Fontana', avatar: '', birthDate: '1999-06-17',
    email: 'elisa.fontana@email-demo.it', phone: '+39 347 120 0009', level: 'avanzato', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-avz'], joinedMonthsAgo: 48, membershipStatus: 'attiva', feePlan: 'Open annuale',
    goals: ['Back Balance senza mani', 'Sequenza Delilah → Splits'],
  },
  {
    id: 'stu-camilla', firstName: 'Camilla', lastName: 'Santoro', avatar: '', birthDate: '2000-10-08',
    email: 'camilla.santoro@email-demo.it', phone: '+39 347 120 0010', level: 'intermedio', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-int', 'cls-cerchio-int'], joinedMonthsAgo: 20, membershipStatus: 'attiva', feePlan: 'Bisettimanale annuale',
    goals: ['Crochet fluido', 'Angel con braccia libere'],
  },
  {
    id: 'stu-noemi', firstName: 'Noemi', lastName: 'Rinaldi', avatar: '', birthDate: '1993-02-27',
    email: 'noemi.rinaldi@email-demo.it', phone: '+39 347 120 0011', level: 'base', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-base', 'cls-tessuti-base'], joinedMonthsAgo: 3, membershipStatus: 'attiva', feePlan: 'Bisettimanale trimestrale',
    goals: ['Seduta e Man in the Moon', 'Arrampicata Russian Climb'],
  },
  {
    id: 'stu-ilaria', firstName: 'Ilaria', lastName: 'Gatti', avatar: '', birthDate: '1990-08-11',
    email: 'ilaria.gatti@email-demo.it', phone: '+39 347 120 0012', level: 'avanzato', mainDiscipline: 'tessuti',
    classIds: ['cls-avanzato'], joinedMonthsAgo: 60, membershipStatus: 'sospesa', feePlan: 'Monosettimanale annuale',
    goals: ['Rientro dopo infortunio alla spalla', 'Ritrovare la Cross Back Straddle'],
  },
  {
    id: 'stu-lucia', firstName: 'Lucia', lastName: 'Ferraresi', avatar: '', birthDate: '1997-12-19',
    email: 'lucia.ferraresi@email-demo.it', phone: '+39 347 120 0013', level: 'intermedio', mainDiscipline: 'cerchio',
    classIds: ['cls-cerchio-int', 'cls-cerchio-avz'], joinedMonthsAgo: 22, membershipStatus: 'attiva', feePlan: 'Bisettimanale annuale',
    goals: ['Amazon con linee pulite'],
  },
  {
    id: 'stu-greta', firstName: 'Greta', lastName: 'Pellacani', avatar: '', birthDate: '2002-03-05',
    email: 'greta.pellacani@email-demo.it', phone: '+39 347 120 0014', level: 'base', mainDiscipline: 'tessuti',
    classIds: ['cls-tessuti-base', 'cls-cerchio-base'], joinedMonthsAgo: 1, membershipStatus: 'prova', feePlan: 'Lezione di prova',
    goals: ['Capire quale disciplina preferisco'],
  },
]
