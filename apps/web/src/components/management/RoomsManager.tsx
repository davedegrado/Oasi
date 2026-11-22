import { useState } from 'react'
import { Check, DoorOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'

/** Sale della palestra: si aggiungono, si rinominano (le classi seguono) e si eliminano se non usate */
export function RoomsManager() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const rooms = db.association.rooms
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null)
  const [error, setError] = useState('')
  const usedBy = (room: string) => db.classes.filter((c) => c.room === room)

  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn()
      setError('')
      toast(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  return (
    <div>
      <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
        <DoorOpen className="size-4 text-rosa-intenso" /> Sale
      </h2>
      <p className="mb-3 text-sm text-ink-muted">Le sale tra cui scegliere quando crei una classe. Rinominando una sala, le classi la seguono.</p>
      <ul className="divide-y divide-line/70 rounded-2xl border border-line/70 bg-white">
        {rooms.map((r) => {
          const classes = usedBy(r)
          return (
            <li key={r} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              {editing?.from === r ? (
                <>
                  <Input className="h-9 min-w-0 flex-1" value={editing.to} onChange={(e) => setEditing({ from: r, to: e.target.value })} aria-label={`Nuovo nome per ${r}`} autoFocus />
                  <Button size="icon-sm" aria-label="Salva" onClick={() => run(async () => { await repo.renameRoom(r, editing.to); setEditing(null) }, 'Sala rinominata')}>
                    <Check />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Annulla" onClick={() => setEditing(null)}>
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-ink">{r}</span>
                    <span className="ml-2 text-xs text-ink-muted">{classes.length ? `${classes.length} ${classes.length === 1 ? 'classe' : 'classi'}` : 'nessuna classe'}</span>
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label={`Rinomina ${r}`} onClick={() => setEditing({ from: r, to: r })}>
                    <Pencil />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Elimina ${r}`}
                    disabled={classes.length > 0}
                    title={classes.length > 0 ? `Usata da: ${classes.map((c) => c.name).join(', ')}` : undefined}
                    onClick={() => run(() => repo.deleteRoom(r), 'Sala eliminata')}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          )
        })}
        {rooms.length === 0 && <li className="px-3 py-2.5 text-sm text-ink-muted">Nessuna sala.</li>}
      </ul>
      <div className="mt-2 flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nuova sala, es. Sala Sole" aria-label="Nome della nuova sala"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(async () => { await repo.addRoom(draft); setDraft('') }, 'Sala aggiunta') } }} />
        <Button variant="soft" onClick={() => run(async () => { await repo.addRoom(draft); setDraft('') }, 'Sala aggiunta')} disabled={!draft.trim()}>
          <Plus /> Aggiungi
        </Button>
      </div>
      {error && <p className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="mt-2 text-xs text-ink-muted">Una sala usata da una classe non si elimina: sposta prima la classe in un’altra sala.</p>
    </div>
  )
}
