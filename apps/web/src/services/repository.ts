import type {
  AppNotification,
  Closure,
  DisciplineInfo,
  DocumentType,
  SharedDocument,
  Teacher,
  AssociationInfo,
  AttendanceMark,
  FeePlan,
  ClassGroup,
  Figure,
  FigureProgress,
  Lesson,
  OasiDatabase,
  OasiEvent,
  Student,
  EventGroup,
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

  // Progressi atleti
  updateProgress(studentId: string, figureId: string, patch: Partial<Omit<FigureProgress, 'updatedAt'>>): Promise<void>

  // Lezioni e presenze
  setAttendance(lessonId: string, studentId: string, mark: AttendanceMark | null): Promise<void>
  setAllAttendance(lessonId: string, mark: AttendanceMark): Promise<void>
  updateLesson(lessonId: string, patch: Partial<Pick<Lesson, 'status' | 'startTime' | 'endTime' | 'note'>>): Promise<void>

  /** Presenza o assenza annunciata in anticipo dall'atleta (null = annulla) */
  setDeclaration(lessonId: string, studentId: string, mark: AttendanceMark | null): Promise<void>

  // Richieste di iscrizione e di recupero
  /** L'atleta chiede l'iscrizione scegliendo il piano; il piano parte quando l'iscrizione viene accettata */
  requestEnrollment(classId: string, studentId: string, note: string, planId: string): Promise<void>
  /** L'atleta già iscritta sceglie un nuovo piano per la classe (rinnovo): vale da subito */
  choosePlan(studentId: string, classId: string, planId: string): Promise<void>
  requestMakeup(studentId: string, targetLessonId: string, missedLessonId: string | undefined, note: string): Promise<void>
  /** Approva o rifiuta; decidedBy = id insegnante o 'admin'. Rifiuta se la classe è piena. */
  decideEnrollment(requestId: string, approve: boolean, decidedBy: string): Promise<void>
  decideMakeup(requestId: string, approve: boolean, decidedBy: string): Promise<void>
  cancelRequest(kind: 'enrollment' | 'makeup', requestId: string): Promise<void>

  // Persone (inviti simulati via email)
  addStudent(student: Student): Promise<void>
  /** La segreteria assegna o corregge il numero di tessera e la sua validità (numero unico nella palestra) */
  assignCard(studentId: string, cardNumber: string, expiresAt: string): Promise<void>
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

  // Atleti
  updateStudent(studentId: string, patch: Partial<Student>): Promise<void>

  // Eventi
  saveEvent(event: OasiEvent): Promise<void>
  deleteEvent(eventId: string): Promise<void>
  toggleEventParticipation(eventId: string, studentId: string): Promise<void>
  /** Crea o modifica un gruppo dell'evento (insegnanti e amministrazione): solo partecipanti, anche in più gruppi */
  saveEventGroup(eventId: string, group: EventGroup): Promise<void>
  deleteEventGroup(eventId: string, groupId: string): Promise<void>

  // Discipline (dati della palestra): la disattivazione conserva classi, atleti e storico
  saveDiscipline(discipline: DisciplineInfo): Promise<void>

  // Archivio documentale: un documento appartiene a un profilo, l'archivio lo legge senza copiarlo
  saveDocumentType(type: DocumentType): Promise<void>
  /** Caricamento (o sostituzione) di un file: crea una nuova versione in verifica */
  uploadDocument(input: DocumentUpload): Promise<void>
  reviewDocument(documentId: string, decision: DocumentDecision, note: string): Promise<void>
  /** Data di scadenza scritta o corretta: dalla segreteria resta com'è, dall'interessata torna in verifica */
  setDocumentExpiry(documentId: string, expiresOn: string | null, by: string): Promise<void>
  saveSharedDocument(doc: SharedDocument): Promise<void>
  deleteSharedDocument(id: string): Promise<void>

  // Sale della palestra
  addRoom(name: string): Promise<void>
  /** Rinomina la sala anche nelle classi che la usano */
  renameRoom(from: string, to: string): Promise<void>
  /** Rifiuta se la sala è usata da una classe */
  deleteRoom(name: string): Promise<void>

  // Associazione
  updateAssociation(patch: Partial<AssociationInfo>): Promise<void>

  // Piani (listino): li scrive l'amministrazione, li sceglie l'atleta. Nessun pagamento gestito nell'app.
  savePlan(plan: FeePlan): Promise<void>
  /** La segreteria restituisce a mano una lezione scalata (es. assenza senza disdetta) */
  refundEntry(memberPlanId: string, note: string): Promise<void>

  // Sostituzioni: l'insegnante della classe (o l'amministrazione) indica chi la sostituisce
  setSubstitute(lessonId: string, teacherId: string | null, note: string): Promise<void>

  /** Ripristina i dati dimostrativi iniziali */
  reset(): Promise<void>
}

export interface DocumentUpload {
  memberId: string
  typeId: string
  /** chi carica: id dell'atleta o 'admin' */
  uploadedBy: string
  fileName: string
  fileType: string
  fileSize: number
  fileData: string
  /** il file caricato è già firmato a mano */
  signedUpload: boolean
  /** scadenza (es. certificato medico); se assente si usa la validità della tipologia */
  expiresOn?: string
  /** titolo libero: obbligatorio per i documenti senza tipologia (typeId vuoto) e per le tipologie che ne chiedono più d'uno */
  title?: string
}

export type DocumentDecision = 'approva' | 'rifiuta' | 'richiedi_sostituzione'
