import { CalendarCheck, Undo2, X } from 'lucide-react'
import type { Lesson } from '@/types'
import { Button } from '@/components/ui/button'
import { useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { isLessonPast } from '@/services/selectors'

/**
 * Di default l'allieva è attesa a lezione: può solo disdire (e annullare la
 * disdetta). L'insegnante vede subito chi non verrà. È distinto dalla presenza
 * effettiva segnata nel registro.
 */
export function DeclarationToggle({ lesson, studentId }: { lesson: Lesson; studentId: string }) {
  const repo = useRepository()
  const { toast } = useToast()
  const cancelled = lesson.declarations?.[studentId] === 'assente'
  const actual = lesson.attendance[studentId]

  if (lesson.status === 'annullata') return null
  if (isLessonPast(lesson)) {
    return (
      <p className="text-xs text-ink-muted">
        {actual === 'presente' ? 'Presenza registrata ✓' : actual === 'assente' ? 'Assenza registrata' : 'Registro non ancora compilato'}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
      {cancelled ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
            <X className="size-4" /> Hai disdetto questa lezione
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await repo.setDeclaration(lesson.id, studentId, null)
              toast('Disdetta annullata: ti aspettiamo a lezione')
            }}
          >
            <Undo2 /> Annulla disdetta
          </Button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
            <CalendarCheck className="size-4" /> Ci sarai
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await repo.setDeclaration(lesson.id, studentId, 'assente')
              toast('Lezione disdetta: l’insegnante è stata avvisata', 'info')
            }}
          >
            <X /> Disdici
          </Button>
        </>
      )}
    </div>
  )
}
