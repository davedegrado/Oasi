import { useState } from 'react'
import { Clock, MapPin, Send, Users } from 'lucide-react'
import type { ClassGroup } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { BackButton } from '@/components/common/BackButton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Dialog } from '@/components/ui/dialog'
import { Field, Textarea } from '@/components/ui/input'
import { ProgressBar } from '@/components/ui/progress'
import { DisciplineBadge, LevelBadge } from '@/components/common/badges'
import { RequestStatusBadge } from '@/components/requests/RequestStatusBadge'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useCurrentStudent } from '@/hooks/useDemo'
import { useToast } from '@/hooks/useToast'
import { classOccupancy, findTeacher } from '@/services/selectors'
import { weekdayName } from '@/lib/dates'
import { DISCIPLINE_LABEL, DISCIPLINES } from '@/lib/labels'
import { cn, fullName } from '@/lib/utils'

/** Catalogo dei corsi: l'allieva chiede l'iscrizione, l'insegnante della classe la approva */
export function StudentClasses() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const student = useCurrentStudent()
  const [requesting, setRequesting] = useState<ClassGroup | null>(null)
  const [note, setNote] = useState('')

  const requestOf = (classId: string) =>
    db.enrollmentRequests.filter((r) => r.classId === classId && r.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <div className="animate-fade-up">
      <BackButton fallback="/allieva" />
      <PageHeader eyebrow="Corsi" title="Iscriviti a un corso" description="Scegli una classe e invia la richiesta: l’insegnante della classe la confermerà." />
      <div className="space-y-8">
        {DISCIPLINES.map((d) => {
          const classes = db.classes.filter((c) => c.discipline === d).sort((a, b) => a.weekday - b.weekday)
          if (classes.length === 0) return null
          return (
            <section key={d}>
              <h2 className="mb-3 text-lg font-bold">{DISCIPLINE_LABEL[d]}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {classes.map((c) => {
                  const teacher = findTeacher(db, c.teacherId)
                  const occ = classOccupancy(c)
                  const enrolled = c.studentIds.includes(student.id)
                  const req = requestOf(c.id)
                  const pending = req?.status === 'in_attesa'
                  return (
                    <Card key={c.id} className={cn('overflow-hidden', enrolled && 'border-ok/40')}>
                      <div className={cn('h-1.5', c.discipline === 'cerchio' ? 'bg-cerchio' : 'bg-tessuti')} />
                      <CardContent className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-display text-lg font-bold">{c.name}</p>
                            <p className="flex items-center gap-1.5 text-sm text-ink-muted first-letter:uppercase">
                              <Clock className="size-3.5" /> {weekdayName(c.weekday)} · {c.startTime}–{c.endTime}
                            </p>
                            <p className="flex items-center gap-1.5 text-sm text-ink-muted">
                              <MapPin className="size-3.5" /> {c.room}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <DisciplineBadge discipline={c.discipline} />
                            <LevelBadge level={c.level} />
                          </div>
                        </div>
                        <p className="text-sm text-ink-soft">{c.description}</p>
                        {teacher && (
                          <p className="flex items-center gap-2 text-sm">
                            <Avatar person={teacher} size="xs" /> {fullName(teacher)}
                          </p>
                        )}
                        <div>
                          <p className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                            <span className="flex items-center gap-1">
                              <Users className="size-3.5" /> {occ.enrolled}/{c.capacity} iscritte
                            </span>
                            <span>{occ.free > 0 ? `${occ.free} posti liberi` : 'Completa'}</span>
                          </p>
                          <ProgressBar value={occ.pct} className="h-1.5" />
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1">
                          {enrolled ? (
                            <Badge tone="ok">Sei iscritta</Badge>
                          ) : pending ? (
                            <>
                              <RequestStatusBadge status="in_attesa" />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await repo.cancelRequest('enrollment', req.id)
                                  toast('Richiesta ritirata', 'info')
                                }}
                              >
                                Ritira
                              </Button>
                            </>
                          ) : (
                            <>
                              {req?.status === 'rifiutata' ? <RequestStatusBadge status="rifiutata" /> : <span />}
                              <Button size="sm" disabled={occ.free === 0} onClick={() => { setNote(''); setRequesting(c) }}>
                                <Send /> {occ.free === 0 ? 'Classe completa' : 'Richiedi iscrizione'}
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <Dialog
        open={!!requesting}
        onOpenChange={(o) => !o && setRequesting(null)}
        title={`Iscrizione a ${requesting?.name ?? ''}`}
        description="La richiesta arriva all’insegnante della classe, che potrà accettarla."
        footer={
          <>
            <Button variant="outline" onClick={() => setRequesting(null)}>
              Annulla
            </Button>
            <Button
              onClick={async () => {
                if (!requesting) return
                await repo.requestEnrollment(requesting.id, student.id, note.trim())
                toast('Richiesta di iscrizione inviata')
                setRequesting(null)
              }}
            >
              <Send /> Invia richiesta
            </Button>
          </>
        }
      >
        <Field label="Messaggio per l’insegnante (facoltativo)" htmlFor="enroll-note">
          <Textarea id="enroll-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. da quanto pratico, obiettivi…" />
        </Field>
      </Dialog>
    </div>
  )
}
