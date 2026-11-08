import { Link } from 'react-router-dom'
import { Images } from 'lucide-react'
import type { Figure, LearningStatus } from '@/types'
import { DifficultyDots, DisciplineIcon, StatusBadge } from '@/components/common/badges'
import { Badge } from '@/components/ui/badge'
import { LEVEL_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { useDisciplines } from '@/hooks/useDisciplines'

interface FigureCardProps {
  figure: Figure
  to: string
  status?: LearningStatus
  meta?: React.ReactNode
  className?: string
}

export function FigureCard({ figure, to, status, meta, className }: FigureCardProps) {
  const disciplines = useDisciplines()
  return (
    <Link
      to={to}
      className={cn(
        'group flex flex-col overflow-hidden rounded-3xl border border-line/70 bg-white shadow-soft transition duration-300 hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-cipria-100">
        <img src={figure.cover} alt={figure.name} loading="lazy" className="size-full object-cover transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <span
          className="absolute top-2.5 left-2.5 grid size-8 place-items-center rounded-full text-white shadow-soft"
          style={{ background: disciplines.get(figure.discipline).color }}
          title={disciplines.get(figure.discipline).name}
        >
          <DisciplineIcon discipline={figure.discipline} className="size-4" />
        </span>
        <Badge tone="white" className="absolute top-2.5 right-2.5">
          <Images /> {figure.steps.length}
        </Badge>
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="font-display text-[17px] leading-tight font-bold text-white drop-shadow-sm">{figure.name}</p>
          <div className="mt-1 flex items-center gap-2 text-xs font-medium text-white/90">
            {LEVEL_LABEL[figure.level]}
            <DifficultyDots value={figure.difficulty} inverted />
          </div>
        </div>
      </div>
      {(status || meta) && (
        <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-2.5">
          {status && <StatusBadge status={status} />}
          {meta}
        </div>
      )}
    </Link>
  )
}
