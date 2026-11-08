import { useState } from 'react'
import { Mail } from 'lucide-react'
import type { Discipline, Level, MembershipStatus, Student, Teacher } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { LEVEL_LABEL, LEVELS, MEMBERSHIP_LABEL } from '@/lib/labels'
import { useDisciplines } from '@/hooks/useDisciplines'
import { todayISO } from '@/lib/dates'
import { cn, uid } from '@/lib/utils'

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** Nuova allieva o nuova insegnante: la persona riceve un invito via email (simulato nella demo) */
export function NewPersonDialog({ kind, onClose }: { kind: 'allieva' | 'insegnante'; onClose: () => void }) {
  const db = useDatabase()
  const disciplines = useDisciplines()
  const repo = useRepository()
  const { toast } = useToast()
  const [f, setF] = useState({
    firstName: '', lastName: '', email: '', phone: '', birthDate: '', bio: '',
    level: 'base' as Level, discipline: (db.disciplines.find((d) => d.isActive)?.id ?? '') as Discipline, status: 'attiva' as MembershipStatus,
    classIds: [] as string[], disciplines: [] as Discipline[], certificate: '',
  })
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))
  const emailTaken = [...db.students, ...db.teachers].some((p) => p.email.toLowerCase() === f.email.trim().toLowerCase())

  const save = async () => {
    if (!f.firstName.trim() || !f.lastName.trim()) return setError('Inserisci nome e cognome.')
    if (!isEmail(f.email)) return setError('Inserisci un indirizzo email valido: servirà per l’invito.')
    if (emailTaken) return setError('Esiste già una persona con questa email.')
    if (kind === 'allieva') {
      const student: Student = {
        id: uid('stu'), firstName: f.firstName.trim(), lastName: f.lastName.trim(), avatar: '', birthDate: f.birthDate || '2000-01-01',
        email: f.email.trim().toLowerCase(), phone: f.phone.trim(), level: f.level, mainDiscipline: f.discipline, classIds: f.classIds,
        joinedAt: todayISO(), goals: [], invitePending: true,
        membership: {
          status: f.status, cardNumber: `UISP-MO-${Math.floor(10000 + Math.random() * 89999)}`, expiresAt: `${new Date().getFullYear() + (new Date().getMonth() >= 8 ? 1 : 0)}-08-31`,
          medicalCertificateExpiresAt: f.certificate, feePlan: 'Da definire', feePaidUntil: todayISO(),
        },
      }
      await repo.addStudent(student)
    } else {
      const teacher: Teacher = {
        id: uid('tch'), firstName: f.firstName.trim(), lastName: f.lastName.trim(), avatar: '', disciplines: f.disciplines,
        bio: f.bio.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), since: new Date().getFullYear(), invitePending: true,
      }
      await repo.addTeacher(teacher)
    }
    toast(`Invito inviato a ${f.email.trim()} (simulazione)`)
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={kind === 'allieva' ? 'Nuova allieva' : 'Nuova insegnante'}
      description="Riceverà un’email con il link per creare la password e accedere all’app."
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save}>
            <Mail /> Crea e invia invito
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" htmlFor="np-first">
            <Input id="np-first" value={f.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </Field>
          <Field label="Cognome" htmlFor="np-last">
            <Input id="np-last" value={f.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </Field>
        </div>
        <Field label="Email" htmlFor="np-email" hint={emailTaken ? 'Email già presente.' : 'Usata per l’invito e per accedere.'}>
          <Input id="np-email" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="nome@esempio.it" />
        </Field>
        <Field label="Telefono (facoltativo)" htmlFor="np-phone">
          <Input id="np-phone" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        {kind === 'allieva' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data di nascita" htmlFor="np-birth">
                <Input id="np-birth" type="date" value={f.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
              </Field>
              <Field label="Stato iscrizione" htmlFor="np-status">
                <Select id="np-status" value={f.status} onChange={(e) => set('status', e.target.value as MembershipStatus)}>
                  {(Object.keys(MEMBERSHIP_LABEL) as MembershipStatus[]).map((s) => (
                    <option key={s} value={s}>{MEMBERSHIP_LABEL[s]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Livello" htmlFor="np-level">
                <Select id="np-level" value={f.level} onChange={(e) => set('level', e.target.value as Level)}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Disciplina principale" htmlFor="np-disc">
                <Select id="np-disc" value={f.discipline} onChange={(e) => set('discipline', e.target.value as Discipline)}>
                  {disciplines.active.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Scadenza certificato medico (se già consegnato)" htmlFor="np-cert">
              <Input id="np-cert" type="date" value={f.certificate} onChange={(e) => set('certificate', e.target.value)} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-soft">Classi (facoltativo)</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {db.classes.map((c) => {
                  const checked = f.classIds.includes(c.id)
                  const full = !checked && c.studentIds.length >= c.capacity
                  return (
                    <label key={c.id} className={cn('flex cursor-pointer items-center gap-2.5 rounded-2xl border p-2.5 text-sm', checked ? 'border-rosa bg-cipria-50' : 'border-line', full && 'cursor-not-allowed opacity-50')}>
                      <input type="checkbox" className="size-4 accent-[var(--color-rosa-intenso)]" checked={checked} disabled={full}
                        onChange={(e) => set('classIds', e.target.checked ? [...f.classIds, c.id] : f.classIds.filter((id) => id !== c.id))} />
                      <span className="flex-1">{c.name}</span>
                      <span className="text-xs text-ink-muted">{c.studentIds.length}/{c.capacity}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink-soft">Discipline insegnate</p>
              <div className="flex flex-wrap gap-2">
                {disciplines.active.map(({ id: d, name }) => {
                  const on = f.disciplines.includes(d)
                  return (
                    <button key={d} type="button" aria-pressed={on}
                      onClick={() => set('disciplines', on ? f.disciplines.filter((x) => x !== d) : [...f.disciplines, d])}
                      className={cn('rounded-full border px-3.5 py-1.5 text-sm font-semibold', on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft')}>
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
            <Field label="Breve presentazione (facoltativa)" htmlFor="np-bio">
              <Textarea id="np-bio" rows={3} value={f.bio} onChange={(e) => set('bio', e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Dialog>
  )
}
