import { Circle, Dumbbell, Flower2, Music, Sparkles, Star, Wind } from 'lucide-react'
import type { Discipline, DisciplineIconName, LearningStatus, Level, MembershipStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { LEVEL_LABEL, MEMBERSHIP_LABEL, STATUS_LABEL } from '@/lib/labels'
import { softColor, useDisciplines } from '@/hooks/useDisciplines'
import { cn } from '@/lib/utils'
import { STATUS_STYLE } from '@/lib/statusStyle'

const ICONS: Record<DisciplineIconName, typeof Circle> = { circle: Circle, wind: Wind, sparkles: Sparkles, music: Music, flower: Flower2, dumbbell: Dumbbell, star: Star }

export function IconByName({ name, className }: { name: DisciplineIconName; className?: string }) {
  const Icon = ICONS[name] ?? Star
  return <Icon className={className} strokeWidth={name === 'circle' ? 2.4 : 2} />
}

export function DisciplineIcon({ discipline, className }: { discipline: Discipline; className?: string }) {
  const { get } = useDisciplines()
  return <IconByName name={get(discipline).icon} className={className} />
}

/** Pallino colorato o striscia con il colore della disciplina */
export function DisciplineDot({ discipline, className }: { discipline: Discipline; className?: string }) {
  const { get } = useDisciplines()
  return <span className={cn('inline-block rounded-full', className)} style={{ background: get(discipline).color }} />
}

export function DisciplineBadge({ discipline, className }: { discipline: Discipline; className?: string }) {
  const { get } = useDisciplines()
  const d = get(discipline)
  return (
    <Badge className={className} style={{ background: softColor(d.color), color: d.color }}>
      <IconByName name={d.icon} />
      {d.shortName}
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
