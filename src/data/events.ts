import type { Announcement, AssociationInfo, OasiEvent } from '@/types'

type EventSeed = Omit<OasiEvent, 'date' | 'participantIds'> & { inDays: number; participantIds: string[] }

export const demoEventSeeds: EventSeed[] = [
  {
    id: 'evt-workshop-linee',
    title: 'Workshop “Linee e flessibilità”',
    type: 'workshop',
    inDays: 9,
    startTime: '15:00',
    endTime: '17:30',
    location: 'Sala Luna — Viale Verdi 186, Modena',
    description:
      'Un pomeriggio dedicato alla mobilità attiva di anche e spalle, con esercizi a terra e applicazioni su cerchio e tessuti. Aperto a tutti i livelli.',
    image: '/images/photos/tessuti-05.webp',
    capacity: 14,
    participantIds: ['stu-sofia', 'stu-martina', 'stu-camilla', 'stu-anna', 'stu-noemi'],
  },
  {
    id: 'evt-natale',
    title: 'Spettacolo di Natale “Sospese tra le stelle”',
    type: 'spettacolo',
    inDays: 37,
    startTime: '17:00',
    endTime: '19:00',
    location: 'Polisportiva Modena Est',
    description:
      'Il saggio-spettacolo di fine anno: coreografie di gruppo e assoli di cerchio e tessuti, aperto a famiglie e amici. Le prove generali sono il sabato precedente.',
    image: '/images/photos/cerchio-20.webp',
    capacity: 30,
    participantIds: ['stu-giulia', 'stu-alice', 'stu-elisa', 'stu-camilla', 'stu-lucia', 'stu-martina', 'stu-sara'],
  },
  {
    id: 'evt-stage-tessuti',
    title: 'Stage di tessuti con artista ospite',
    type: 'stage',
    inDays: 64,
    startTime: '10:00',
    endTime: '16:00',
    location: 'Sala Seta — Viale Verdi 186, Modena',
    description:
      'Una giornata intensiva con un’artista di circo contemporaneo: sequenze, cadute e creazione di una breve frase coreografica. Riservato ai livelli intermedio e avanzato.',
    image: '/images/photos/tessuti-30.webp',
    capacity: 10,
    participantIds: ['stu-alice', 'stu-ilaria'],
  },
  {
    id: 'evt-aperitivo',
    title: 'Aperitivo di inizio stagione',
    type: 'sociale',
    inDays: -20,
    startTime: '19:30',
    endTime: '22:00',
    location: 'Giardino della sede',
    description: 'Un momento per conoscersi, presentare le insegnanti e il calendario dell’anno sportivo.',
    image: '/images/photos/tessuti-35.webp',
    capacity: 50,
    participantIds: ['stu-giulia', 'stu-sofia', 'stu-alice', 'stu-elisa', 'stu-anna', 'stu-noemi', 'stu-lucia'],
  },
]

type AnnouncementSeed = Omit<Announcement, 'date'> & { daysAgo: number }

export const demoAnnouncementSeeds: AnnouncementSeed[] = [
  {
    id: 'ann-certificato',
    title: 'Certificati medici in scadenza',
    body: 'Ricordati di controllare la scadenza del tuo certificato medico sportivo nella sezione Profilo: senza certificato valido non è possibile salire sugli attrezzi.',
    daysAgo: 1,
    priority: 'importante',
    audience: 'allieve',
  },
  {
    id: 'ann-prove',
    title: 'Prove spettacolo di Natale',
    body: 'Le prove di gruppo per lo spettacolo inizieranno a fine mese durante le lezioni intermedie e avanzate. Porta un body scuro e i capelli raccolti.',
    daysAgo: 3,
    priority: 'normale',
    audience: 'tutti',
  },
  {
    id: 'ann-sala',
    title: 'Nuovo tappeto di sicurezza in Sala Seta',
    body: 'È arrivato il nuovo crash pad da 20 cm: lo useremo per le prime cadute e le figure avanzate.',
    daysAgo: 8,
    priority: 'normale',
    audience: 'tutti',
  },
  {
    id: 'ann-registro',
    title: 'Registro presenze entro domenica',
    body: 'Care insegnanti, ricordate di completare il registro presenze della settimana entro domenica sera.',
    daysAgo: 2,
    priority: 'importante',
    audience: 'insegnanti',
  },
]

export const demoAssociation: AssociationInfo = {
  name: 'Oasi Metropolitana',
  legalForm: 'Associazione Sportiva Dilettantistica e di Promozione Sociale',
  affiliation: 'Affiliata UISP — Modena',
  address: 'Viale Giuseppe Verdi 186, 41121 Modena',
  email: 'oasimetropolitana@gmail.com',
  phone: '+39 339 705 2336',
  website: 'https://www.oasimetropolitana.com',
  season: '2026/2027',
  rooms: ['Sala Luna', 'Sala Seta'],
  settings: {
    maxStudentsPerClass: 8,
    absenceNoticeHours: 12,
    remindersEnabled: true,
    progressVisibleToTeachers: true,
    trialLessonEnabled: true,
  },
}
