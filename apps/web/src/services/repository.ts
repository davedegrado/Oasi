import type {
  AppNotification,
  Closure,
  DisciplineInfo,
  DocumentType,
  SharedDocument,
  Teacher,
  AssociationInfo,
  AttendanceMark,
  ClassGroup,
  Figure,
  FigureProgress,
  Lesson,
  OasiDatabase,
  OasiEvent,
  Student,
} from '@/types'

/**
 * Contratto del livello dati.
 *
 * I componenti non accedono mai direttamente a localStorage o ai dati demo:
 * leggono uno snapshot del database e invocano questi metodi asincroni.
 * Per passare a Supabase sarà sufficiente fornire una nuova implementazione
 * (es. SupabaseRepository) che rispetti questa interfaccia.
 */
export interface OasiRepository {
  /** Snapshot corrente (immutabile) dei dati */
  getSnapshot(): OasiDatabase
  /** Notifica i cambiamenti dello snapshot */
  subscribe(listener: () => void): () => void

  // Progressi allieve
  updateProgress(studentId: string, figureId: string, patch: Partial<Omit<FigureProgress, 'updatedAt'>>): Promise<void>

  // Lezioni e presenze
  setAttendance(lessonId: string, studentId: string, mark: AttendanceMark | null): Promise<void>
  setAllAttendance(lessonId: string, mark: AttendanceMark): Promise<void>
  updateLesson(lessonId: string, patch: Partial<Pick<Lesson, 'status' | 'startTime' | 'endTime' | 'note'>>): Promise<void>

  /** Presenza o assenza annunciata in anticipo dall'allieva (null = annulla) */
  setDeclaration(lessonId: string, studentId: string, mark: AttendanceMark | null): Promise<void>

  // Richieste di iscrizione e di recupero
  requestEnrollment(classId: string, studentId: string, note: string): Promise<void>
  requestMakeup(studentId: string, targetLessonId: string, missedLessonId: string | undefined, note: string): Promise<void>
  /** Approva o rifiuta; decidedBy = id insegnante o 'admin'. Rifiuta se la classe è piena. */
  decideEnrollment(requestId: string, approve: boolean, decidedBy: string): Promise<void>
  decideMakeup(requestId: string, approve: boolean, decidedBy: string): Promise<void>
  cancelRequest(kind: 'enrollment' | 'makeup', requestId: string): Promise<void>

  // Persone (inviti simulati via email)
  addStudent(student: Student): Promise<void>
  addTeacher(teacher: Teacher): Promise<void>

  // Chiusure: festività, scioperi, chiusure della sede
  saveClosure(closure: Closure): Promise<void>
  deleteClosure(closureId: string): Promise<void>
  sendClosureReminder(closureId: string): Promise<void>

  // Notifiche
  notify(notification: Omit<AppNotification, 'id' | 'createdAt' | 'readBy'>): Promise<void>
  markNotificationsRead(recipientKey: string, ids: string[]): Promise<void>

  // Figure
  saveFigure(figure: Figure): Promise<void>
  deleteFigure(figureId: string): Promise<void>

  // Classi
  saveClass(cls: ClassGroup): Promise<void>
  deleteClass(classId: string): Promise<void>

  // Allieve
  updateStudent(studentId: string, patch: Partial<Student>): Promise<void>

  // Eventi
  saveEvent(event: OasiEvent): Promise<void>
  deleteEvent(eventId: string): Promise<void>
  toggleEventParticipation(eventId: string, studentId: string): Promise<void>

  // Discipline (dati della palestra): la disattivazione conserva classi, allieve e storico
  saveDiscipline(discipline: DisciplineInfo): Promise<void>

  // Archivio documentale: un documento appartiene a un profilo, l'archivio lo legge senza copiarlo
  saveDocumentType(type: DocumentType): Promise<void>
  /** Caricamento (o sostituzione) di un file: crea una nuova versione in verifica */
  uploadDocument(input: DocumentUpload): Promise<void>
  reviewDocument(documentId: string, decision: DocumentDecision, note: string): Promise<void>
  saveSharedDocument(doc: SharedDocument): Promise<void>
  deleteSharedDocument(id: string): Promise<void>

  // Associazione
  updateAssociation(patch: Partial<AssociationInfo>): Promise<void>

  /** Ripristina i dati dimostrativi iniziali */
  reset(): Promise<void>
}

export interface DocumentUpload {
  memberId: string
  typeId: string
  /** chi carica: id dell'allieva o 'admin' */
  uploadedBy: string
  fileName: string
  fileType: string
  fileSize: number
  fileData: string
  /** il file caricato è già firmato a mano */
  signedUpload: boolean
  /** scadenza (es. certificato medico); se assente si usa la validità della tipologia */
  expiresOn?: string
}

export type DocumentDecision = 'approva' | 'rifiuta' | 'richiedi_sostituzione'
