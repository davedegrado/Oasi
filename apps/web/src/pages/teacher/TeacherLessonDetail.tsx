import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Check, CheckCheck, Clock, MapPin, RotateCcw, Users, X } from 'lucide-react'
import type { AttendanceMark, LessonStatus } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/common/EmptyState'
import { DisciplineBadge, LevelBadge, MembershipBadge } from '@/components/common/badges'
import { LessonStatusBadge } from '@/components/lessons/LessonCard'
import { HoopArc } from '@/components/common/Decor'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findClass, findStudent, findTeacher, isLessonPast } from '@/services/selectors'
import { formatDate, relativeDayLabel } from '@/lib/dates'
import { cn, fullName } from '@/lib/utils'

export function TeacherLessonDetail({ basePath = '/insegnante/lezioni', studentBase = '/insegnante/allieve' }: { basePath?: string; studentBase?: string }) {
  const { id } = useParams()
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const lesson = db.lessons.find((l) => l.id === id)
  const cls = findClass(db, lesson?.classId)
  const teacher = findTeacher(db, cls?.teacherId)
  const [statusDialog, setStatusDialog] = useState<LessonStatus | null>(null)
  const [form, setForm] = useState({ startTime: '', endTime: '', note: '' })

  if (!lesson || !cls) return <EmptyState title="Lezione non trovata" action={<Link to={basePath}>Torna alle lezioni</Link>} />

  const students = cls.studentIds.map((sid) => findStudent(db, sid)).filter((s) => !!s)
  const marks = students.map((s) => lesson.attendance[s.id])
  const present = marks.filter((m) => m === 'presente').length
  const absent = marks.filter((m) => m === 'assente').length
  const cancelled = lesson.status === 'annullata'
  const past = isLessonPast(lesson)

  const mark = async (studentId: string, value: AttendanceMark) => {
    const current = lesson.attendance[studentId]
    await repo.setAttendance(lesson.id, studentId, current === value ? null : value)
  }

  const openStatus = (s: LessonStatus) => {
    setForm({ startTime: lesson.startTime, endTime: lesson.endTime, note: lesson.note ?? '' })
    setStatusDialog(s)
  }

  const applyStatus = async () => {
    if (!statusDialog) return
    if (statusDialog === 'variata') await repo.updateLesson(lesson.id, { status: 'variata', startTime: form.startTime, endTime: form.endTime, note: form.note })
    else await repo.updateLesson(lesson.id, { status: statusDialog, note: form.note })
    toast(statusDialog === 'annullata' ? 'Lezione annullata: le allieve vedranno l’avviso' : 'Orario aggiornato nel calendario')
    setStatusDialog(null)
  }

  return (
    <div className="animate-fade-up space-y-5">
      <Link to={basePath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-rosa-intenso">
        <ArrowLeft className="size-4" /> Lezioni
      </Link>

      <div className="relative overflow-hidden rounded-4xl bg-white p-5 shadow-soft sm:p-7">
        <HoopArc className="absolute -top-14 -right-14 size-52 text-rosa/30" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <DisciplineBadge discipline={cls.discipline} />
            <LevelBadge level={cls.level} />
            <LessonStatusBadge lesson={lesson} />
          </div>
          <h1 className="mt-3 text-3xl font-extrabold">{cls.name}</h1>
          <p className="mt-1 font-semibold text-rosa-intenso capitalize">
            {relativeDayLabel(lesson.date) !== formatDate(lesson.date) ? `${relativeDayLabel(lesson.date)} · ` : ''}
            {formatDate(lesson.date, { weekday: true, year: true })}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink-soft">
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-rosa" />
              <span className={cn(cancelled && 'line-through')}>
                {lesson.startTime} – {lesson.endTime}
              </span>
              {lesson.originalStartTime && <span className="text-xs text-ink-muted">(era {lesson.originalStartTime})</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-rosa" /> {cls.room}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4 text-rosa" /> {students.length}/{cls.capacity} iscritte
            </span>
            {teacher && <span>Insegnante: {fullName(teacher)}</span>}
          </div>
          {lesson.note && <p className={cn('mt-3 rounded-2xl p-3 text-sm', cancelled ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}>{lesson.note}</p>}
          {!past && (
            <div className="mt-5 flex flex-wrap gap-2">
              {lesson.status !== 'regolare' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await repo.updateLesson(lesson.id, { status: 'regolare' })
                    toast('Lezione ripristinata all’orario regolare')
                  }}
                >
                  <RotateCcw /> Ripristina orario regolare
                </Button>
              )}
              {lesson.status !== 'annullata' && (
                <>
                  <Button size="sm" variant="soft" onClick={() => openStatus('variata')}>
                    <Clock /> Varia orario
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => openStatus('annullata')}>
                    <Ban /> Annulla lezione
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {!cancelled && (
        <Card>
          <CardContent>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Registro presenze</h2>
                <p className="text-sm text-ink-muted">
                  <span className="font-semibold text-ok">{present} presenti</span> · <span className="font-semibold text-danger">{absent} assenti</span> · {students.length - present - absent} da segnare
                </p>
              </div>
              <Button
                size="sm"
                variant="soft"
                onClick={async () => {
                  await repo.setAllAttendance(lesson.id, 'presente')
                  toast('Tutte segnate presenti')
                }}
              >
                <CheckCheck /> Tutte presenti
              </Button>
            </div>
            {!past && <p className="mb-3 rounded-2xl bg-cipria-50 p-3 text-xs text-ink-soft">Lezione non ancora svolta: puoi comunque pre-compilare il registro (es. assenze già comunicate).</p>}
            <ul className="divide-y divide-line/70">
              {students.map((s) => {
                const m = lesson.attendance[s.id]
                return (
                  <li key={s.id} className="flex items-center gap-3 py-3">
                    <Link to={`${studentBase}/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar person={s} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{fullName(s)}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <LevelBadge level={s.level} />
                          {s.membership.status !== 'attiva' && <MembershipBadge status={s.membership.status} />}
                        </div>
                      </div>
                    </Link>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => mark(s.id, 'presente')}
                        aria-pressed={m === 'presente'}
                        aria-label={`Segna ${s.firstName} presente`}
                        className={cn('grid size-11 place-items-center rounded-full border transition active:scale-95', m === 'presente' ? 'border-ok bg-ok text-white' : 'border-line bg-white text-ink-muted hover:border-ok hover:text-ok')}
                      >
                        <Check className="size-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => mark(s.id, 'assente')}
                        aria-pressed={m === 'assente'}
                        aria-label={`Segna ${s.firstName} assente`}
                        className={cn('grid size-11 place-items-center rounded-full border transition active:scale-95', m === 'assente' ? 'border-danger bg-danger text-white' : 'border-line bg-white text-ink-muted hover:border-danger hover:text-danger')}
                      >
                        <X className="size-5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-xs text-ink-muted">Le presenze vengono salvate subito e compaiono nello storico di ciascuna allieva.</p>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={!!statusDialog}
        onOpenChange={(o) => !o && setStatusDialog(null)}
        title={statusDialog === 'annullata' ? 'Annulla lezione' : 'Varia orario'}
        description="Le allieve vedranno la comunicazione nella loro Home e nel calendario."
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusDialog(null)}>
              Indietro
            </Button>
            <Button variant={statusDialog === 'annullata' ? 'danger' : 'primary'} onClick={applyStatus}>
              Conferma
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {statusDialog === 'variata' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inizio" htmlFor="new-start">
                <Input id="new-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </Field>
              <Field label="Fine" htmlFor="new-end">
                <Input id="new-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </Field>
            </div>
          )}
          <Field label="Messaggio per le allieve" htmlFor="status-note">
            <Textarea id="status-note" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={statusDialog === 'annullata' ? 'Es. la lezione verrà recuperata sabato…' : 'Es. sala occupata fino alle 20…'} />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
