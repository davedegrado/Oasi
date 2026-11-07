import { useState } from 'react'
import { Check, NotebookPen } from 'lucide-react'
import type { LearningStatus } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { STATUS_STYLE } from '@/lib/statusStyle'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

/** Stato personale e note dell'allieva su una figura (persistiti in locale) */
export function ProgressPanel({ studentId, figureId }: { studentId: string; figureId: string }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const progress = db.progress[studentId]?.[figureId]
  const status: LearningStatus = progress?.status ?? 'da_imparare'
  const [note, setNote] = useState(progress?.note ?? '')

  const dirty = note !== (progress?.note ?? '')

  const changeStatus = async (s: LearningStatus) => {
    if (s === status) return
    await repo.updateProgress(studentId, figureId, { status: s })
    toast(s === 'riuscita' ? 'Complimenti! Figura riuscita 🎉' : `Stato aggiornato: ${STATUS_LABEL[s]}`)
  }

  const saveNote = async () => {
    await repo.updateProgress(studentId, figureId, { note: note.trim() })
    toast('Nota salvata')
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-5">
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-ink">Il mio percorso</h2>
            {progress?.updatedAt && <span className="text-xs text-ink-muted">Aggiornato il {formatDate(progress.updatedAt)}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ORDER.map((s) => {
              const active = s === status
              const style = STATUS_STYLE[s]
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeStatus(s)}
                  className={cn(
                    'relative flex flex-col items-start rounded-2xl border p-3 text-left transition active:scale-[0.98]',
                    active ? cn('border-transparent', style.bg) : 'border-line bg-white hover:border-rosa/60',
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span className={cn('flex items-center gap-1.5 text-sm font-bold', active ? style.text : 'text-ink')}>
                      <span className={cn('size-2 rounded-full', style.dot)} />
                      {STATUS_LABEL[s]}
                    </span>
                    {active && <Check className={cn('size-4', style.text)} />}
                  </span>
                  <span className="mt-0.5 text-xs text-ink-muted">{STATUS_HINT[s]}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label htmlFor="figure-note" className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
            <NotebookPen className="size-4 text-rosa-intenso" /> Note personali
          </label>
          <Textarea
            id="figure-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Correzioni dell’insegnante, sensazioni, lato su cui lavorare…"
            rows={3}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">Visibili a te e alla tua insegnante</p>
            <Button size="sm" variant={dirty ? 'primary' : 'soft'} disabled={!dirty} onClick={saveNote}>
              Salva nota
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
