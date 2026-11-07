import { Check, X } from 'lucide-react'
import type { AttendanceMark, Lesson } from '@/types'
import { useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { isLessonPast } from '@/services/selectors'
import { cn } from '@/lib/utils'

/**
 * L'allieva annuncia in anticipo se sarà presente: l'insegnante vede
 * subito chi ci sarà. È distinto dalla presenza effettiva del registro.
 */
export function DeclarationToggle({ lesson, studentId }: { lesson: Lesson; studentId: string }) {
  const repo = useRepository()
  const { toast } = useToast()
  const current = lesson.declarations?.[studentId] ?? null
  const actual = lesson.attendance[studentId]

  if (lesson.status === 'annullata') return null
  if (isLessonPast(lesson)) {
    return (
      <p className="text-xs text-ink-muted">
        {actual === 'presente' ? 'Presenza registrata ✓' : actual === 'assente' ? 'Assenza registrata' : 'Registro non ancora compilato'}
      </p>
    )
  }

  const set = async (mark: AttendanceMark) => {
    const next = current === mark ? null : mark
    await repo.setDeclaration(lesson.id, studentId, next)
    toast(next === 'presente' ? 'Perfetto, l’insegnante sa che ci sarai' : next === 'assente' ? 'Assenza comunicata all’insegnante' : 'Risposta annullata', 'info')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-xs font-semibold text-ink-soft">{current ? 'La tua risposta' : 'Ci sarai?'}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => set('presente')}
          aria-pressed={current === 'presente'}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition active:scale-95',
            current === 'presente' ? 'border-ok bg-ok text-white' : 'border-line bg-white text-ink-soft hover:border-ok hover:text-ok',
          )}
        >
          <Check className="size-4" /> Ci sarò
        </button>
        <button
          type="button"
          onClick={() => set('assente')}
          aria-pressed={current === 'assente'}
          className={cn(
            'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition active:scale-95',
            current === 'assente' ? 'border-danger bg-danger text-white' : 'border-line bg-white text-ink-soft hover:border-danger hover:text-danger',
          )}
        >
          <X className="size-4" /> Non ci sarò
        </button>
      </div>
    </div>
  )
}
