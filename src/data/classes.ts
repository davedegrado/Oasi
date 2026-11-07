import type { ClassGroup } from '@/types'

/** Classi dimostrative. Gli iscritti vengono derivati da people.ts in seed.ts */
export const demoClasses: Omit<ClassGroup, 'studentIds'>[] = [
  {
    id: 'cls-cerchio-base', name: 'Cerchio Base', discipline: 'cerchio', level: 'base', teacherId: 'tch-chiara',
    weekday: 1, startTime: '18:30', endTime: '20:00', room: 'Sala Luna', capacity: 8,
    description: 'Primo approccio al cerchio aereo: salite, sedute, prime figure e condizionamento specifico.',
  },
  {
    id: 'cls-tessuti-base', name: 'Tessuti Base', discipline: 'tessuti', level: 'base', teacherId: 'tch-elena',
    weekday: 2, startTime: '19:00', endTime: '20:30', room: 'Sala Seta', capacity: 8,
    description: 'Chiavi di piede, arrampicate e prime inversioni a bassa quota, con grande attenzione alla sicurezza.',
  },
  {
    id: 'cls-cerchio-int', name: 'Cerchio Intermedio', discipline: 'cerchio', level: 'intermedio', teacherId: 'tch-chiara',
    weekday: 3, startTime: '19:30', endTime: '21:00', room: 'Sala Luna', capacity: 8,
    description: 'Figure sopra e sotto la barra, transizioni e prime combinazioni coreografiche.',
  },
  {
    id: 'cls-tessuti-int', name: 'Tessuti Intermedio', discipline: 'tessuti', level: 'intermedio', teacherId: 'tch-elena',
    weekday: 4, startTime: '18:30', endTime: '20:00', room: 'Sala Seta', capacity: 8,
    description: 'Avvolgimenti complessi, figure in quota e preparazione alle prime cadute controllate.',
  },
  {
    id: 'cls-avanzato', name: 'Tessuti Avanzato', discipline: 'tessuti', level: 'avanzato', teacherId: 'tch-valentina',
    weekday: 5, startTime: '19:00', endTime: '21:00', room: 'Sala Seta', capacity: 6,
    description: 'Cadute, sequenze coreografiche e lavoro artistico per gli spettacoli.',
  },
  {
    id: 'cls-cerchio-avz', name: 'Cerchio Avanzato', discipline: 'cerchio', level: 'avanzato', teacherId: 'tch-valentina',
    weekday: 6, startTime: '10:30', endTime: '12:00', room: 'Sala Luna', capacity: 6,
    description: 'Equilibri, figure di forza e lavoro dinamico con rotazione del cerchio.',
  },
]
