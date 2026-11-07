import { useState } from 'react'
import { ImageIcon, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import type { OasiEvent } from '@/types'
import { PageHeader, SectionTitle } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { ProgressBar } from '@/components/ui/progress'
import { EventCard } from '@/components/events/EventCard'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findStudent, pastEvents, upcomingEvents } from '@/services/selectors'
import { getPhotoLibrary } from '@/services/media'
import { addDays, todayISO } from '@/lib/dates'
import { EVENT_TYPE_LABEL } from '@/lib/labels'
import { cn, fullName, percent, uid } from '@/lib/utils'

function emptyEvent(): OasiEvent {
  return {
    id: uid('evt'),
    title: '',
    type: 'workshop',
    date: addDays(todayISO(), 14),
    startTime: '15:00',
    endTime: '17:00',
    location: 'Sala Luna — Viale Verdi 186, Modena',
    description: '',
    image: '/images/photos/tessuti-05.webp',
    capacity: 15,
    participantIds: [],
  }
}

export function AdminEvents() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [editing, setEditing] = useState<{ event: OasiEvent; isNew: boolean } | null>(null)
  const [participantsOf, setParticipantsOf] = useState<string | null>(null)
  const upcoming = upcomingEvents(db)
  const past = pastEvents(db)
  const viewing = db.events.find((e) => e.id === participantsOf)

  const actions = (e: OasiEvent) => (
    <>
      <Button size="sm" variant="soft" onClick={() => setParticipantsOf(e.id)}>
        <Users /> Adesioni ({e.participantIds.length})
      </Button>
      <Button size="sm" variant="outline" onClick={() => setEditing({ event: structuredClone(e), isNew: false })}>
        <Pencil /> Modifica
      </Button>
    </>
  )

  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Eventi"
        title="Spettacoli, stage e workshop"
        description="Crea eventi, modificali e controlla le adesioni delle allieve."
        actions={
          <Button onClick={() => setEditing({ event: emptyEvent(), isNew: true })}>
            <Plus /> Nuovo evento
          </Button>
        }
        className="mb-0"
      />
      <section>
        <SectionTitle title={`In programma (${upcoming.length})`} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e) => (
            <div key={e.id}>
              <EventCard event={e} footer={actions(e)} />
            </div>
          ))}
        </div>
      </section>
      {past.length > 0 && (
        <section>
          <SectionTitle title="Eventi passati" />
          <div className="grid gap-3 md:grid-cols-2">
            {past.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                variant="horizontal"
                className="opacity-80"
                footer={
                  <Button size="sm" variant="ghost" onClick={() => setParticipantsOf(e.id)}>
                    {e.participantIds.length} <Users />
                  </Button>
                }
              />
            ))}
          </div>
        </section>
      )}

      {editing && <EventDialog key={editing.event.id} initial={editing.event} isNew={editing.isNew} onClose={() => setEditing(null)} />}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setParticipantsOf(null)} title={viewing ? `Adesioni · ${viewing.title}` : ''} description={viewing ? `${viewing.participantIds.length} su ${viewing.capacity} posti` : ''}>
        {viewing && (
          <>
            <ProgressBar value={percent(viewing.participantIds.length, viewing.capacity)} className="mb-4" />
            <ul className="divide-y divide-line/70">
              {viewing.participantIds
                .map((id) => findStudent(db, id))
                .filter((s) => !!s)
                .map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <Avatar person={s} size="sm" />
                    <span className="flex-1 text-sm font-semibold">{fullName(s)}</span>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Rimuovi ${s.firstName}`}
                      onClick={async () => {
                        await repo.toggleEventParticipation(viewing.id, s.id)
                        toast('Adesione rimossa')
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
            </ul>
            {viewing.participantIds.length === 0 && <p className="text-sm text-ink-muted">Nessuna adesione per ora.</p>}
            <p className="mt-4 text-xs text-ink-muted">Le allieve aderiscono dalla loro Home con il pulsante “Partecipo”.</p>
          </>
        )}
      </Dialog>
    </div>
  )
}

function EventDialog({ initial, isNew, onClose }: { initial: OasiEvent; isNew: boolean; onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [event, setEvent] = useState(initial)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = <K extends keyof OasiEvent>(k: K, v: OasiEvent[K]) => setEvent((e) => ({ ...e, [k]: v }))
  const images = getPhotoLibrary()

  const save = async () => {
    if (!event.title.trim()) return setError('Inserisci un titolo')
    if (!event.date) return setError('Inserisci una data')
    await repo.saveEvent({ ...event, title: event.title.trim() })
    toast(isNew ? 'Evento creato: visibile alle allieve' : 'Evento aggiornato')
    onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'Nuovo evento' : 'Modifica evento'}
      className="sm:max-w-xl"
      footer={
        confirmDelete ? (
          <>
            <span className="mr-auto self-center text-sm font-semibold text-danger">Eliminare l’evento?</span>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              No
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.deleteEvent(event.id)
                toast('Evento eliminato')
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
            <Button onClick={save}>{isNew ? 'Crea evento' : 'Salva'}</Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <Field label="Titolo" htmlFor="e-title">
          <Input id="e-title" value={event.title} onChange={(e) => set('title', e.target.value)} placeholder="Es. Open day danza aerea" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="e-type">
            <Select id="e-type" value={event.type} onChange={(e) => set('type', e.target.value as OasiEvent['type'])}>
              {(Object.keys(EVENT_TYPE_LABEL) as OasiEvent['type'][]).map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data" htmlFor="e-date">
            <Input id="e-date" type="date" value={event.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          <Field label="Inizio" htmlFor="e-start">
            <Input id="e-start" type="time" value={event.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </Field>
          <Field label="Fine" htmlFor="e-end">
            <Input id="e-end" type="time" value={event.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </Field>
        </div>
        <Field label="Luogo" htmlFor="e-loc">
          <Input id="e-loc" value={event.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Posti disponibili" htmlFor="e-cap">
          <Input id="e-cap" type="number" min={1} value={event.capacity} onChange={(e) => set('capacity', Math.max(1, Number(e.target.value) || 1))} />
        </Field>
        <Field label="Descrizione" htmlFor="e-desc">
          <Textarea id="e-desc" rows={3} value={event.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
            <ImageIcon className="size-4" /> Immagine di copertina
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {images.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => set('image', src)}
                className={cn('size-16 shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 transition', event.image === src ? 'ring-rosa-intenso' : 'ring-transparent opacity-70 hover:opacity-100')}
                aria-label="Scegli immagine"
              >
                <img src={src} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
