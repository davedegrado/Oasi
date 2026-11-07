import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowUp, ImagePlus, Star, Trash2, Upload } from 'lucide-react'
import type { Discipline, Figure, FigureStep, Level } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { ListEditor } from '@/components/common/ListEditor'
import { EmptyState } from '@/components/common/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Segmented } from '@/components/ui/segmented'
import { Dialog } from '@/components/ui/dialog'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useDemo } from '@/hooks/useDemo'
import { useToast } from '@/hooks/useToast'
import { getPhotoLibrary } from '@/services/media'
import { findFigure } from '@/services/selectors'
import { compressImage } from '@/lib/image'
import { LEVEL_LABEL, LEVELS } from '@/lib/labels'
import { todayISO } from '@/lib/dates'
import { cn, fullName, uid } from '@/lib/utils'

function emptyFigure(teacherId: string): Figure {
  return {
    id: uid('fig'),
    name: '',
    discipline: 'cerchio',
    level: 'base',
    difficulty: 2,
    teacherId,
    cover: '',
    steps: [],
    description: '',
    attentionPoints: [],
    prerequisites: [],
    createdAt: todayISO(),
  }
}

export function FigureEditorPage({ basePath }: { basePath: string }) {
  const { id } = useParams()
  const db = useDatabase()
  const repo = useRepository()
  const { persona } = useDemo()
  const { toast } = useToast()
  const navigate = useNavigate()
  const existing = id ? findFigure(db, id) : undefined
  const isTeacher = persona?.role === 'insegnante'
  const [figure, setFigure] = useState<Figure>(() => (existing ? structuredClone(existing) : emptyFigure(isTeacher && persona?.userId ? persona.userId : db.teachers[0].id)))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (id && !existing) {
    return <EmptyState title="Figura non trovata" action={<Link to={basePath}>Torna all’archivio</Link>} />
  }

  const set = <K extends keyof Figure>(key: K, value: Figure[K]) => setFigure((f) => ({ ...f, [key]: value }))

  const addSteps = (images: string[]) => {
    setFigure((f) => {
      const steps: FigureStep[] = [...f.steps, ...images.map((image) => ({ id: uid('step'), image, caption: '' }))]
      return { ...f, steps, cover: f.cover || steps[0]?.image || '' }
    })
  }

  const moveStep = (index: number, dir: -1 | 1) => {
    setFigure((f) => {
      const steps = [...f.steps]
      const target = index + dir
      if (target < 0 || target >= steps.length) return f
      ;[steps[index], steps[target]] = [steps[target], steps[index]]
      return { ...f, steps }
    })
  }

  const removeStep = (stepId: string) => {
    setFigure((f) => {
      const removed = f.steps.find((s) => s.id === stepId)
      const steps = f.steps.filter((s) => s.id !== stepId)
      return { ...f, steps, cover: removed && f.cover === removed.image ? (steps[0]?.image ?? '') : f.cover }
    })
  }

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      const images = await Promise.all(Array.from(files).slice(0, 6).map((file) => compressImage(file)))
      addSteps(images)
      setPickerOpen(false)
      toast(`${images.length} immagine${images.length > 1 ? 'i' : ''} caricata${images.length > 1 ? 'e' : ''} (simulazione locale)`)
    } catch {
      toast('Impossibile leggere l’immagine', 'info')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async () => {
    const problems: string[] = []
    if (!figure.name.trim()) problems.push('Inserisci il nome della figura')
    if (figure.steps.length === 0) problems.push('Aggiungi almeno un’immagine alla sequenza')
    if (!figure.description.trim()) problems.push('Inserisci una descrizione tecnica')
    setErrors(problems)
    if (problems.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const toSave: Figure = {
      ...figure,
      name: figure.name.trim(),
      description: figure.description.trim(),
      steps: figure.steps.map((s, i) => ({ ...s, caption: s.caption.trim() || `Passaggio ${i + 1}` })),
      cover: figure.cover || figure.steps[0].image,
    }
    await repo.saveFigure(toSave)
    toast(existing ? 'Figura aggiornata' : 'Nuova figura aggiunta all’archivio')
    navigate(`${basePath}/${toSave.id}`)
  }

  const remove = async () => {
    if (!existing) return
    await repo.deleteFigure(existing.id)
    toast('Figura eliminata')
    navigate(basePath)
  }

  const library = getPhotoLibrary(figure.discipline)

  return (
    <div className="animate-fade-up">
      <Link to={existing ? `${basePath}/${existing.id}` : basePath} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft hover:text-rosa-intenso">
        <ArrowLeft className="size-4" /> {existing ? 'Torna alla figura' : 'Archivio figure'}
      </Link>
      <PageHeader eyebrow={existing ? 'Modifica figura' : 'Nuova figura'} title={existing ? existing.name : 'Aggiungi una figura'} description="Le modifiche sono salvate solo su questo dispositivo (demo)." />

      {errors.length > 0 && (
        <div className="mb-5 rounded-3xl bg-danger-soft p-4 text-sm text-danger" role="alert">
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-5">
            <h2 className="text-base font-bold">Informazioni</h2>
            <Field label="Nome della figura" htmlFor="fig-name">
              <Input id="fig-name" value={figure.name} onChange={(e) => set('name', e.target.value)} placeholder="Es. Star Drop" />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-soft">Disciplina</p>
              <Segmented<Discipline>
                value={figure.discipline}
                onChange={(v) => set('discipline', v)}
                options={[
                  { value: 'cerchio', label: 'Cerchio aereo' },
                  { value: 'tessuti', label: 'Tessuti aerei' },
                ]}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Livello" htmlFor="fig-level">
                <Select id="fig-level" value={figure.level} onChange={(e) => set('level', e.target.value as Level)}>
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Insegnante di riferimento" htmlFor="fig-teacher">
                <Select id="fig-teacher" value={figure.teacherId} onChange={(e) => set('teacherId', e.target.value)}>
                  {db.teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fullName(t)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold text-ink-soft">Difficoltà</p>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('difficulty', d)}
                    aria-pressed={figure.difficulty === d}
                    className={cn(
                      'grid size-11 place-items-center rounded-full border font-display font-bold transition',
                      d <= figure.difficulty ? 'border-rosa-intenso bg-rosa-intenso text-white' : 'border-line bg-white text-ink-muted hover:border-rosa',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Descrizione tecnica" htmlFor="fig-desc">
              <Textarea id="fig-desc" rows={5} value={figure.description} onChange={(e) => set('description', e.target.value)} placeholder="Come si entra, cosa la sostiene, come si esce…" />
            </Field>
            <Field label="Punti di attenzione" htmlFor="fig-attention">
              <ListEditor id="fig-attention" items={figure.attentionPoints} onChange={(v) => set('attentionPoints', v)} placeholder="Aggiungi un punto e premi invio" />
            </Field>
            <Field label="Prerequisiti" htmlFor="fig-prereq" hint="Scrivi il nome di una figura dell’archivio per creare un collegamento.">
              <ListEditor
                id="fig-prereq"
                items={figure.prerequisites}
                onChange={(v) => set('prerequisites', v)}
                placeholder="Es. Hip Key"
                suggestions={db.figures.filter((f) => f.id !== figure.id).map((f) => f.name)}
              />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardContent>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold">Sequenza fotografica</h2>
                  <p className="text-sm text-ink-muted">{figure.steps.length} passaggi · ordina, descrivi e scegli la copertina</p>
                </div>
                <Button size="sm" variant="soft" onClick={() => setPickerOpen(true)}>
                  <ImagePlus /> Aggiungi
                </Button>
              </div>
              {figure.steps.length === 0 ? (
                <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-rosa/50 bg-cipria-50 py-10 text-sm font-semibold text-rosa-scuro transition hover:bg-cipria-100">
                  <ImagePlus className="size-7" /> Aggiungi la prima immagine
                </button>
              ) : (
                <ol className="space-y-3">
                  {figure.steps.map((step, i) => (
                    <li key={step.id} className="flex gap-3 rounded-3xl border border-line/80 bg-cipria-50/60 p-2.5">
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl sm:size-24">
                        <img src={step.image} alt="" className="size-full object-cover" />
                        <span className="absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-ink">{i + 1}</span>
                        {figure.cover === step.image && (
                          <span className="absolute right-1.5 bottom-1.5 grid size-6 place-items-center rounded-full bg-rosa-intenso text-white" title="Copertina">
                            <Star className="size-3.5 fill-current" />
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Input
                          value={step.caption}
                          onChange={(e) => set('steps', figure.steps.map((s) => (s.id === step.id ? { ...s, caption: e.target.value } : s)))}
                          placeholder={`Descrizione passaggio ${i + 1}`}
                          aria-label={`Descrizione passaggio ${i + 1}`}
                          className="h-10 text-sm"
                        />
                        <div className="flex flex-wrap gap-1">
                          <Button size="icon-sm" variant="outline" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Sposta su">
                            <ArrowUp />
                          </Button>
                          <Button size="icon-sm" variant="outline" onClick={() => moveStep(i, 1)} disabled={i === figure.steps.length - 1} aria-label="Sposta giù">
                            <ArrowDown />
                          </Button>
                          <Button size="sm" variant={figure.cover === step.image ? 'soft' : 'ghost'} className="h-8 px-2.5 text-xs" onClick={() => set('cover', step.image)}>
                            <Star /> Copertina
                          </Button>
                          <Button size="icon-sm" variant="ghost" className="ml-auto text-danger" onClick={() => removeStep(step.id)} aria-label="Rimuovi passaggio">
                            <Trash2 />
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={save} className="flex-1 sm:flex-none">
              {existing ? 'Salva modifiche' : 'Aggiungi all’archivio'}
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate(existing ? `${basePath}/${existing.id}` : basePath)}>
              Annulla
            </Button>
            {existing && (
              <Button size="lg" variant="danger" className="sm:ml-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Elimina
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen} title="Aggiungi immagini" description="Carica una foto dal dispositivo (resta solo in locale) oppure scegli dalla libreria dimostrativa." className="sm:max-w-2xl">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
        <Button variant="dark" className="w-full" onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload /> {uploading ? 'Caricamento…' : 'Carica dal dispositivo'}
        </Button>
        <p className="mt-5 mb-2 text-sm font-semibold text-ink-soft">Libreria demo · {figure.discipline === 'cerchio' ? 'Cerchio aereo' : 'Tessuti aerei'}</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {library.map((src) => {
            const used = figure.steps.some((s) => s.image === src)
            return (
              <button
                key={src}
                type="button"
                onClick={() => {
                  addSteps([src])
                  toast('Immagine aggiunta alla sequenza')
                }}
                className={cn('relative aspect-square overflow-hidden rounded-2xl ring-2 ring-transparent transition hover:ring-rosa-intenso', used && 'ring-rosa')}
              >
                <img src={src} alt="" loading="lazy" className="size-full object-cover" />
                {used && <span className="absolute inset-0 grid place-items-center bg-ink/40 text-xs font-semibold text-white">Già usata</span>}
              </button>
            )
          })}
        </div>
      </Dialog>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminare la figura?"
        description="La figura e i progressi collegati verranno rimossi dalla demo."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
            <Button variant="danger" onClick={remove}>
              <Trash2 /> Elimina
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Puoi sempre ripristinare i dati dimostrativi dal selettore del ruolo.</p>
      </Dialog>
    </div>
  )
}
