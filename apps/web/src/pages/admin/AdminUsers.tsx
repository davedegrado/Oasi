import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, GraduationCap, Search, UserPlus } from 'lucide-react'
import type { MembershipStatus, Student, Teacher } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { Input, Select, Field } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/common/EmptyState'
import { NewPersonDialog } from '@/components/students/NewPersonDialog'
import { DisciplineBadge, LevelBadge, MembershipBadge } from '@/components/common/badges'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findClass } from '@/services/selectors'
import { MEMBERSHIP_LABEL } from '@/lib/labels'
import { addDays, todayISO } from '@/lib/dates'
import { cn, fullName, normalize } from '@/lib/utils'

type RoleFilter = 'tutti' | 'allieva' | 'insegnante'

interface Row {
  id: string
  kind: 'allieva' | 'insegnante'
  person: Student | Teacher
  name: string
  classes: string
  status: MembershipStatus | 'staff'
}

export function AdminUsers() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<RoleFilter>('tutti')
  const [status, setStatus] = useState<'tutti' | MembershipStatus>('tutti')
  const [classId, setClassId] = useState('tutte')
  const [editing, setEditing] = useState<Student | null>(null)
  const [teacherView, setTeacherView] = useState<Teacher | null>(null)
  const [creating, setCreating] = useState<'allieva' | 'insegnante' | null>(null)

  const rows: Row[] = useMemo(() => {
    const students: Row[] = db.students.map((s) => ({
      id: s.id,
      kind: 'allieva',
      person: s,
      name: fullName(s),
      classes: s.classIds.map((id) => findClass(db, id)?.name).filter(Boolean).join(', ') || '—',
      status: s.membership.status,
    }))
    const teachers: Row[] = db.teachers.map((t) => ({
      id: t.id,
      kind: 'insegnante',
      person: t,
      name: fullName(t),
      classes: db.classes.filter((c) => c.teacherId === t.id).map((c) => c.name).join(', ') || '—',
      status: 'staff',
    }))
    // Le persone appena aggiunte (ultimi 14 giorni o invito in attesa) in cima all'elenco
    const recent = addDays(todayISO(), -14)
    const isNew = (r: Row) => !!r.person.invitePending || (r.kind === 'allieva' && (r.person as Student).joinedAt >= recent)
    const all = [...teachers, ...students]
    return [...all.filter(isNew), ...all.filter((r) => !isNew(r))]
  }, [db])
  const recentDate = addDays(todayISO(), -14)
  const isNewRow = (r: Row) => !!r.person.invitePending || (r.kind === 'allieva' && (r.person as Student).joinedAt >= recentDate)

  const filtered = rows
    .filter((r) => role === 'tutti' || r.kind === role)
    .filter((r) => status === 'tutti' || r.status === status)
    .filter((r) => classId === 'tutte' || (r.kind === 'allieva' ? (r.person as Student).classIds.includes(classId) : db.classes.some((c) => c.id === classId && c.teacherId === r.id)))
    .filter((r) => !query || normalize(`${r.name} ${r.classes}`).includes(normalize(query)))

  const open = (r: Row) => (r.kind === 'allieva' ? navigate(`/admin/utenti/${r.id}`) : setTeacherView(r.person as Teacher))

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Utenti"
        title="Allieve e insegnanti"
        description={`${db.students.length} allieve · ${db.teachers.length} insegnanti`}
        actions={
          <>
            <Button size="sm" onClick={() => setCreating('allieva')}>
              <UserPlus /> Nuova allieva
            </Button>
            <Button size="sm" variant="soft" onClick={() => setCreating('insegnante')}>
              <GraduationCap /> Nuova insegnante
            </Button>
          </>
        }
      />
      {creating && <NewPersonDialog kind={creating} onClose={() => setCreating(null)} />}

      <div className="mb-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted" />
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca per nome o classe" className="pl-11" aria-label="Cerca utenti" />
          </div>
          <Segmented<RoleFilter>
            value={role}
            onChange={setRole}
            options={[
              { value: 'tutti', label: 'Tutti' },
              { value: 'allieva', label: 'Allieve' },
              { value: 'insegnante', label: 'Insegnanti' },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtra per stato iscrizione">
            <option value="tutti">Ogni stato</option>
            {(Object.keys(MEMBERSHIP_LABEL) as MembershipStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEMBERSHIP_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Filtra per classe">
            <option value="tutte">Tutte le classi</option>
            {db.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nessun utente trovato" description="Modifica la ricerca o i filtri." />
      ) : (
        <>
          {/* Tabella tablet/desktop */}
          <div className="hidden overflow-hidden rounded-3xl border border-line/70 bg-white shadow-soft md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-cipria-50 text-xs font-semibold tracking-wider text-ink-muted uppercase">
                <tr>
                  <th className="px-5 py-3.5">Nome</th>
                  <th className="px-3 py-3.5">Ruolo</th>
                  <th className="px-3 py-3.5">Classe</th>
                  <th className="px-3 py-3.5">Stato iscrizione</th>
                  <th className="px-5 py-3.5 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {filtered.map((r) => (
                  <tr key={r.id} className="transition hover:bg-cipria-50/60">
                    <td className="px-5 py-3">
                      <button type="button" onClick={() => open(r)} className="flex items-center gap-3 text-left">
                        <Avatar person={r.person} size="sm" />
                        <span>
                          <span className="block font-semibold text-ink">{r.name}</span>
                          <span className="block text-xs text-ink-muted">{r.person.email}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={r.kind === 'insegnante' ? 'tessuti' : 'rosa'}>{r.kind === 'insegnante' ? 'Insegnante' : 'Allieva'}</Badge>
                    </td>
                    <td className="max-w-56 px-3 py-3 text-ink-soft">
                      <span className="line-clamp-2">{r.classes}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {r.status === 'staff' ? <Badge tone="neutral">Staff</Badge> : <MembershipBadge status={r.status} />}
                        {r.person.invitePending && <Badge tone="warn">Invito inviato</Badge>}
                        {isNewRow(r) && !r.person.invitePending && <Badge tone="rosa">Nuova</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {r.kind === 'allieva' && (
                          <Button size="sm" variant="outline" onClick={() => setEditing(r.person as Student)}>
                            Iscrizione
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => open(r)}>
                          {r.kind === 'allieva' ? 'Percorso' : 'Dettagli'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Elenco smartphone */}
          <ul className="space-y-2.5 md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-3xl border border-line/70 bg-white p-3.5 shadow-soft">
                <button type="button" onClick={() => open(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar person={r.person} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{r.name}</span>
                    <span className="block truncate text-xs text-ink-muted">{r.classes}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={r.kind === 'insegnante' ? 'tessuti' : 'rosa'}>{r.kind === 'insegnante' ? 'Insegnante' : 'Allieva'}</Badge>
                      {r.status !== 'staff' && <MembershipBadge status={r.status} />}
                      {r.person.invitePending && <Badge tone="warn">Invito inviato</Badge>}
                      {isNewRow(r) && !r.person.invitePending && <Badge tone="rosa">Nuova</Badge>}
                    </span>
                  </span>
                </button>
                {r.kind === 'allieva' ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing(r.person as Student)}>
                    Iscrizione
                  </Button>
                ) : (
                  <ChevronRight className="size-5 text-ink-muted" />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {editing && (
        <MembershipDialog
          key={editing.id}
          student={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await repo.updateStudent(editing.id, patch)
            // Allinea le classi: la classe è la fonte delle iscrizioni
            for (const cls of db.classes) {
              const shouldBe = patch.classIds?.includes(cls.id) ?? false
              const is = cls.studentIds.includes(editing.id)
              if (shouldBe !== is) {
                await repo.saveClass({ ...cls, studentIds: shouldBe ? [...cls.studentIds, editing.id] : cls.studentIds.filter((id) => id !== editing.id) })
              }
            }
            toast('Iscrizione aggiornata')
            setEditing(null)
          }}
        />
      )}

      <Dialog open={!!teacherView} onOpenChange={(o) => !o && setTeacherView(null)} title={teacherView ? fullName(teacherView) : ''} description="Insegnante">
        {teacherView && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar person={teacherView} size="lg" />
              <div className="flex flex-wrap gap-1.5">
                {teacherView.disciplines.map((d) => (
                  <DisciplineBadge key={d} discipline={d} />
                ))}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{teacherView.bio}</p>
            <div className="rounded-2xl bg-cipria-50 p-4 text-sm">
              <p>{teacherView.email}</p>
              <p>{teacherView.phone}</p>
              <p className="mt-1 text-ink-muted">In Oasi dal {teacherView.since}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Classi</p>
              <div className="flex flex-wrap gap-2">
                {db.classes
                  .filter((c) => c.teacherId === teacherView.id)
                  .map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm shadow-soft">
                      {c.name} <LevelBadge level={c.level} />
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function MembershipDialog({ student, onClose, onSave }: { student: Student; onClose: () => void; onSave: (patch: Partial<Student>) => void }) {
  const db = useDatabase()
  const [status, setStatus] = useState<MembershipStatus>(student.membership.status)
  const [classIds, setClassIds] = useState<string[]>(student.classIds)
  const [cert, setCert] = useState(student.membership.medicalCertificateExpiresAt)

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Iscrizione di ${student.firstName}`}
      description="Simulazione: le modifiche restano su questo dispositivo."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => onSave({ classIds, membership: { ...student.membership, status, medicalCertificateExpiresAt: cert } })}>Salva</Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Stato iscrizione" htmlFor="m-status">
          <Select id="m-status" value={status} onChange={(e) => setStatus(e.target.value as MembershipStatus)}>
            {(Object.keys(MEMBERSHIP_LABEL) as MembershipStatus[]).map((s) => (
              <option key={s} value={s}>
                {MEMBERSHIP_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scadenza certificato medico" htmlFor="m-cert">
          <Input id="m-cert" type="date" value={cert} onChange={(e) => setCert(e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-soft">Classi</p>
          <div className="grid gap-2">
            {db.classes.map((c) => {
              const checked = classIds.includes(c.id)
              const full = !checked && c.studentIds.length >= c.capacity
              return (
                <label key={c.id} className={cn('flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition', checked ? 'border-rosa bg-cipria-50' : 'border-line', full && 'cursor-not-allowed opacity-50')}>
                  <input
                    type="checkbox"
                    className="size-4 accent-[#D66A9B]"
                    checked={checked}
                    disabled={full}
                    onChange={(e) => setClassIds(e.target.checked ? [...classIds, c.id] : classIds.filter((id) => id !== c.id))}
                  />
                  <span className="flex-1 text-sm font-semibold">{c.name}</span>
                  <span className="text-xs text-ink-muted">
                    {c.studentIds.length}/{c.capacity}
                    {full && ' · completa'}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
