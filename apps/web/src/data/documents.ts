import type { DocumentType, MemberDocument, SharedDocument } from '@/types'
import { addDays } from '@/lib/dates'

/** PDF di esempio (una pagina) usato per i documenti dimostrativi */
export const DEMO_PDF = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNTk1IDg0Ml0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggNjY+PnN0cmVhbQpCVCAvRjEgMTggVGYgNzIgNzYwIFRkIChEb2N1bWVudG8gZGltb3N0cmF0aXZvIC0gT2FzaSBNZXRyb3BvbGl0YW5hKSBUaiBFVAplbmRzdHJlYW0gZW5kb2JqCjUgMCBvYmo8PC9UeXBlL0ZvbnQvU3VidHlwZS9UeXBlMS9CYXNlRm9udC9IZWx2ZXRpY2E+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G'

export const demoDocumentTypes: DocumentType[] = [
  {
    id: 'dt-iscrizione', name: 'Modulo di iscrizione 2026/27', category: 'iscrizione', required: true, signatureMode: 'caricamento_firmato', sensitive: false, active: true,
    description: 'Modulo firmato con i dati anagrafici e la scelta dei corsi. Scaricalo dai documenti della palestra, firmalo e caricalo.',
  },
  {
    id: 'dt-certificato', name: 'Certificato medico sportivo', category: 'certificato_medico', required: true, signatureMode: 'nessuna', validityMonths: 12, sensitive: true, active: true,
    description: 'Certificato di idoneità all’attività sportiva non agonistica, valido 12 mesi. Visibile solo a te e alla segreteria.',
  },
  {
    id: 'dt-liberatoria', name: 'Liberatoria attività aeree', category: 'liberatoria', required: true, signatureMode: 'caricamento_firmato', sensitive: false, active: true,
    description: 'Presa visione dei rischi e del regolamento: scaricala dai documenti della palestra, firmala a mano e caricala.',
  },
  {
    id: 'dt-immagini', name: 'Consenso foto e video', category: 'consenso', required: false, signatureMode: 'caricamento_firmato', sensitive: false, active: true,
    description: 'Autorizzazione facoltativa all’uso di foto e video, da firmare a mano e caricare.',
  },
  {
    id: 'dt-identita', name: 'Documento d’identità', category: 'personale', required: false, signatureMode: 'nessuna', sensitive: false, active: true,
    description: 'Carta d’identità o passaporto, richiesto per il tesseramento.',
  },
]

type DocSeed = Omit<MemberDocument, 'uploadedAt' | 'expiresOn' | 'history' | 'reviewedAt'> & { daysAgo: number; expiresIn?: number; reviewedDaysAgo?: number }

const seeds: DocSeed[] = [
  { id: 'doc-giulia-isc', memberId: 'stu-giulia', typeId: 'dt-iscrizione', version: 1, current: true, status: 'approvato', fileName: 'iscrizione-giulia.pdf', fileType: 'application/pdf', fileSize: 48210, fileData: DEMO_PDF, signedByHand: true, uploadedBy: 'stu-giulia', daysAgo: 60, reviewedDaysAgo: 58 },
  { id: 'doc-giulia-cert', memberId: 'stu-giulia', typeId: 'dt-certificato', version: 1, current: true, status: 'approvato', fileName: 'certificato-medico.pdf', fileType: 'application/pdf', fileSize: 112400, fileData: DEMO_PDF, uploadedBy: 'stu-giulia', daysAgo: 90, expiresIn: 275, reviewedDaysAgo: 88 },
  { id: 'doc-giulia-lib', memberId: 'stu-giulia', typeId: 'dt-liberatoria', version: 1, current: true, status: 'approvato', fileName: 'liberatoria-firmata.pdf', fileType: 'application/pdf', fileSize: 61000, fileData: DEMO_PDF, signedByHand: true, uploadedBy: 'stu-giulia', daysAgo: 60, reviewedDaysAgo: 59 },
  { id: 'doc-sara-cert', memberId: 'stu-sara', typeId: 'dt-certificato', version: 1, current: true, status: 'approvato', fileName: 'certificato.pdf', fileType: 'application/pdf', fileSize: 98000, fileData: DEMO_PDF, uploadedBy: 'stu-sara', daysAgo: 353, expiresIn: 12, reviewedDaysAgo: 350 },
  { id: 'doc-martina-isc', memberId: 'stu-martina', typeId: 'dt-iscrizione', version: 1, current: true, status: 'in_verifica', fileName: 'modulo-iscrizione-martina.pdf', fileType: 'application/pdf', fileSize: 52000, fileData: DEMO_PDF, signedByHand: true, uploadedBy: 'stu-martina', daysAgo: 1 },
  { id: 'doc-francesca-isc', memberId: 'stu-francesca', typeId: 'dt-iscrizione', version: 1, current: true, status: 'da_sostituire', fileName: 'iscrizione-foto.jpg', fileType: 'image/jpeg', fileSize: 1400000, fileData: DEMO_PDF, uploadedBy: 'stu-francesca', daysAgo: 6, reviewedDaysAgo: 4, reviewNote: 'Manca la firma nella seconda pagina: carica il modulo completo.' },
  { id: 'doc-ilaria-cert', memberId: 'stu-ilaria', typeId: 'dt-certificato', version: 1, current: true, status: 'approvato', fileName: 'certificato-2025.pdf', fileType: 'application/pdf', fileSize: 87000, fileData: DEMO_PDF, uploadedBy: 'stu-ilaria', daysAgo: 380, expiresIn: -15, reviewedDaysAgo: 378 },
]

export function buildDemoDocuments(today: string): MemberDocument[] {
  return seeds.map(({ daysAgo, expiresIn, reviewedDaysAgo, ...d }) => {
    const uploadedAt = addDays(today, -daysAgo)
    const history: MemberDocument['history'] = [
      { action: 'caricato', at: uploadedAt, by: d.uploadedBy },
    ]
    if (reviewedDaysAgo !== undefined) {
      history.push({ action: d.status === 'da_sostituire' ? 'sostituzione_richiesta' : 'approvato', at: addDays(today, -reviewedDaysAgo), by: 'admin', note: d.reviewNote })
    }
    return {
      ...d,
      uploadedAt,
      expiresOn: expiresIn !== undefined ? addDays(today, expiresIn) : undefined,
      reviewedAt: reviewedDaysAgo !== undefined ? addDays(today, -reviewedDaysAgo) : undefined,
      history,
    }
  })
}

export function buildSharedDocuments(today: string): SharedDocument[] {
  return [
    { id: 'sh-regolamento', title: 'Regolamento interno 2026/27', description: 'Norme di comportamento, sicurezza e uso degli attrezzi.', fileName: 'regolamento-oasi.pdf', fileType: 'application/pdf', fileData: DEMO_PDF, audience: 'tutti', uploadedAt: addDays(today, -40) },
    { id: 'sh-modulo', title: 'Moduli da stampare e firmare', description: 'Iscrizione, liberatoria e consenso foto: stampali, firmali a mano e caricali nella sezione Documenti.', fileName: 'modulo-iscrizione.pdf', fileType: 'application/pdf', fileData: DEMO_PDF, audience: 'allieve', uploadedAt: addDays(today, -40) },
  ]
}
