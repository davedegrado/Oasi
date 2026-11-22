import { Link } from 'react-router-dom'
import { CalendarCheck, CalendarPlus, Lock, Undo2, X } from 'lucide-react'
import type { Lesson } from '@/types'
import { Button } from '@/components/ui/button'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { isLessonPast, lessonAccess, singleLessonWindow } from '@/services/selectors'
import { formatDate } from '@/lib/dates'

/**
 * Partecipazione dell'atleta a una lezione della propria classe, secondo il piano:
 * - partecipazione automatica: è attesa di default e può solo disdire (e annullare la disdetta);
 * - senza partecipazione automatica: deve premere "ci sarò" (dentro la finestra della palestra);
 * - piano scaduto o lezioni finite: la lezione non è disponibile.
 * È distinto dalla presenza effettiva segnata nel registro.
 */
export function DeclarationToggle({ lesson, studentId }: { lesson: Lesson; studentId: string }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const declared = lesson.declarations?.[studentId]
  const actual = lesson.attendance[studentId]
  const set = async (mark: 'presente' | 'assente' | null, message: string, tone?: 'info') => {
    try {
      await repo.setDeclaration(lesson.id, studentId, mark)
      toast(message, tone)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'info')
    }
  }

  if (lesson.status === 'annullata') return null
  if (isLessonPast(lesson)) {
    return (
      <p className="text-xs text-ink-muted">
        {actual === 'presente' ? 'Presenza registrata ✓' : actual === 'assente' ? 'Assenza registrata' : 'Registro non ancora compilato'}
      </p>
    )
  }

  const access = lessonAccess(db, studentId, lesson)
  if (access.status !== 'ok' && declared !== 'presente') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
          <Lock className="size-4" /> {access.status === 'esaurito' ? 'Lezioni del piano finite' : 'Piano scaduto: lezione non disponibile'}
        </span>
        <Link to="/allieva/classi" className="text-sm font-semibold text-rosa-scuro">
          Scegli un piano →
        </Link>
      </div>
    )
  }

  // Piano senza partecipazione automatica: "ci sarò" lezione per lezione
  if (access.needsConfirm) {
    const w = singleLessonWindow(db, lesson)
    return (
      <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        {declared === 'presente' ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
              <CalendarCheck className="size-4" /> Ci sarai
            </span>
            <Button size="sm" variant="outline" onClick={() => set(null, 'Non sei più in elenco per questa lezione', 'info')}>
              <X /> Non ci sarò
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm text-ink-muted">
              {w.tooEarly && w.openAt
                ? `Puoi aggiungerti dal ${formatDate(w.openAt.toISOString().slice(0, 10))} alle ${w.openAt.toTimeString().slice(0, 5)}`
                : w.tooLate
                  ? 'Non è più possibile aggiungersi'
                  : 'Dimmi se vieni'}
            </span>
            <Button size="sm" disabled={!w.open} onClick={() => set('presente', 'Ci sarai: l’insegnante ti aspetta')}>
              <CalendarPlus /> Ci sarò
            </Button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
      {declared === 'assente' ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
            <X className="size-4" /> Hai disdetto questa lezione
          </span>
          <Button size="sm" variant="outline" onClick={() => set(null, 'Disdetta annullata: ti aspettiamo a lezione')}>
            <Undo2 /> Annulla disdetta
          </Button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
            <CalendarCheck className="size-4" /> Ci sarai
          </span>
          <Button size="sm" variant="outline" onClick={() => set('assente', 'Lezione disdetta: l’insegnante è stata avvisata', 'info')}>
            <X /> Disdici
          </Button>
        </>
      )}
    </div>
  )
}
