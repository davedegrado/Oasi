import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GraduationCap, Info, RefreshCcw, X } from 'lucide-react'
import type { Lesson } from '@/types'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { Segmented } from '@/components/ui/segmented'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent } from '@/components/ui/card'
import { WeekCalendar } from '@/components/calendar/WeekCalendar'
import { DeclarationToggle } from '@/components/lessons/DeclarationToggle'
import { MakeupDialog } from '@/components/lessons/MakeupDialog'
import { RequestStatusBadge } from '@/components/requests/RequestStatusBadge'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { useToast } from '@/hooks/useToast'
import { findClass, isLessonPast, isMakeupFor, lessonsForStudent, sortLessons } from '@/services/selectors'
import { formatDate } from '@/lib/dates'

export function StudentCalendar() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const student = useCurrentStudent()
  const [scope, setScope] = useState<'mie' | 'tutte'>('mie')
  const [makeupFor, setMakeupFor] = useState<Lesson | null>(null)
  const mine = lessonsForStudent(db, student.id)
  const mineIds = new Set(mine.map((l) => l.id))
  const lessons = scope === 'mie' ? mine : sortLessons(db.lessons)
  const requested = new Set(db.makeupRequests.filter((r) => r.studentId === student.id && r.status !== 'rifiutata').map((r) => r.targetLessonId))
  const myRequests = db.makeupRequests.filter((r) => r.studentId === student.id).slice(0, 6)

  // Si può chiedere un recupero su lezioni future di altre classi, non annullate e non già richieste
  const canRequestMakeup = (l: Lesson) => !mineIds.has(l.id) && !isLessonPast(l) && l.status !== 'annullata' && !requested.has(l.id)

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Calendario"
        title="Le tue lezioni"
        description="Mese, settimana o giorno. Sei attesa a tutte le tue lezioni: se non puoi venire, disdici e la tua insegnante lo saprà subito."
        className="mb-0"
        actions={
          <Link to="/allieva/classi" className={buttonVariants({ variant: 'soft', size: 'sm' })}>
            <GraduationCap /> Iscriviti a un corso
          </Link>
        }
      />
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'mie', label: 'Le mie lezioni' },
          { value: 'tutte', label: 'Tutta la palestra' },
        ]}
      />
      {scope === 'tutte' && (
        <p className="flex items-start gap-2 rounded-3xl bg-cipria-50 p-4 text-sm text-ink-soft">
          <Info className="mt-0.5 size-4 shrink-0 text-rosa-intenso" />
          Tocca una lezione di un’altra classe per chiedere un recupero. Va confermato dall’insegnante o dall’amministrazione.
        </p>
      )}
      <WeekCalendar
        lessons={lessons}
        initialView="mese"
        onLessonClick={(l) => setMakeupFor(l)}
        canClick={scope === 'tutte' ? canRequestMakeup : () => false}
        renderFooter={(l) => (mineIds.has(l.id) ? <DeclarationToggle lesson={l} studentId={student.id} /> : undefined)}
        renderBadges={(l) =>
          isMakeupFor(db, l.id, student.id) ? (
            <Badge tone="rosa">
              <RefreshCcw /> Recupero
            </Badge>
          ) : scope === 'tutte' && requested.has(l.id) ? (
            <Badge tone="warn">Recupero richiesto</Badge>
          ) : scope === 'tutte' && canRequestMakeup(l) ? (
            <Badge tone="neutral">Recuperabile</Badge>
          ) : null
        }
      />

      {myRequests.length > 0 && (
        <section>
          <SectionTitle title="Le mie richieste di recupero" />
          <Card>
            <CardContent className="p-3 sm:p-4">
              <ul className="divide-y divide-line/70">
                {myRequests.map((r) => {
                  const l = db.lessons.find((x) => x.id === r.targetLessonId)
                  const cls = findClass(db, l?.classId)
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <RefreshCcw className="size-4 shrink-0 text-rosa-intenso" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{cls?.name}</p>
                        <p className="text-xs text-ink-muted first-letter:uppercase">{l ? `${formatDate(l.date, { weekday: true })} · ${l.startTime}` : ''}</p>
                      </div>
                      <RequestStatusBadge status={r.status} />
                      {r.status === 'in_attesa' && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Ritira la richiesta"
                          onClick={async () => {
                            await repo.cancelRequest('makeup', r.id)
                            toast('Richiesta ritirata', 'info')
                          }}
                        >
                          <X />
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {makeupFor && <MakeupDialog lesson={makeupFor} studentId={student.id} onClose={() => setMakeupFor(null)} />}
    </div>
  )
}
