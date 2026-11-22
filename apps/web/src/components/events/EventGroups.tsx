import { useState } from 'react'
import { Music2, Pencil, Plus, Trash2, Users, UsersRound } from 'lucide-react'
import type { EventGroup, OasiEvent } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { eventParticipants, eventPerson, hasGroups } from '@/services/selectors'
import { cn, fullName, uid } from '@/lib/utils'

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Operazione non riuscita')

/** Modulo di un gruppo: nome, titolo della canzone e atleti partecipanti (anche già in altri gruppi) */
function GroupForm({ event, group, editorId, onDone }: { event: OasiEvent; group?: EventGroup; editorId: string; onDone: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [name, setName] = useState(group?.name ?? '')
  const [song, setSong] = useState(group?.song ?? '')
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? [])
  const [error, setError] = useState('')
  const athletes = eventParticipants(db, event).filter((p) => p.role === 'atleta')
  const otherGroups = (id: string) => (event.groups ?? []).filter((g) => g.id !== group?.id && g.memberIds.includes(id)).map((g) => g.name)

  const save = async () => {
    try {
      await repo.saveEventGroup(event.id, { id: group?.id ?? uid('grp'), name, song, memberIds: members, createdBy: group?.createdBy ?? editorId })
      toast(group ? 'Gruppo aggiornato' : 'Gruppo creato: gli atleti sono avvisati')
      onDone()
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <div className="space-y-3 rounded-3xl bg-cipria-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome del gruppo" htmlFor="grp-name">
          <Input id="grp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Duo cerchio" autoFocus />
        </Field>
        <Field label="Canzone (solo il titolo)" htmlFor="grp-song">
          <Input id="grp-song" value={song} onChange={(e) => setSong(e.target.value)} placeholder="Es. Clair de lune · Debussy" />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-ink">
          Atleti del gruppo <span className="font-normal text-ink-muted">· {members.length} scelti</span>
        </legend>
        {athletes.length === 0 ? (
          <p className="text-sm text-ink-muted">Nessun atleta partecipa ancora all’evento.</p>
        ) : (
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-2xl bg-white p-2 sm:grid-cols-2">
            {athletes.map((p) => {
              const others = otherGroups(p.id)
              return (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl p-1.5 text-sm hover:bg-cipria-50">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-rosa-intenso"
                      checked={members.includes(p.id)}
                      onChange={(e) => setMembers(e.target.checked ? [...members, p.id] : members.filter((id) => id !== p.id))}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{fullName(p)}</span>
                      {others.length > 0 && <span className="block truncate text-xs text-ink-muted">anche in: {others.join(', ')}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </fieldset>
      {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={!name.trim()}>
          {group ? 'Salva il gruppo' : <><Plus /> Crea il gruppo</>}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Annulla
        </Button>
      </div>
    </div>
  )
}

/**
 * Gruppi di un evento: li organizzano insegnanti e amministrazione (`editorId`),
 * gli atleti partecipanti li consultano (`viewerId`) e vedono evidenziati i propri.
 */
export function EventGroupsDialog({ event, editorId, viewerId, onClose }: { event: OasiEvent; editorId?: string; viewerId?: string; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [form, setForm] = useState<{ group?: EventGroup } | null>(null)
  const groups = event.groups ?? []

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Gruppi · ${event.title}`}
      description={editorId ? 'Organizza gli atleti partecipanti in gruppi e indica la canzone di ciascuno. Un’atleta può stare in più gruppi.' : 'I gruppi dell’evento e la canzone di ciascuno.'}
    >
      {groups.length === 0 && !form && <p className="rounded-2xl bg-cipria-50 p-4 text-sm text-ink-muted">Nessun gruppo per ora.</p>}
      <ul className="space-y-3">
        {groups.map((g) =>
          form?.group?.id === g.id && editorId ? (
            <li key={g.id}>
              <GroupForm event={event} group={g} editorId={editorId} onDone={() => setForm(null)} />
            </li>
          ) : (
            <li key={g.id} className={cn('rounded-3xl border p-3.5', viewerId && g.memberIds.includes(viewerId) ? 'border-rosa-intenso/40 bg-cipria-50' : 'border-line/70')}>
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cipria text-rosa-intenso">
                  <UsersRound className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {g.name}
                    {viewerId && g.memberIds.includes(viewerId) && <span className="ml-2 rounded-full bg-rosa-intenso px-2 py-0.5 text-[11px] font-bold text-white">Il tuo gruppo</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                    <Music2 className="size-3.5 shrink-0" /> {g.song || <span className="text-ink-muted">canzone da definire</span>}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {g.memberIds.length === 0
                      ? 'Nessun atleta'
                      : g.memberIds
                          .map((id) => eventPerson(db, id))
                          .filter((p): p is NonNullable<typeof p> => !!p)
                          .map((p) => fullName(p))
                          .join(', ')}
                  </p>
                </div>
                {editorId && (
                  <span className="flex shrink-0 gap-1">
                    <Button size="icon-sm" variant="ghost" aria-label={`Modifica ${g.name}`} onClick={() => setForm({ group: g })}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Elimina ${g.name}`}
                      onClick={async () => {
                        await repo.deleteEventGroup(event.id, g.id)
                        toast('Gruppo eliminato', 'info')
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {editorId && (form && !form.group ? (
        <div className="mt-3">
          <GroupForm event={event} editorId={editorId} onDone={() => setForm(null)} />
        </div>
      ) : (
        !form && (
          <Button size="sm" className="mt-4" onClick={() => setForm({})}>
            <Plus /> Nuovo gruppo
          </Button>
        )
      ))}
    </Dialog>
  )
}

/**
 * Pulsanti "Gruppi" e "Partecipanti" di un evento (non sociale).
 * `editorId`: insegnante o amministrazione, che organizza i gruppi; `viewerId`: atleta che guarda
 * (vede gruppi e partecipanti solo se partecipa).
 */
export function EventGroupsButton({ event, editorId, viewerId }: { event: OasiEvent; editorId?: string; viewerId?: string }) {
  const db = useDatabase()
  const [open, setOpen] = useState<'gruppi' | 'partecipanti' | null>(null)
  if (!hasGroups(event)) return null
  const n = event.groups?.length ?? 0
  const people = eventParticipants(db, event)
  const canSee = !viewerId || people.some((p) => p.id === viewerId)
  return (
    <>
      {(editorId || (canSee && n > 0)) && (
        <Button size="sm" variant="outline" onClick={() => setOpen('gruppi')}>
          <UsersRound /> Gruppi{n > 0 ? ` (${n})` : ''}
        </Button>
      )}
      {canSee && (
        <Button size="sm" variant="ghost" onClick={() => setOpen('partecipanti')} aria-label={`Partecipanti: ${people.length}`}>
          <Users /> {people.length}
        </Button>
      )}
      {open === 'gruppi' && <EventGroupsDialog event={event} editorId={editorId} viewerId={viewerId} onClose={() => setOpen(null)} />}
      {open === 'partecipanti' && (
        <Dialog open onOpenChange={(o) => !o && setOpen(null)} title={`Partecipanti · ${event.title}`} description={`${event.location} · ${people.length} partecipanti`}>
          <ul className="divide-y divide-line/70">
            {people.map((p) => (
              <li key={p.id} className="py-2 text-sm font-semibold text-ink">
                {fullName(p)}
              </li>
            ))}
          </ul>
          {people.length === 0 && <p className="text-sm text-ink-muted">Nessun partecipante per ora.</p>}
        </Dialog>
      )}
    </>
  )
}
