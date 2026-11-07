import { Circle, Wind } from 'lucide-react'
import type { Discipline, LearningStatus, Level, MembershipStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { DISCIPLINE_SHORT, LEVEL_LABEL, MEMBERSHIP_LABEL, STATUS_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { STATUS_STYLE } from '@/lib/statusStyle'

export function DisciplineIcon({ discipline, className }: { discipline: Discipline; className?: string }) {
  return discipline === 'cerchio' ? <Circle className={className} strokeWidth={2.4} /> : <Wind className={className} />
}

export function DisciplineBadge({ discipline, className }: { discipline: Discipline; className?: string }) {
  return (
    <Badge tone={discipline} className={className}>
      <DisciplineIcon discipline={discipline} />
      {DISCIPLINE_SHORT[discipline]}
    </Badge>
  )
}

export function LevelBadge({ level, className }: { level: Level; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      {LEVEL_LABEL[level]}
    </Badge>
  )
}

export function StatusBadge({ status, className }: { status: LearningStatus; className?: string }) {
  return (
    <Badge tone={STATUS_STYLE[status].tone} className={className}>
      <span className={cn('size-1.5 rounded-full', STATUS_STYLE[status].dot)} />
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function MembershipBadge({ status }: { status: MembershipStatus }) {
  const tone = status === 'attiva' ? 'ok' : status === 'in_scadenza' ? 'warn' : status === 'sospesa' ? 'danger' : 'rosa'
  return <Badge tone={tone}>{MEMBERSHIP_LABEL[status]}</Badge>
}

export function DifficultyDots({ value, className, inverted }: { value: number; className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`Difficoltà ${value} su 5`} title={`Difficoltà ${value}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={cn('size-1.5 rounded-full', i < value ? (inverted ? 'bg-white' : 'bg-rosa-intenso') : inverted ? 'bg-white/35' : 'bg-line')} />
      ))}
    </span>
  )
}
