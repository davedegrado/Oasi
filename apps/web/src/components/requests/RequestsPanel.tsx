import { Check, GraduationCap, RefreshCcw, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { SectionTitle } from '@/components/common/PageHeader'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findClass, findStudent, pendingRequests } from '@/services/selectors'
import { formatDate, relativeDayLabel } from '@/lib/dates'
import { fullName } from '@/lib/utils'

/**
 * Richieste da approvare: iscrizioni alle classi e recuperi.
 * teacherId = solo le classi dell'insegnante; null = tutte (amministrazione).
 */
export function RequestsPanel({ teacherId, decidedBy, title = 'Richieste da approvare', hideWhenEmpty }: { teacherId: string | null; decidedBy: string; title?: string; hideWhenEmpty?: boolean }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const { enrollments, makeups, total } = pendingRequests(db, teacherId)
  if (total === 0 && hideWhenEmpty) return null

  const decide = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn()
      toast(ok)
    } catch (e) {
      toast((e as Error).message, 'info')
    }
  }

  const actions = (onApprove: () => void, onReject: () => void) => (
    <div className="flex shrink-0 gap-1.5">
      <Button size="sm" variant="outline" onClick={onReject} aria-label="Rifiuta">
        <X /> <span className="hidden sm:inline">Rifiuta</span>
      </Button>
      <Button size="sm" onClick={onApprove} aria-label="Accetta">
        <Check /> Accetta
      </Button>
    </div>
  )

  return (
    <section>
      <SectionTitle title={`${title}${total ? ` (${total})` : ''}`} />
      <Card>
        <CardContent className="p-3 sm:p-4">
          {total === 0 && <p className="p-2 text-sm text-ink-muted">Nessuna richiesta in attesa ✨</p>}
          <ul className="divide-y divide-line/70">
            {enrollments.map((r) => {
              const s = findStudent(db, r.studentId)
              const c = findClass(db, r.classId)
              if (!s || !c) return null
              const full = c.studentIds.length >= c.capacity
              return (
                <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar person={s} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-rosa-intenso">
                        <GraduationCap className="size-3.5" /> Iscrizione · {relativeDayLabel(r.createdAt)}
                      </p>
                      <p className="text-sm">
                        <b>{fullName(s)}</b> chiede di entrare in <b>{c.name}</b>
                      </p>
                      <p className="text-xs text-ink-muted">
                        {c.studentIds.length}/{c.capacity} iscritte{full ? ' · classe completa' : ''}
                        {r.note ? ` · “${r.note}”` : ''}
                      </p>
                    </div>
                  </div>
                  {actions(
                    () => decide(() => repo.decideEnrollment(r.id, true, decidedBy), `${s.firstName} è iscritta a ${c.name}`),
                    () => decide(() => repo.decideEnrollment(r.id, false, decidedBy), 'Richiesta rifiutata'),
                  )}
                </li>
              )
            })}
            {makeups.map((r) => {
              const s = findStudent(db, r.studentId)
              const lesson = db.lessons.find((l) => l.id === r.targetLessonId)
              const c = findClass(db, lesson?.classId)
              const missed = db.lessons.find((l) => l.id === r.missedLessonId)
              if (!s || !lesson || !c) return null
              return (
                <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar person={s} size="sm" />
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-rosa-intenso">
                        <RefreshCcw className="size-3.5" /> Recupero · {relativeDayLabel(r.createdAt)}
                      </p>
                      <p className="text-sm">
                        <b>{fullName(s)}</b> vuole recuperare con <b>{c.name}</b>, {formatDate(lesson.date, { weekday: true })} alle {lesson.startTime}
                      </p>
                      {lesson.status === 'annullata' && <p className="text-xs font-semibold text-danger">Attenzione: questa lezione è stata annullata</p>}
                      <p className="text-xs text-ink-muted">
                        {missed ? `Recupera: ${findClass(db, missed.classId)?.name} del ${formatDate(missed.date)}` : `Classi abituali: ${s.classIds.map((id) => findClass(db, id)?.name).join(', ') || '—'}`}
                        {r.note ? ` · “${r.note}”` : ''}
                      </p>
                    </div>
                  </div>
                  {actions(
                    () => decide(() => repo.decideMakeup(r.id, true, decidedBy), 'Recupero confermato: compare nel calendario dell’allieva'),
                    () => decide(() => repo.decideMakeup(r.id, false, decidedBy), 'Recupero rifiutato'),
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}
