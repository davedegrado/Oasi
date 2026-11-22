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
import { classOccupancy, findTeacher, memberPlansForClass, planUsage, plansForClass } from '@/services/selectors'
import { PlanPicker } from '@/components/plans/PlanPicker'
import { formatDate, todayISO } from '@/lib/dates'
import { weekdayName } from '@/lib/dates'
import { useDisciplines } from '@/hooks/useDisciplines'
import { cn, fullName } from '@/lib/utils'

/** Catalogo dei corsi: l'atleta chiede l'iscrizione, l'insegnante della classe la approva */
export function StudentClasses() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const student = useCurrentStudent()
  const disciplines = useDisciplines()
  const [requesting, setRequesting] = useState<ClassGroup | null>(null)
  const [renewing, setRenewing] = useState<ClassGroup | null>(null)
  const [note, setNote] = useState('')
  const [planId, setPlanId] = useState('')
  const [error, setError] = useState('')
  const today = todayISO()
  /** Piano in corso per la classe (valido oggi o in arrivo) e se le lezioni sono finite */
  const planStatus = (classId: string) => {
    const mp = memberPlansForClass(db, student.id, classId).find((p) => p.validUntil >= today)
    const plan = db.plans.find((p) => p.id === mp?.planId)
    const remaining = mp ? planUsage(db, mp).remaining : undefined
    return { mp, plan, usable: !!mp && remaining !== 0, remaining }
  }
  const open = (c: ClassGroup, mode: 'iscrizione' | 'rinnovo') => {
    setNote('')
    setError('')
    setPlanId(plansForClass(db, c)[0]?.id ?? '')
    if (mode === 'iscrizione') setRequesting(c)
    else setRenewing(c)
  }

  const requestOf = (classId: string) =>
    db.enrollmentRequests.filter((r) => r.classId === classId && r.studentId === student.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

  return (
    <div className="animate-fade-up">
      <BackButton fallback="/allieva" />
      <PageHeader eyebrow="Corsi" title="Iscriviti a un corso" description="Scegli una classe e invia la richiesta: l’insegnante della classe la confermerà." />
      <div className="space-y-8">
        {disciplines.active.map((info) => {
          const d = info.id
          const classes = db.classes.filter((c) => c.discipline === d).sort((a, b) => a.weekday - b.weekday)
          if (classes.length === 0) return null
          return (
            <section key={d}>
              <h2 className="mb-3 text-lg font-bold">{info.name}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {classes.map((c) => {
                  const teacher = findTeacher(db, c.teacherId)
                  const occ = classOccupancy(c)
                  const enrolled = c.studentIds.includes(student.id)
                  const req = requestOf(c.id)
                  const pending = req?.status === 'in_attesa'
                  return (
                    <Card key={c.id} className={cn('overflow-hidden', enrolled && 'border-ok/40')}>
                      <div className="h-1.5" style={{ background: info.color }} />
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
                            (() => {
                              const st = planStatus(c.id)
                              return (
                                <>
                                  <span className="min-w-0 text-xs text-ink-muted">
                                    <Badge tone={st.usable ? 'ok' : 'danger'}>{st.usable ? 'Sei iscritto' : st.mp ? 'Lezioni finite' : 'Piano scaduto'}</Badge>
                                    {st.mp && st.plan && (
                                      <span className="mt-1 block truncate">
                                        {st.plan.name} · fino al {formatDate(st.mp.validUntil)}
                                        {st.remaining !== undefined ? ` · ${st.remaining} lezioni residue` : ''}
                                      </span>
                                    )}
                                  </span>
                                  <Button size="sm" variant={st.usable ? 'ghost' : 'primary'} onClick={() => open(c, 'rinnovo')}>
                                    {st.usable ? 'Cambia piano' : 'Scegli un piano'}
                                  </Button>
                                </>
                              )
                            })()
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
                              <Button size="sm" disabled={occ.free === 0} onClick={() => open(c, 'iscrizione')}>
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
        description="Scegli il piano e invia la richiesta: l’insegnante della classe potrà accettarla. Il piano parte dal giorno in cui l’iscrizione viene accettata; il pagamento si fa in segreteria."
        footer={
          <>
            <Button variant="outline" onClick={() => setRequesting(null)}>
              Annulla
            </Button>
            <Button
              disabled={!planId}
              onClick={async () => {
                if (!requesting) return
                try {
                  await repo.requestEnrollment(requesting.id, student.id, note.trim(), planId)
                  toast('Richiesta di iscrizione inviata')
                  setRequesting(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Richiesta non inviata')
                }
              }}
            >
              <Send /> Invia richiesta
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink-soft">Piano</p>
            <PlanPicker plans={plansForClass(db, requesting ?? undefined)} value={planId} onChange={setPlanId} />
          </div>
          <Field label="Messaggio per l’insegnante (facoltativo)" htmlFor="enroll-note">
            <Textarea id="enroll-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. da quanto pratico, obiettivi…" />
          </Field>
          {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        </div>
      </Dialog>

      <Dialog
        open={!!renewing}
        onOpenChange={(o) => !o && setRenewing(null)}
        title={`Piano per ${renewing?.name ?? ''}`}
        description="Il nuovo piano vale da oggi (o dal periodo indicato): la segreteria viene avvisata per il pagamento."
        footer={
          <>
            <Button variant="outline" onClick={() => setRenewing(null)}>
              Annulla
            </Button>
            <Button
              disabled={!planId}
              onClick={async () => {
                if (!renewing) return
                try {
                  await repo.choosePlan(student.id, renewing.id, planId)
                  toast('Piano scelto: le lezioni sono di nuovo disponibili')
                  setRenewing(null)
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Operazione non riuscita')
                }
              }}
            >
              Conferma il piano
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <PlanPicker plans={plansForClass(db, renewing ?? undefined)} value={planId} onChange={setPlanId} />
          {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        </div>
      </Dialog>
    </div>
  )
}
