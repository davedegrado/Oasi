import { useState } from 'react'
import { CalendarClock, MapPin, RefreshCcw } from 'lucide-react'
import type { Lesson } from '@/types'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, Select, Textarea } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findClass, findTeacher, lessonRoster, lessonsForStudent } from '@/services/selectors'
import { addDays, formatDate, todayISO } from '@/lib/dates'
import { fullName } from '@/lib/utils'

/** Richiesta di recupero su una lezione di un'altra classe */
export function MakeupDialog({ lesson, studentId, onClose }: { lesson: Lesson; studentId: string; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const cls = findClass(db, lesson.classId)
  const teacher = findTeacher(db, cls?.teacherId)
  const today = todayISO()
  // Lezioni proprie degli ultimi 45 giorni (o prossime) che si possono recuperare
  const ownLessons = lessonsForStudent(db, studentId)
    .filter((l) => l.date >= addDays(today, -45) && l.date <= addDays(today, 21) && l.classId !== lesson.classId)
    .filter((l) => l.status === 'annullata' || l.attendance[studentId] === 'assente' || l.declarations?.[studentId] === 'assente' || l.date >= today)
  const [missed, setMissed] = useState(ownLessons.find((l) => l.status === 'annullata' || l.attendance[studentId] === 'assente')?.id ?? '')
  const [note, setNote] = useState('')
  const free = (cls?.capacity ?? 0) - lessonRoster(db, lesson).length

  const send = async () => {
    await repo.requestMakeup(studentId, lesson.id, missed || undefined, note.trim())
    toast('Richiesta inviata: riceverai la conferma dall’insegnante')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Richiedi un recupero"
      description="La richiesta deve essere approvata dall’insegnante della classe o dall’amministrazione."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={send} disabled={free <= 0}>
            <RefreshCcw /> Invia richiesta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-3xl bg-cipria-50 p-4">
          <p className="font-display text-lg font-bold">{cls?.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft first-letter:uppercase">
            <CalendarClock className="size-4 text-rosa-intenso" /> {formatDate(lesson.date, { weekday: true })} · {lesson.startTime}–{lesson.endTime}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-ink-soft">
            <MapPin className="size-4 text-rosa-intenso" /> {cls?.room} · {teacher ? fullName(teacher) : ''}
          </p>
          <p className={free > 0 ? 'mt-2 text-xs font-semibold text-ok' : 'mt-2 text-xs font-semibold text-danger'}>
            {free > 0 ? `${free} posti disponibili` : 'Lezione al completo'}
          </p>
        </div>
        <Field label="Lezione da recuperare (facoltativo)" htmlFor="missed">
          <Select id="missed" value={missed} onChange={(e) => setMissed(e.target.value)}>
            <option value="">Nessuna in particolare</option>
            {ownLessons.map((l) => {
              const c = findClass(db, l.classId)
              const why = l.status === 'annullata' ? ' · annullata' : l.attendance[studentId] === 'assente' ? ' · assente' : l.declarations?.[studentId] === 'assente' ? ' · non ci sarò' : ''
              return (
                <option key={l.id} value={l.id}>
                  {formatDate(l.date)} · {c?.name}
                  {why}
                </option>
              )
            })}
          </Select>
        </Field>
        <Field label="Messaggio per l’insegnante" htmlFor="makeup-note">
          <Textarea id="makeup-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. recupero la lezione persa per lavoro" />
        </Field>
      </div>
    </Dialog>
  )
}
