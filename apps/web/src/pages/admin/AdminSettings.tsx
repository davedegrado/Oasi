import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Building2, Database, Sparkles, Download, Mail, MapPin, Pencil, Phone, RotateCcw, Globe } from 'lucide-react'
import type { AssociationInfo } from '@/types'
import { PageHeader } from '@/components/common/PageHeader'
import { ClosuresManager } from '@/components/closures/ClosuresManager'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { DisciplineBadge, IconByName } from '@/components/common/badges'
import { Segmented } from '@/components/ui/segmented'
import { GeneralCalendar } from '@/components/management/GeneralCalendar'
import { DisciplinesManager } from '@/components/management/DisciplinesManager'
import { buttonVariants } from '@/components/ui/button-variants'
import { softColor, useDisciplines } from '@/hooks/useDisciplines'
import { useDatabase, useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { studentsOfTeacher } from '@/services/selectors'
import { LEVEL_LABEL, LEVELS } from '@/lib/labels'
import { cn, fullName } from '@/lib/utils'

const SETTINGS_META: { key: keyof AssociationInfo['settings']; label: string; description: string; type: 'toggle' | 'number'; suffix?: string }[] = [
  { key: 'remindersEnabled', label: 'Promemoria lezioni', description: 'Notifica alle allieve il giorno prima della lezione (simulato)', type: 'toggle' },
  { key: 'progressVisibleToTeachers', label: 'Progressi visibili alle insegnanti', description: 'Le insegnanti vedono stati e note delle allieve', type: 'toggle' },
  { key: 'trialLessonEnabled', label: 'Lezione di prova', description: 'Consente iscrizioni in stato “Lezione di prova”', type: 'toggle' },
  { key: 'maxStudentsPerClass', label: 'Capienza standard per classe', description: 'Valore predefinito per le nuove classi', type: 'number', suffix: 'allieve' },
  { key: 'absenceNoticeHours', label: 'Preavviso assenze', description: 'Ore minime per comunicare un’assenza', type: 'number', suffix: 'ore' },
]

type Section = 'calendario' | 'discipline' | 'didattica' | 'associazione'

/** Didattica: l'archivio delle figure appartiene qui, non all'archivio documentale */
function DidacticsCard() {
  const db = useDatabase()
  const disciplines = useDisciplines()
  return (
    <Card>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="size-4 text-rosa-intenso" /> Archivio figure
            </h2>
            <p className="text-sm text-ink-muted">Sequenze fotografiche, livelli e note tecniche per ogni disciplina.</p>
          </div>
          <Link to="/admin/figure" className={buttonVariants({ size: 'sm' })}>
            Apri l’archivio figure <ArrowRight />
          </Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {disciplines.list.filter((d) => d.hasFigureArchive).map((d) => (
            <div key={d.id} className="rounded-3xl p-4" style={{ background: softColor(d.color) }}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full text-white" style={{ background: d.color }}>
                  <IconByName name={d.icon} className="size-5" />
                </span>
                <div>
                  <p className="font-display font-bold">{d.name}</p>
                  <p className="text-xs text-ink-soft">{db.figures.filter((f) => f.discipline === d.id).length} figure in archivio</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {LEVELS.map((l) => (
                  <span key={l} className="rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
                    {LEVEL_LABEL[l]} · {db.figures.filter((f) => f.discipline === d.id && f.level === l).length}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function AdminSettings() {
  const db = useDatabase()
  const repo = useRepository()
  const { toast } = useToast()
  const [editInfo, setEditInfo] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [params, setParams] = useSearchParams()
  const section = (params.get('sezione') as Section) || 'calendario'
  const a = db.association

  const updateSetting = async (key: keyof AssociationInfo['settings'], value: boolean | number) => {
    await repo.updateAssociation({ settings: { ...a.settings, [key]: value } })
    toast('Configurazione salvata')
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `oasi-demo-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast('Esportazione completata')
  }

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader eyebrow="Gestione" title="Gestione della palestra" description="Calendario generale e chiusure, discipline, didattica e configurazione dell’associazione." />
      <Segmented<Section>
        value={section}
        onChange={(v) => setParams({ sezione: v }, { replace: true })}
        options={[
          { value: 'calendario', label: 'Calendario' },
          { value: 'discipline', label: 'Discipline' },
          { value: 'didattica', label: 'Didattica' },
          { value: 'associazione', label: 'Associazione' },
        ]}
      />

      {section === 'calendario' && (
        <>
          <GeneralCalendar />
          <div id="chiusure" className="scroll-mt-24">
            <ClosuresManager />
          </div>
        </>
      )}
      {section === 'discipline' && <DisciplinesManager />}
      {section === 'didattica' && <DidacticsCard />}
      {section === 'associazione' && (
      <>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-cipria to-cipria-50 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-white text-rosa-intenso shadow-soft">
                <Building2 className="size-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold">{a.name}</h2>
                <p className="text-sm text-ink-soft">{a.legalForm}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditInfo(true)}>
              <Pencil /> Modifica
            </Button>
          </div>
        </div>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <p className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-rosa-intenso" /> {a.address}
          </p>
          <p className="flex items-start gap-2.5">
            <Mail className="mt-0.5 size-4 shrink-0 text-rosa-intenso" /> {a.email}
          </p>
          <p className="flex items-start gap-2.5">
            <Phone className="mt-0.5 size-4 shrink-0 text-rosa-intenso" /> {a.phone}
          </p>
          <p className="flex items-start gap-2.5">
            <Globe className="mt-0.5 size-4 shrink-0 text-rosa-intenso" />
            <a href={a.website} target="_blank" rel="noreferrer" className="break-all text-rosa-scuro underline-offset-2 hover:underline">
              {a.website.replace('https://', '')}
            </a>
          </p>
          <p className="text-ink-muted sm:col-span-2">
            {a.affiliation} · Stagione sportiva {a.season} · Sale: {a.rooms.join(', ')}
          </p>
        </CardContent>
      </Card>

      <div>
        <Card>
          <CardContent>
            <h2 className="mb-4 text-base font-bold">Insegnanti</h2>
            <ul className="space-y-3">
              {db.teachers.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-cipria-50 p-3">
                  <Avatar person={t} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{fullName(t)}</p>
                    <p className="text-xs text-ink-muted">
                      {db.classes.filter((c) => c.teacherId === t.id).length} classi · {studentsOfTeacher(db, t.id).length} allieve · dal {t.since}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {t.disciplines.map((d) => (
                      <DisciplineBadge key={d} discipline={d} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

      </div>

      <Card>
        <CardContent>
          <h2 className="mb-1 text-base font-bold">Configurazioni generali</h2>
          <p className="mb-4 text-sm text-ink-muted">Impostazioni dimostrative salvate in locale.</p>
          <ul className="divide-y divide-line/70">
            {SETTINGS_META.map((s) => {
              const value = a.settings[s.key]
              return (
                <li key={s.key} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{s.label}</p>
                    <p className="text-sm text-ink-muted">{s.description}</p>
                  </div>
                  {s.type === 'toggle' ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!value}
                      aria-label={s.label}
                      onClick={() => updateSetting(s.key, !value)}
                      className={cn('relative h-7 w-12 shrink-0 rounded-full transition', value ? 'bg-rosa-intenso' : 'bg-line')}
                    >
                      <span className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', value ? 'left-6' : 'left-1')} />
                    </button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="h-10 w-20 text-center"
                        defaultValue={value as number}
                        aria-label={s.label}
                        onBlur={(e) => {
                          const n = Math.max(1, Number(e.target.value) || 1)
                          if (n !== value) updateSetting(s.key, n)
                        }}
                      />
                      <span className="hidden text-xs text-ink-muted sm:inline">{s.suffix}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-1 flex items-center gap-2 text-base font-bold">
            <Database className="size-4 text-rosa-intenso" /> Dati della demo
          </h2>
          <p className="mb-4 text-sm text-ink-muted">I dati sono salvati nel browser (localStorage). Il livello dati è predisposto per un futuro collegamento a un database remoto.</p>
          <div className="flex flex-wrap gap-2">
            {import.meta.env.VITE_ROUTER !== 'memory' && (
              <Button variant="outline" onClick={exportData}>
                <Download /> Esporta JSON
              </Button>
            )}
            {confirmReset ? (
              <>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await repo.reset()
                    setConfirmReset(false)
                    toast('Dati demo ripristinati')
                  }}
                >
                  Conferma ripristino
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Annulla
                </Button>
              </>
            ) : (
              <Button variant="danger" onClick={() => setConfirmReset(true)}>
                <RotateCcw /> Ripristina dati iniziali
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      </>
      )}

      {editInfo && <InfoDialog info={a} onClose={() => setEditInfo(false)} />}
    </div>
  )
}

function InfoDialog({ info, onClose }: { info: AssociationInfo; onClose: () => void }) {
  const repo = useRepository()
  const { toast } = useToast()
  const [form, setForm] = useState(info)
  const fields: { key: 'name' | 'legalForm' | 'affiliation' | 'address' | 'email' | 'phone' | 'website' | 'season'; label: string }[] = [
    { key: 'name', label: 'Nome' },
    { key: 'legalForm', label: 'Forma giuridica' },
    { key: 'affiliation', label: 'Affiliazione' },
    { key: 'address', label: 'Indirizzo' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefono' },
    { key: 'website', label: 'Sito web' },
    { key: 'season', label: 'Stagione sportiva' },
  ]
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Informazioni associazione"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={async () => {
              await repo.updateAssociation(form)
              toast('Informazioni aggiornate')
              onClose()
            }}
          >
            Salva
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`a-${f.key}`} className={f.key === 'legalForm' || f.key === 'address' ? 'sm:col-span-2' : undefined}>
            <Input id={`a-${f.key}`} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Dialog>
  )
}
