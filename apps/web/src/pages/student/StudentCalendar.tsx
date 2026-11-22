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
import { findClass, isLessonPast, isMakeupFor, lessonsForStudent, makeupCredits, makeupLevelAllowed, makeupWindow, singleLessonWindow, sortLessons } from '@/services/selectors'
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
  const credits = makeupCredits(db, student.id)
  const canRequestMakeup = (l: Lesson) => {
    const cls = findClass(db, l.classId)
    return !mineIds.has(l.id) && !isLessonPast(l) && l.status !== 'annullata' && !requested.has(l.id) && credits.available > 0 && !!cls && makeupLevelAllowed(db, student.id, cls) && makeupWindow(db, l).open
  }
  // Lezione singola: altre classi, prenotabile quando si apre la finestra della palestra
  const canBook = (l: Lesson) => !mineIds.has(l.id) && !isLessonPast(l) && l.status !== 'annullata' && singleLessonWindow(db, l).open
  const isBooked = (l: Lesson) => !!l.bookings?.includes(student.id)
  const cancelBooking = async (l: Lesson) => {
    try {
      const late = await repo.cancelSingleLesson(student.id, l.id)
      toast(late ? 'Disdetta oltre il termine: la lezione resta da pagare' : 'Prenotazione disdetta', 'info')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Disdetta non riuscita', 'info')
    }
  }

  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Calendario"
        title="Le tue lezioni"
        description="Sei attesa a tutte le tue lezioni: se non puoi venire, disdici e la tua insegnante lo saprà subito."
        className="mb-0"
        actions={
          <Link to="/allieva/classi" className={buttonVariants({ variant: 'soft', size: 'sm' })}>
            <GraduationCap /> Iscriviti a un corso
          </Link>
        }
      />
      {/* Contatore dei recuperi: disponibili, utilizzati, in attesa */}
      <div className="grid grid-cols-3 gap-2 rounded-3xl bg-white p-3 shadow-soft">
        {[
          { label: 'Disponibili', value: credits.available, tone: 'text-rosa-intenso' },
          { label: 'Utilizzati', value: credits.used, tone: 'text-ink' },
          { label: 'In attesa', value: credits.pending, tone: 'text-ink-soft' },
        ].map((x) => (
          <div key={x.label} className="text-center">
            <p className={`font-display text-2xl font-extrabold ${x.tone}`}>{x.value}</p>
            <p className="text-xs text-ink-muted">Recuperi {x.label.toLowerCase()}</p>
          </div>
        ))}
        <p className="col-span-3 text-center text-xs text-ink-muted">Un recupero nasce da un’assenza a una tua lezione ({credits.earned} finora).</p>
      </div>
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
          {credits.available > 0
            ? `Hai ${credits.available} ${credits.available === 1 ? 'recupero disponibile' : 'recuperi disponibili'}: tocca una lezione “Recuperabile” del tuo livello. Va confermato dall’insegnante o dall’amministrazione.`
            : 'Non hai recuperi disponibili: un recupero nasce da un’assenza a una tua lezione.'}{' '}
          {`Le lezioni “Prenotabili” si prenotano come lezione singola a partire da ${db.association.settings.bookingOpensHours ?? 48} ore prima; disdetta libera fino a ${db.association.settings.absenceNoticeHours} ore prima.`}
        </p>
      )}
      <WeekCalendar
        lessons={lessons}
        onLessonClick={(l) => setMakeupFor(l)}
        canClick={scope === 'tutte' ? (l) => canRequestMakeup(l) || canBook(l) : () => false}
        renderFooter={(l) =>
          isBooked(l) && !isLessonPast(l) ? (
            <Button size="sm" variant="ghost" onClick={() => cancelBooking(l)}>
              <X /> Disdici la lezione singola
            </Button>
          ) : mineIds.has(l.id) ? (
            <DeclarationToggle lesson={l} studentId={student.id} />
          ) : undefined
        }
        renderBadges={(l) =>
          isBooked(l) ? (
            <Badge tone="rosa">Lezione singola</Badge>
          ) : isMakeupFor(db, l.id, student.id) ? (
            <Badge tone="rosa">
              <RefreshCcw /> Recupero
            </Badge>
          ) : scope === 'tutte' && requested.has(l.id) ? (
            <Badge tone="warn">Recupero richiesto</Badge>
          ) : scope === 'tutte' && canRequestMakeup(l) ? (
            <Badge tone="neutral">Recuperabile</Badge>
          ) : scope === 'tutte' && canBook(l) ? (
            <Badge tone="neutral">Prenotabile</Badge>
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
