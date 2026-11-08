import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Power } from 'lucide-react'
import type { DisciplineIconName, DisciplineInfo } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Textarea } from '@/components/ui/input'
import { IconByName } from '@/components/common/badges'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { softColor } from '@/hooks/useDisciplines'
import { weekdayName } from '@/lib/dates'
import { cn } from '@/lib/utils'

const ICONS: DisciplineIconName[] = ['circle', 'wind', 'sparkles', 'music', 'flower', 'dumbbell', 'star']
const COLORS = ['#D66A9B', '#8A7BB8', '#E0915A', '#4E9F8A', '#5B8BD0', '#C9A227', '#B04A6F']

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Discipline come dati della palestra: si creano, modificano, attivano e disattivano.
 * Disattivare non elimina classi, allieve o storico: impedisce solo nuove classi e iscrizioni.
 */
export function DisciplinesManager() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [editing, setEditing] = useState<DisciplineInfo | null>(null)

  const toggle = async (d: DisciplineInfo) => {
    await repo.saveDiscipline({ ...d, isActive: !d.isActive })
    toast(d.isActive ? `${d.name} disattivata: classi e storico restano consultabili` : `${d.name} riattivata`, 'info')
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Discipline</h2>
            <p className="text-sm text-ink-muted">Le discipline configurate qui sono quelle proposte quando crei una classe.</p>
          </div>
          <Button size="sm" onClick={() => setEditing({ id: '', name: '', shortName: '', description: '', color: COLORS[db.disciplines.length % COLORS.length], icon: 'sparkles', hasFigureArchive: true, isActive: true })}>
            <Plus /> Nuova disciplina
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {db.disciplines.map((d) => {
            const classes = db.classes.filter((c) => c.discipline === d.id)
            const students = new Set(classes.flatMap((c) => c.studentIds)).size
            const figures = db.figures.filter((f) => f.discipline === d.id).length
            return (
              <div key={d.id} className={cn('rounded-3xl p-4', !d.isActive && 'opacity-70 grayscale-[40%]')} style={{ background: softColor(d.color) }}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full text-white" style={{ background: d.color }}>
                    <IconByName name={d.icon} className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-display font-bold">
                      {d.name} {!d.isActive && <Badge tone="warn">Disattivata</Badge>}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {classes.length} classi · {students} allieve · {figures} figure
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" aria-label={`Modifica ${d.name}`} onClick={() => setEditing(d)}>
                    <Pencil />
                  </Button>
                </div>
                {d.description && <p className="mt-2 text-sm text-ink-soft">{d.description}</p>}
                {classes.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {classes.map((c) => (
                      <li key={c.id}>
                        <Link to="/admin/classi" className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-ink-soft hover:bg-white">
                          {c.name} · {weekdayName(c.weekday).slice(0, 3)} {c.startTime}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                <Button size="sm" variant="outline" className="mt-3" onClick={() => toggle(d)}>
                  <Power /> {d.isActive ? 'Disattiva' : 'Riattiva'}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
      {editing && <DisciplineDialog discipline={editing} onClose={() => setEditing(null)} />}
    </Card>
  )
}

function DisciplineDialog({ discipline, onClose }: { discipline: DisciplineInfo; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [form, setForm] = useState(discipline)
  const [error, setError] = useState('')
  const isNew = !discipline.id
  const save = async () => {
    let id = form.id
    if (isNew) {
      id = slugify(form.name) || 'disciplina'
      while (db.disciplines.some((d) => d.id === id)) id += '-2'
    }
    try {
      await repo.saveDiscipline({ ...form, id })
      toast(isNew ? 'Disciplina creata: ora puoi usarla nelle classi' : 'Disciplina aggiornata')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore')
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Nuova disciplina' : `Modifica ${discipline.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={!form.name.trim()}>Salva</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="dis-name">
          <Input id="dis-name" value={form.name} placeholder="es. Pole dance" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Nome breve" htmlFor="dis-short" hint="Usato nei badge">
          <Input id="dis-short" value={form.shortName} placeholder="es. Pole" onChange={(e) => setForm({ ...form, shortName: e.target.value })} />
        </Field>
        <Field label="Descrizione" htmlFor="dis-desc" className="sm:col-span-2">
          <Textarea id="dis-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-semibold">Colore e icona</p>
          <div className="flex flex-wrap items-center gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colore ${c}`} onClick={() => setForm({ ...form, color: c })} className={cn('size-8 rounded-full ring-offset-2', form.color === c && 'ring-2 ring-ink')} style={{ background: c }} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {ICONS.map((i) => (
              <button key={i} type="button" aria-label={`Icona ${i}`} onClick={() => setForm({ ...form, icon: i })} className={cn('grid size-10 place-items-center rounded-2xl border', form.icon === i ? 'border-transparent text-white' : 'border-line bg-white text-ink-soft')} style={form.icon === i ? { background: form.color } : undefined}>
                <IconByName name={i} className="size-5" />
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
          <input type="checkbox" className="size-4 accent-rosa-intenso" checked={form.hasFigureArchive} onChange={(e) => setForm({ ...form, hasFigureArchive: e.target.checked })} /> Ha un archivio figure (didattica)
        </label>
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2">{error}</p>}
      </div>
    </Dialog>
  )
}
