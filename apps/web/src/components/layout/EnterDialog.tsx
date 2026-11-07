import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles, UserPlus } from 'lucide-react'
import type { Discipline, Role, Student } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { Field, Input, Select } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { DEFAULT_USER, ROLE_HOME } from '@/context/demo-context'
import { DISCIPLINE_LABEL, DISCIPLINES } from '@/lib/labels'
import { todayISO } from '@/lib/dates'
import { fullName, uid } from '@/lib/utils'

/** Scelta del profilo demo: utente con dati di esempio, altra persona, oppure nuova registrazione */
export function EnterDialog({ role, onClose }: { role: Role; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { enterAs } = useDemo()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'choose' | 'register'>('choose')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', discipline: 'cerchio' as Discipline })
  const [error, setError] = useState('')

  const people = role === 'allieva' ? db.students : db.teachers
  const featured = people.find((p) => p.id === DEFAULT_USER[role]) ?? people[0]
  const [other, setOther] = useState(featured?.id ?? '')

  const go = (userId: string | null, path?: string) => {
    enterAs(role, userId)
    onClose()
    navigate(path ?? ROLE_HOME[role])
  }

  const register = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) return setError('Inserisci nome e cognome.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setError('Inserisci un’email valida.')
    if (db.students.some((s) => s.email.toLowerCase() === form.email.trim().toLowerCase())) return setError('Questa email è già registrata: entra con il profilo esistente.')
    const student: Student = {
      id: uid('stu'), firstName: form.firstName.trim(), lastName: form.lastName.trim(), avatar: '', birthDate: '2000-01-01',
      email: form.email.trim().toLowerCase(), phone: '', level: 'base', mainDiscipline: form.discipline, classIds: [], joinedAt: todayISO(), goals: [],
      membership: { status: 'prova', cardNumber: 'Da assegnare', expiresAt: todayISO(), medicalCertificateExpiresAt: '', feePlan: 'Lezione di prova', feePaidUntil: todayISO() },
    }
    await repo.addStudent(student)
    go(student.id, '/allieva')
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'register' ? 'Registrati come nuova allieva' : role === 'allieva' ? 'Entra come allieva' : 'Entra come insegnante'}
      description={mode === 'register' ? 'Simulazione: nessuna email viene inviata.' : 'Demo senza password: scegli con quale profilo entrare.'}
    >
      {mode === 'choose' ? (
        <div className="space-y-4">
          {featured && (
            <button type="button" onClick={() => go(featured.id)} className="flex w-full items-center gap-3 rounded-3xl border border-rosa bg-cipria-50 p-4 text-left transition hover:shadow-soft">
              <Avatar person={featured} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block font-display font-bold">{fullName(featured)}</span>
                <span className="flex items-center gap-1 text-sm text-ink-muted">
                  <Sparkles className="size-3.5 text-rosa-intenso" /> Profilo con dati di esempio (consigliato)
                </span>
              </span>
              <ArrowRight className="size-5 text-rosa-intenso" />
            </button>
          )}
          <div>
            <Field label={role === 'allieva' ? 'Oppure scegli un’altra allieva' : 'Oppure scegli un’altra insegnante'} htmlFor="enter-other">
              <Select id="enter-other" value={other} onChange={(e) => setOther(e.target.value)}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                    {p.invitePending ? ' (nuova)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Button variant="outline" className="mt-2 w-full" onClick={() => go(other)}>
              Entra con questo profilo
            </Button>
          </div>
          {role === 'allieva' && (
            <div className="border-t border-line pt-4">
              <Button variant="dark" className="w-full" onClick={() => setMode('register')}>
                <UserPlus /> Sono nuova: registrati
              </Button>
              <p className="mt-2 text-center text-xs text-ink-muted">Prova l’app come una nuova iscritta: profilo vuoto, ti iscrivi tu ai corsi.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome" htmlFor="reg-first">
              <Input id="reg-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Cognome" htmlFor="reg-last">
              <Input id="reg-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label="Email" htmlFor="reg-email">
            <Input id="reg-email" type="email" inputMode="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nome@esempio.it" />
          </Field>
          <Field label="Disciplina che ti interessa" htmlFor="reg-disc">
            <Select id="reg-disc" value={form.discipline} onChange={(e) => setForm({ ...form, discipline: e.target.value as Discipline })}>
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>{DISCIPLINE_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMode('choose')}>
              Indietro
            </Button>
            <Button className="flex-1" onClick={register}>
              Crea profilo ed entra
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
