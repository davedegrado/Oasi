import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Link2 } from 'lucide-react'
import type { Figure } from '@/types'
import { DifficultyDots, DisciplineBadge, LevelBadge } from '@/components/common/badges'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { useDatabase } from '@/hooks/useDatabase'
import { findTeacher } from '@/services/selectors'
import { formatDate } from '@/lib/dates'
import { fullName, normalize } from '@/lib/utils'
import { StepGallery } from './StepGallery'

interface FigureDetailViewProps {
  figure: Figure
  backTo: string
  linkBase: string
  panel?: ReactNode
  actions?: ReactNode
}

export function FigureDetailView({ figure, backTo, linkBase, panel, actions }: FigureDetailViewProps) {
  const db = useDatabase()
  const teacher = findTeacher(db, figure.teacherId)

  const prerequisiteLink = (text: string) => {
    const match = db.figures.find((f) => f.id !== figure.id && normalize(text).includes(normalize(f.name)))
    return match ? `${linkBase}/${match.id}` : null
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3 text-sm font-semibold text-ink-soft transition hover:text-rosa-intenso">
          <ArrowLeft className="size-4" /> Archivio figure
        </Link>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <StepGallery steps={figure.steps} name={figure.name} />
          <p className="mt-2 text-center text-[11px] text-ink-muted">Fotografie dimostrative · scorri per vedere tutti i passaggi</p>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DisciplineBadge discipline={figure.discipline} />
              <LevelBadge level={figure.level} />
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-ink-soft shadow-soft">
                Difficoltà <DifficultyDots value={figure.difficulty} />
              </span>
            </div>
            <h1 className="mt-3 text-[32px] leading-tight font-extrabold text-ink sm:text-4xl">{figure.name}</h1>
            {teacher && (
              <div className="mt-3 flex items-center gap-2.5">
                <Avatar person={teacher} size="sm" />
                <div className="text-sm">
                  <p className="font-semibold text-ink">{fullName(teacher)}</p>
                  <p className="text-xs text-ink-muted">Inserita il {formatDate(figure.createdAt, { year: true })}</p>
                </div>
              </div>
            )}
          </div>

          {panel}

          <Card>
            <CardContent className="space-y-6">
              <section>
                <h2 className="mb-2 text-base font-bold text-ink">Descrizione tecnica</h2>
                <p className="text-[15px] leading-relaxed text-ink-soft">{figure.description}</p>
              </section>
              {figure.attentionPoints.length > 0 && (
                <section>
                  <h2 className="mb-2.5 text-base font-bold text-ink">Punti di attenzione</h2>
                  <ul className="space-y-2">
                    {figure.attentionPoints.map((p) => (
                      <li key={p} className="flex gap-2.5 text-[15px] text-ink-soft">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-rosa-intenso" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {figure.prerequisites.length > 0 && (
                <section>
                  <h2 className="mb-2.5 text-base font-bold text-ink">Prerequisiti</h2>
                  <div className="flex flex-wrap gap-2">
                    {figure.prerequisites.map((p) => {
                      const to = prerequisiteLink(p)
                      return to ? (
                        <Link key={p} to={to} className="inline-flex items-center gap-1.5 rounded-full bg-cipria px-3 py-1.5 text-sm font-semibold text-rosa-scuro transition hover:bg-rosa/40">
                          <Link2 className="size-3.5" /> {p}
                        </Link>
                      ) : (
                        <span key={p} className="inline-flex items-center gap-1.5 rounded-full bg-cipria-100 px-3 py-1.5 text-sm text-ink-soft">
                          <CheckCircle2 className="size-3.5 text-ok" /> {p}
                        </span>
                      )
                    })}
                  </div>
                </section>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
