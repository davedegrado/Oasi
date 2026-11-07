import { useState } from 'react'
import { BellRing, CalendarOff, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Closure, ClosureKind } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { formatDate, todayISO } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { CLOSURE_KIND_LABEL } from './closureLabels'


const NATIONAL_HOLIDAYS: [number, number, string][] = [
  [11, 1, 'Ognissanti'], [12, 8, 'Immacolata Concezione'], [12, 25, 'Natale'], [12, 26, 'Santo Stefano'],
  [1, 1, 'Capodanno'], [1, 6, 'Epifania'], [4, 25, 'Festa della Liberazione'], [5, 1, 'Festa dei lavoratori'], [6, 2, 'Festa della Repubblica'],
]

function nextDate(month: number, day: number): string {
  const today = todayISO()
  const y = Number(today.slice(0, 4))
  const iso = (yy: number) => `${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return iso(y) >= today ? iso(y) : iso(y + 1)
}

const range = (c: Closure) => (c.startDate === c.endDate ? formatDate(c.startDate, { weekday: true }) : `dal ${formatDate(c.startDate)} al ${formatDate(c.endDate)}`)

/** Festività, scioperi e chiusure: annullano le lezioni e avvisano le allieve */
export function ClosuresManager() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [editing, setEditing] = useState<Closure | null>(null)
  const today = todayISO()
  const closures = (db.closures ?? []).filter((c) => c.endDate >= today)
  const affected = (c: Closure) => db.lessons.filter((l) => l.closureId === c.id).length

  const addHolidays = async () => {
    const existing = new Set((db.closures ?? []).map((c) => c.startDate))
    let added = 0
    for (const [m, d, title] of NATIONAL_HOLIDAYS) {
      const date = nextDate(m, d)
      if (existing.has(date)) continue
      await repo.saveClosure({ id: uid('clo'), kind: 'festivita', title, startDate: date, endDate: date, note: 'Sede chiusa per festività nazionale.' })
      added++
    }
    toast(added ? `${added} festività aggiunte al calendario` : 'Le festività sono già presenti', 'info')
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <CalendarOff className="size-4 text-rosa-intenso" /> Chiusure e giorni senza lezione
            </h2>
            <p className="text-sm text-ink-muted">Festività, scioperi o chiusure della sede: le lezioni di quei giorni vengono annullate.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={addHolidays}>
              Aggiungi festività nazionali
            </Button>
            <Button size="sm" onClick={() => setEditing({ id: uid('clo'), kind: 'chiusura', title: '', startDate: today, endDate: today, note: '' })}>
              <Plus /> Nuova chiusura
            </Button>
          </div>
        </div>
        {closures.length === 0 && <p className="text-sm text-ink-muted">Nessuna chiusura in programma.</p>}
        <ul className="divide-y divide-line/70">
          {closures.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{c.title}</p>
                  <Badge tone={c.kind === 'sciopero' ? 'warn' : c.kind === 'festivita' ? 'rosa' : 'neutral'}>{CLOSURE_KIND_LABEL[c.kind]}</Badge>
                </div>
                <p className="text-sm text-ink-muted first-letter:uppercase">
                  {range(c)} · {affected(c) === 1 ? '1 lezione annullata' : `${affected(c)} lezioni annullate`}
                </p>
                <p className="text-xs text-ink-muted">{c.reminderSentAt ? `Promemoria inviato il ${formatDate(c.reminderSentAt.slice(0, 10))}` : 'Promemoria non ancora inviato'}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant={c.reminderSentAt ? 'outline' : 'soft'}
                  onClick={async () => {
                    await repo.sendClosureReminder(c.id)
                    toast('Promemoria inviato ad allieve e insegnanti')
                  }}
                >
                  <BellRing /> {c.reminderSentAt ? 'Reinvia' : 'Invia promemoria'}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Modifica" onClick={() => setEditing(c)}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-danger"
                  aria-label="Elimina"
                  onClick={async () => {
                    await repo.deleteClosure(c.id)
                    toast('Chiusura eliminata: le lezioni sono state ripristinate', 'info')
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
      {editing && <ClosureDialog initial={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function ClosureDialog({ initial, onClose }: { initial: Closure; onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [c, setC] = useState(initial)
  const [sendNow, setSendNow] = useState(!initial.reminderSentAt)
  const [error, setError] = useState('')
  const set = <K extends keyof Closure>(k: K, v: Closure[K]) => setC((x) => ({ ...x, [k]: v }))

  const save = async () => {
    if (!c.title.trim()) return setError('Indica il motivo della chiusura.')
    if (c.endDate < c.startDate) return setError('La data di fine deve essere uguale o successiva all’inizio.')
    await repo.saveClosure({ ...c, title: c.title.trim(), note: c.note.trim() })
    if (sendNow) await repo.sendClosureReminder(c.id)
    toast(sendNow ? 'Chiusura salvata e allieve avvisate' : 'Chiusura salvata: lezioni annullate')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Chiusura"
      description="Le lezioni nelle date indicate risultano annullate nel calendario di tutte."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={save}>Salva</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="cl-kind">
            <Select id="cl-kind" value={c.kind} onChange={(e) => set('kind', e.target.value as ClosureKind)}>
              {(Object.keys(CLOSURE_KIND_LABEL) as ClosureKind[]).map((k) => (
                <option key={k} value={k}>{CLOSURE_KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Motivo" htmlFor="cl-title">
            <Input id="cl-title" value={c.title} onChange={(e) => set('title', e.target.value)} placeholder="Es. Sciopero generale" />
          </Field>
          <Field label="Dal" htmlFor="cl-start">
            <Input id="cl-start" type="date" value={c.startDate} onChange={(e) => setC((x) => ({ ...x, startDate: e.target.value, endDate: x.endDate < e.target.value ? e.target.value : x.endDate }))} />
          </Field>
          <Field label="Al" htmlFor="cl-end">
            <Input id="cl-end" type="date" min={c.startDate} value={c.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
        </div>
        <Field label="Messaggio per le allieve" htmlFor="cl-note">
          <Textarea id="cl-note" rows={3} value={c.note} onChange={(e) => set('note', e.target.value)} placeholder="Es. Le lezioni verranno recuperate sabato mattina." />
        </Field>
        <label className="flex items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--color-rosa-intenso)]" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} />
          Invia subito il promemoria ad allieve e insegnanti
        </label>
      </div>
    </Dialog>
  )
}
