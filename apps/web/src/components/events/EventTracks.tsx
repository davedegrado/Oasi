import { useState } from 'react'
import { Music2, Plus, Trash2 } from 'lucide-react'
import type { EventTrack, OasiEvent } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { findClass, isPerformance } from '@/services/selectors'
import { uid } from '@/lib/utils'

/**
 * Brani musicali di una performance: si registrano solo i nomi (titolo, autore,
 * gruppo o classe). Nessun file audio viene caricato o riprodotto.
 * `editor`: 'admin' oppure l'id dell'insegnante; assente = sola lettura.
 */
export function EventTracksDialog({ event, editor, onClose }: { event: OasiEvent; editor?: string; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const tracks = event.tracks ?? []
  // Un insegnante associa brani solo alle proprie classi
  const classes = db.classes.filter((c) => editor === 'admin' || c.teacherId === editor)
  const [draft, setDraft] = useState({ title: '', artist: '', group: '', classId: '' })
  const canRemove = (t: EventTrack) => editor === 'admin' || (!!editor && (t.addedBy === editor || classes.some((c) => c.id === t.classId)))

  const save = (next: EventTrack[]) => repo.saveEvent({ ...event, tracks: next })
  const add = async () => {
    if (!draft.title.trim() || !editor) return
    await save([...tracks, { id: uid('trk'), title: draft.title.trim(), artist: draft.artist.trim(), group: draft.group.trim(), classId: draft.classId || undefined, addedBy: editor }])
    setDraft({ title: '', artist: '', group: '', classId: '' })
    toast('Brano aggiunto')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Brani · ${event.title}`} description="Solo i nomi dei brani: nessun file audio viene caricato o riprodotto.">
      {tracks.length === 0 ? (
        <p className="rounded-2xl bg-cipria-50 p-4 text-sm text-ink-muted">Nessun brano indicato per ora.</p>
      ) : (
        <ol className="divide-y divide-line/70">
          {tracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cipria text-xs font-bold text-rosa-intenso">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {t.title}
                  {t.artist && <span className="font-normal text-ink-muted"> · {t.artist}</span>}
                </p>
                <p className="truncate text-xs text-ink-muted">{[t.group, findClass(db, t.classId)?.name].filter(Boolean).join(' · ') || 'Tutta la performance'}</p>
              </div>
              {canRemove(t) && (
                <Button size="icon-sm" variant="ghost" aria-label={`Rimuovi ${t.title}`} onClick={() => save(tracks.filter((x) => x.id !== t.id))}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
      {editor && (
        <div className="mt-4 space-y-3 rounded-3xl bg-cipria-50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Titolo del brano" htmlFor="trk-title">
              <Input id="trk-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Es. Experience" />
            </Field>
            <Field label="Autore (facoltativo)" htmlFor="trk-artist">
              <Input id="trk-artist" value={draft.artist} onChange={(e) => setDraft({ ...draft, artist: e.target.value })} placeholder="Es. Ludovico Einaudi" />
            </Field>
            <Field label="Gruppo o performance" htmlFor="trk-group">
              <Input id="trk-group" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} placeholder="Es. Gruppo cerchio" />
            </Field>
            <Field label="Classe (facoltativo)" htmlFor="trk-class">
              <Select id="trk-class" value={draft.classId} onChange={(e) => setDraft({ ...draft, classId: e.target.value })}>
                <option value="">Nessuna classe</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button size="sm" onClick={add} disabled={!draft.title.trim()}>
            <Plus /> Aggiungi brano
          </Button>
        </div>
      )}
    </Dialog>
  )
}

/** Pulsante "Brani" per le performance: apre l'elenco (modificabile se `editor` è indicato) */
export function EventTracksButton({ event, editor }: { event: OasiEvent; editor?: string }) {
  const [open, setOpen] = useState(false)
  if (!isPerformance(event)) return null
  const n = event.tracks?.length ?? 0
  if (!editor && n === 0) return null
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Music2 /> Brani{n > 0 ? ` (${n})` : ''}
      </Button>
      {open && <EventTracksDialog event={event} editor={editor} onClose={() => setOpen(false)} />}
    </>
  )
}
