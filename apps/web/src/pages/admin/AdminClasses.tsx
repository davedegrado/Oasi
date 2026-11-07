import { useState } from 'react'
import { Clock, MapPin, Pencil, Plus, Trash2, Users } from 'lucide-react'
import type { ClassGroup, Discipline, Level } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { ProgressBar } from '@/components/ui/progress'
import { Avatar, AvatarStack } from '@/components/ui/avatar'
import { DisciplineBadge, LevelBadge } from '@/components/common/badges'
import { RequestsPanel } from '@/components/requests/RequestsPanel'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { classOccupancy, findStudent, findTeacher } from '@/services/selectors'
import { weekdayName } from '@/lib/dates'
import { LEVEL_LABEL, LEVELS } from '@/lib/labels'
import { cn, fullName, uid } from '@/lib/utils'

function emptyClass(teacherId: string, room: string): ClassGroup {
  return {
    id: uid('cls'),
    name: '',
    discipline: 'cerchio',
    level: 'base',
    teacherId,
    weekday: 1,
    startTime: '18:00',
    endTime: '19:30',
    room,
    capacity: 8,
    studentIds: [],
    description: '',
  }
}

export function AdminClasses() {
  const db = useDatabase()
  const [editing, setEditing] = useState<{ cls: ClassGroup; isNew: boolean } | null>(null)
  const [viewing, setViewing] = useState<ClassGroup | null>(null)
  const [filter, setFilter] = useState<'tutte' | Discipline>('tutte')
  const classes = db.classes.filter((c) => filter === 'tutte' || c.discipline === filter).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
  const totalSeats = db.classes.reduce((s, c) => s + c.capacity, 0)
  const enrolled = db.classes.reduce((s, c) => s + c.studentIds.length, 0)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Classi"
        title="Corsi e disponibilità"
        description={`${db.classes.length} classi · ${enrolled}/${totalSeats} posti occupati`}
        actions={
          <Button onClick={() => setEditing({ cls: emptyClass(db.teachers[0].id, db.association.rooms[0]), isNew: true })}>
            <Plus /> Nuova classe
          </Button>
        }
      />
      <div className="mb-6">
        <RequestsPanel teacherId={null} decidedBy="admin" title="Richieste di iscrizione e recupero" hideWhenEmpty />
      </div>
      <Segmented
        className="mb-5"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'tutte', label: 'Tutte' },
          { value: 'cerchio', label: 'Cerchio' },
          { value: 'tessuti', label: 'Tessuti' },
        ]}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {classes.map((c) => {
          const teacher = findTeacher(db, c.teacherId)
          const occ = classOccupancy(c)
          const students = c.studentIds.map((id) => findStudent(db, id)).filter((s) => !!s)
          return (
            <Card key={c.id} className="flex flex-col overflow-hidden">
              <div className={cn('h-1.5', c.discipline === 'cerchio' ? 'bg-cerchio' : 'bg-tessuti')} />
              <CardContent className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <DisciplineBadge discipline={c.discipline} />
                    <LevelBadge level={c.level} />
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Modifica ${c.name}`} onClick={() => setEditing({ cls: structuredClone(c), isNew: false })}>
                    <Pencil />
                  </Button>
                </div>
                <h2 className="mt-2 font-display text-xl font-bold">{c.name}</h2>
                <div className="mt-1.5 space-y-1 text-sm text-ink-muted">
                  <p className="flex items-center gap-1.5 first-letter:uppercase">
                    <Clock className="size-3.5" /> {weekdayName(c.weekday)} · {c.startTime}–{c.endTime}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" /> {c.room}
                  </p>
                </div>
                {teacher && (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <Avatar person={teacher} size="xs" /> <span className="font-semibold">{fullName(teacher)}</span>
                  </div>
                )}
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-ink-soft">
                      <b className="text-ink">{occ.enrolled}</b>/{c.capacity} iscritte
                    </span>
                    <span className={cn('text-xs font-semibold', occ.free === 0 ? 'text-danger' : occ.free <= 2 ? 'text-warn' : 'text-ok')}>{occ.free === 0 ? 'Completa' : `${occ.free} posti liberi`}</span>
                  </div>
                  <ProgressBar value={occ.pct} />
                  <div className="mt-4 flex items-center justify-between">
                    <AvatarStack people={students} max={5} />
                    <Button size="sm" variant="soft" onClick={() => setViewing(c)}>
                      <Users /> Iscritte
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {editing && <ClassDialog key={editing.cls.id} initial={editing.cls} isNew={editing.isNew} onClose={() => setEditing(null)} />}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.name ?? ''} description={viewing ? `${viewing.studentIds.length} iscritte su ${viewing.capacity} posti` : ''}>
        {viewing && (
          <>
            {viewing.description && <p className="mb-4 text-sm text-ink-soft">{viewing.description}</p>}
            <ul className="divide-y divide-line/70">
              {viewing.studentIds
                .map((id) => findStudent(db, id))
                .filter((s) => !!s)
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <Avatar person={s} size="sm" />
                    <span className="flex-1 text-sm font-semibold">{fullName(s)}</span>
                    <LevelBadge level={s.level} />
                  </li>
                ))}
            </ul>
            {viewing.studentIds.length === 0 && <p className="text-sm text-ink-muted">Nessuna iscritta.</p>}
          </>
        )}
      </Dialog>
    </div>
  )
}

function ClassDialog({ initial, isNew, onClose }: { initial: ClassGroup; isNew: boolean; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [cls, setCls] = useState(initial)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof ClassGroup>(k: K, v: ClassGroup[K]) => setCls((c) => ({ ...c, [k]: v }))

  const save = async () => {
    if (!cls.name.trim()) return setError('Inserisci il nome della classe')
    if (cls.endTime <= cls.startTime) return setError('L’orario di fine deve essere successivo all’inizio')
    if (cls.studentIds.length > cls.capacity) return setError('Le iscritte superano la capienza')
    await repo.saveClass({ ...cls, name: cls.name.trim() })
    toast(isNew ? 'Classe creata e aggiunta al calendario' : 'Classe aggiornata')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Nuova classe' : `Modifica ${initial.name}`}
      description="Classe dimostrativa: le lezioni vengono generate automaticamente nel calendario."
      className="sm:max-w-xl"
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto self-center text-sm font-semibold text-danger">Eliminare classe e lezioni?</span>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.deleteClass(cls.id)
                toast('Classe eliminata')
                onClose()
              }}
            >
              Elimina
            </Button>
          </>
        ) : (
          <>
            {!isNew && (
              <Button variant="ghost" className="mr-auto text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Elimina
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button onClick={save}>{isNew ? 'Crea classe' : 'Salva'}</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <Field label="Nome" htmlFor="c-name">
          <Input id="c-name" value={cls.name} onChange={(e) => set('name', e.target.value)} placeholder="Es. Cerchio Open" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Disciplina" htmlFor="c-disc">
            <Select id="c-disc" value={cls.discipline} onChange={(e) => set('discipline', e.target.value as Discipline)}>
              <option value="cerchio">Cerchio aereo</option>
              <option value="tessuti">Tessuti aerei</option>
            </Select>
          </Field>
          <Field label="Livello" htmlFor="c-level">
            <Select id="c-level" value={cls.level} onChange={(e) => set('level', e.target.value as Level)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Insegnante" htmlFor="c-teacher">
            <Select id="c-teacher" value={cls.teacherId} onChange={(e) => set('teacherId', e.target.value)}>
              {db.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Giorno" htmlFor="c-day">
            <Select id="c-day" value={cls.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={d}>
                  {weekdayName(d).charAt(0).toUpperCase() + weekdayName(d).slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inizio" htmlFor="c-start">
            <Input id="c-start" type="time" value={cls.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Fine" htmlFor="c-end">
            <Input id="c-end" type="time" value={cls.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </Field>
          <Field label="Sala" htmlFor="c-room">
            <Select id="c-room" value={cls.room} onChange={(e) => set('room', e.target.value)}>
              {db.association.rooms.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Posti" htmlFor="c-cap">
            <Input id="c-cap" type="number" min={1} max={20} value={cls.capacity} onChange={(e) => set('capacity', Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
        <Field label="Descrizione" htmlFor="c-desc">
          <Textarea id="c-desc" rows={2} value={cls.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-soft">
            Iscritte ({cls.studentIds.length}/{cls.capacity})
          </p>
          <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-2xl border border-line p-2 sm:grid-cols-2">
            {db.students.map((s) => {
              const checked = cls.studentIds.includes(s.id)
              const disabled = !checked && cls.studentIds.length >= cls.capacity
              return (
                <label key={s.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-xl p-2 text-sm transition hover:bg-cipria-50', checked && 'bg-cipria-50', disabled && 'cursor-not-allowed opacity-40')}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[#D66A9B]"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => set('studentIds', e.target.checked ? [...cls.studentIds, s.id] : cls.studentIds.filter((id) => id !== s.id))}
                  />
                  <span className="truncate">{fullName(s)}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-muted">{LEVEL_LABEL[s.level]}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
