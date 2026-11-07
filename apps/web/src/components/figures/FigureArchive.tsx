import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, Users, X } from 'lucide-react'
import type { Discipline, Figure, LearningStatus, Level } from '@/types'
import { Segmented } from '@/components/ui/segmented'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/common/EmptyState'
import { DisciplineIcon } from '@/components/common/badges'
import { STATUS_STYLE } from '@/lib/statusStyle'
import { useDatabase } from '@/hooks/useDatabase'
import { figureStatus, findTeacher } from '@/services/selectors'
import { DISCIPLINE_LABEL, DISCIPLINES, LEVEL_LABEL, LEVELS, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { cn, normalize } from '@/lib/utils'
import { FigureCard } from './FigureCard'

interface FigureArchiveProps {
  basePath: string
  /** Se presente mostra e filtra per stato di apprendimento personale */
  studentId?: string
  /** Allieve di riferimento per mostrare quante lavorano sulla figura (area insegnante) */
  studentIdsForStats?: string[]
  emptyAction?: ReactNode
}

type DisciplineFilter = 'tutte' | Discipline

function Chip({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-rosa',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function FigureArchive({ basePath, studentId, studentIdsForStats, emptyAction }: FigureArchiveProps) {
  const db = useDatabase()
  const [params, setParams] = useSearchParams()
  const discipline = (params.get('disciplina') as DisciplineFilter) ?? 'tutte'
  const level = (params.get('livello') as Level | null) ?? null
  const status = (params.get('stato') as LearningStatus | null) ?? null
  const query = params.get('q') ?? ''

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return db.figures.filter((f) => {
      if (discipline !== 'tutte' && f.discipline !== discipline) return false
      if (level && f.level !== level) return false
      if (studentId && status && figureStatus(db, studentId, f.id) !== status) return false
      if (q) {
        const teacher = findTeacher(db, f.teacherId)
        const haystack = normalize([f.name, f.description, ...f.prerequisites, teacher?.firstName ?? '', LEVEL_LABEL[f.level]].join(' '))
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [db, discipline, level, status, query, studentId])

  const counts = useMemo(
    () => ({
      tutte: db.figures.length,
      cerchio: db.figures.filter((f) => f.discipline === 'cerchio').length,
      tessuti: db.figures.filter((f) => f.discipline === 'tessuti').length,
    }),
    [db.figures],
  )

  const groups: { discipline: Discipline; figures: Figure[] }[] = DISCIPLINES.map((d) => ({
    discipline: d,
    figures: filtered.filter((f) => f.discipline === d).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || a.difficulty - b.difficulty),
  })).filter((g) => g.figures.length > 0)

  const hasFilters = !!(level || status || query)

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-4 mb-5 space-y-3 bg-cipria-50/90 px-4 pt-1 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setParam('q', e.target.value || null)}
              placeholder="Cerca una figura, un prerequisito…"
              className="pl-11"
              aria-label="Cerca figure"
            />
          </div>
          <Segmented<DisciplineFilter>
            value={discipline}
            onChange={(v) => setParam('disciplina', v === 'tutte' ? null : v)}
            options={[
              { value: 'tutte', label: 'Tutte', count: counts.tutte },
              { value: 'cerchio', label: 'Cerchio', count: counts.cerchio },
              { value: 'tessuti', label: 'Tessuti', count: counts.tessuti },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          <SlidersHorizontal className="size-4 shrink-0 text-ink-muted" />
          {LEVELS.map((l) => (
            <Chip key={l} active={level === l} onClick={() => setParam('livello', level === l ? null : l)}>
              {LEVEL_LABEL[l]}
            </Chip>
          ))}
          {studentId && (
            <>
              <span className="mx-1 h-5 w-px shrink-0 bg-line" />
              {STATUS_ORDER.map((s) => (
                <Chip key={s} active={status === s} onClick={() => setParam('stato', status === s ? null : s)}>
                  <span className={cn('size-1.5 rounded-full', status === s ? 'bg-white' : STATUS_STYLE[s].dot)} />
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </>
          )}
          {hasFilters && (
            <button type="button" onClick={() => setParams(discipline === 'tutte' ? {} : { disciplina: discipline }, { replace: true })} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-rosa-intenso hover:bg-cipria">
              <X className="size-3.5" /> Azzera
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Nessuna figura trovata" description="Prova a modificare i filtri o la ricerca." action={emptyAction} />
      ) : (
        <div className="space-y-9">
          {groups.map((g) => (
            <section key={g.discipline}>
              <div className="mb-3.5 flex items-center gap-2.5">
                <span className={cn('grid size-8 place-items-center rounded-full text-white', g.discipline === 'cerchio' ? 'bg-cerchio' : 'bg-tessuti')}>
                  <DisciplineIcon discipline={g.discipline} className="size-4" />
                </span>
                <h2 className="text-lg font-bold text-ink">{DISCIPLINE_LABEL[g.discipline]}</h2>
                <span className="text-sm text-ink-muted">· {g.figures.length} figure</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
                {g.figures.map((f, i) => {
                  const working = studentIdsForStats?.filter((sid) => figureStatus(db, sid, f.id) === 'in_progetto').length
                  return (
                    <div key={f.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                      <FigureCard
                        figure={f}
                        to={`${basePath}/${f.id}`}
                        status={studentId ? figureStatus(db, studentId, f.id) : undefined}
                        meta={
                          studentIdsForStats ? (
                            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
                              <Users className="size-3.5 text-rosa-intenso" /> {working} in progetto
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
