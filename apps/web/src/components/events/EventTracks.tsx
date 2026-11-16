import { useState } from 'react'
import { Music2, Plus, Trash2, Users } from 'lucide-react'
import type { EventTrack, OasiEvent } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { eventParticipants, findClass, isPerformance } from '@/services/selectors'
import { readFileAsDataUrl } from '@/components/documents/documentUtils'
import { fullName, uid } from '@/lib/utils'

/**
 * Musica di una performance: titolo, autore, gruppo o classe, collegamento e file audio.
 * La gestisce l'amministrazione; insegnanti e allieve la consultano.
 * Collegamento e audio sono riservati a staff e partecipanti (`canListen`).
 */
export function EventTracksDialog({ event, editor, canListen = true, onClose }: { event: OasiEvent; editor?: 'admin'; canListen?: boolean; onClose: () => void }) {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const tracks = event.tracks ?? []
  const classes = db.classes
  const [draft, setDraft] = useState({ title: '', artist: '', group: '', classId: '', url: '' })
  const [audio, setAudio] = useState<{ data: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const canRemove = (_t: EventTrack) => editor === 'admin'

  const save = (next: EventTrack[]) => repo.saveEvent({ ...event, tracks: next })
  const add = async () => {
    if (!draft.title.trim() || !editor) return
    const url = draft.url.trim()
    if (url && !/^https:\/\//.test(url)) return setError('Il collegamento deve iniziare con https://')
    await save([...tracks, { id: uid('trk'), title: draft.title.trim(), artist: draft.artist.trim(), group: draft.group.trim(), classId: draft.classId || undefined, url: url || undefined, audio: audio?.data, audioName: audio?.name, addedBy: editor }])
    setDraft({ title: '', artist: '', group: '', classId: '', url: '' })
    setAudio(null)
    setError('')
    toast('Brano aggiunto')
  }
  const pickAudio = async (file: File | undefined) => {
    if (!file) return
    // Demo: il file resta nel browser, quindi è limitato a 2 MB (nell'app reale fino a 25 MB, servito dall'API)
    if (file.size > 2 * 1024 * 1024) return setError('Nella demo il file audio può pesare al massimo 2 MB.')
    if (!file.type.startsWith('audio/')) return setError('Scegli un file audio (MP3, M4A, WAV…).')
    setAudio({ data: await readFileAsDataUrl(file), name: file.name })
    setError('')
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Musica · ${event.title}`} description={canListen ? 'Brani della performance: ascoltali per prepararti.' : 'L’ascolto è riservato a chi partecipa alla performance.'}>
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
                {canListen && t.audio && <audio controls preload="none" src={t.audio} className="mt-2 h-9 w-full" aria-label={`Ascolta ${t.title}`} />}
                {canListen && t.url && (
                  <a href={t.url} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs font-semibold text-rosa-intenso">
                    Apri il brano ↗
                  </a>
                )}
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
            <Field label="Collegamento (facoltativo)" htmlFor="trk-url">
              <Input id="trk-url" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="File audio (facoltativo)" htmlFor="trk-audio">
              <Input id="trk-audio" type="file" accept="audio/*" onChange={(e) => pickAudio(e.target.files?.[0])} />
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
          {error && <p className="rounded-2xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <Button size="sm" onClick={add} disabled={!draft.title.trim()}>
            <Plus /> Aggiungi brano
          </Button>
        </div>
      )}
    </Dialog>
  )
}

/**
 * Pulsanti "Musica" e "Partecipanti" per le performance.
 * `editor`: solo l'amministrazione modifica; `viewerId`: allieva che guarda (vede musica e partecipanti solo se partecipa).
 */
export function EventTracksButton({ event, editor, viewerId }: { event: OasiEvent; editor?: 'admin'; viewerId?: string }) {
  const db = useDatabase()
  const [open, setOpen] = useState<'musica' | 'partecipanti' | null>(null)
  if (!isPerformance(event)) return null
  const n = event.tracks?.length ?? 0
  const people = eventParticipants(db, event)
  const canListen = !viewerId || people.some((p) => p.id === viewerId)
  return (
    <>
      {(editor || n > 0) && (
        <Button size="sm" variant="outline" onClick={() => setOpen('musica')}>
          <Music2 /> Musica{n > 0 ? ` (${n})` : ''}
        </Button>
      )}
      {canListen && (
        <Button size="sm" variant="ghost" onClick={() => setOpen('partecipanti')}>
          <Users /> {people.length}
        </Button>
      )}
      {open === 'musica' && <EventTracksDialog event={event} editor={editor} canListen={canListen} onClose={() => setOpen(null)} />}
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
