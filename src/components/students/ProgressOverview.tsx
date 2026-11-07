import { Link } from 'react-router-dom'
import type { LearningStatus } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Donut, Legend, Ring, StackedBar } from '@/components/common/Charts'
import { DisciplineIcon, StatusBadge } from '@/components/common/badges'
import { STATUS_COLOR } from '@/lib/statusStyle'
import { useDatabase } from '@/hooks/useDatabase'
import { figureStatus, progressSummary } from '@/services/selectors'
import { DISCIPLINE_LABEL, DISCIPLINES, LEVEL_LABEL, LEVELS, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { percent } from '@/lib/utils'

/** Grafici di riepilogo dei progressi di un'allieva */
export function ProgressOverview({ studentId }: { studentId: string }) {
  const db = useDatabase()
  const summary = progressSummary(db, studentId)
  const segments = STATUS_ORDER.slice()
    .reverse()
    .map((s) => ({ label: STATUS_LABEL[s], value: summary.counts[s], color: STATUS_COLOR[s] }))

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardContent>
          <h2 className="text-base font-bold">Completamento archivio</h2>
          <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row lg:flex-col xl:flex-row">
            <Donut segments={segments} size={176} thickness={18}>
              <div>
                <p className="font-display text-4xl font-extrabold text-ink">{summary.completion}%</p>
                <p className="text-xs text-ink-muted">riuscite</p>
              </div>
            </Donut>
            <Legend className="w-full flex-1" items={segments.map((s) => ({ label: s.label, color: s.color, value: s.value }))} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-5">
          <h2 className="text-base font-bold">Distribuzione per disciplina</h2>
          {DISCIPLINES.map((d) => {
            const s = progressSummary(db, studentId, d)
            return (
              <div key={d} className="flex items-center gap-4">
                <Ring value={s.completion} size={58} thickness={6} color={d === 'cerchio' ? '#D66A9B' : '#8A7BB8'}>
                  <DisciplineIcon discipline={d} className={d === 'cerchio' ? 'size-4 text-cerchio' : 'size-4 text-tessuti'} />
                </Ring>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">{DISCIPLINE_LABEL[d]}</p>
                    <p className="text-sm text-ink-muted">
                      <b className="text-ink">{s.counts.riuscita}</b>/{s.total} · {s.completion}%
                    </p>
                  </div>
                  <StackedBar
                    className="mt-2"
                    segments={STATUS_ORDER.slice()
                      .reverse()
                      .map((st) => ({ label: STATUS_LABEL[st], value: s.counts[st], color: STATUS_COLOR[st] }))}
                  />
                </div>
              </div>
            )
          })}
          <div className="border-t border-line pt-4">
            <p className="mb-3 text-sm font-semibold text-ink-soft">Per livello</p>
            <div className="grid grid-cols-3 gap-3">
              {LEVELS.map((l) => {
                const figs = db.figures.filter((f) => f.level === l)
                const done = figs.filter((f) => figureStatus(db, studentId, f.id) === 'riuscita').length
                const pct = percent(done, figs.length)
                return (
                  <div key={l} className="rounded-2xl bg-cipria-50 p-3 text-center">
                    <p className="font-display text-xl font-extrabold">{pct}%</p>
                    <p className="text-xs text-ink-muted">
                      {LEVEL_LABEL[l]} · {done}/{figs.length}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Elenco figure per uno stato */
export function FiguresByStatus({ studentId, status, linkBase, empty }: { studentId: string; status: LearningStatus; linkBase: string; empty?: string }) {
  const db = useDatabase()
  const figures = db.figures.filter((f) => figureStatus(db, studentId, f.id) === status)
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">{STATUS_LABEL[status]}</h2>
          <span className="text-sm text-ink-muted">{figures.length}</span>
        </div>
        {figures.length === 0 ? (
          <p className="text-sm text-ink-muted">{empty ?? 'Nessuna figura'}</p>
        ) : (
          <ul className="space-y-2">
            {figures.map((f) => {
              const note = db.progress[studentId]?.[f.id]?.note
              return (
                <li key={f.id}>
                  <Link to={`${linkBase}/${f.id}`} className="flex items-center gap-3 rounded-2xl p-1 transition hover:bg-cipria-50">
                    <img src={f.cover} alt="" className="size-12 rounded-xl object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.name}</p>
                      <p className="truncate text-xs text-ink-muted">{note ? `“${note}”` : `${DISCIPLINE_LABEL[f.discipline]} · ${LEVEL_LABEL[f.level]}`}</p>
                    </div>
                    <StatusBadge status={status} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
