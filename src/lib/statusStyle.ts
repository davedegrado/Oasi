import type { LearningStatus } from '@/types'

export const STATUS_STYLE: Record<LearningStatus, { tone: 'neutral' | 'warn' | 'ok' | 'tessuti'; dot: string; bg: string; text: string }> = {
  da_imparare: { tone: 'neutral', dot: 'bg-ink-muted/50', bg: 'bg-cipria-100', text: 'text-ink-soft' },
  in_apprendimento: { tone: 'warn', dot: 'bg-warn', bg: 'bg-warn-soft', text: 'text-warn' },
  in_progetto: { tone: 'tessuti', dot: 'bg-tessuti', bg: 'bg-tessuti-soft', text: 'text-tessuti' },
  riuscita: { tone: 'ok', dot: 'bg-ok', bg: 'bg-ok-soft', text: 'text-ok' },
}

export const STATUS_COLOR: Record<LearningStatus, string> = {
  da_imparare: '#E8DCE2',
  in_apprendimento: '#C98A3D',
  in_progetto: '#8A7BB8',
  riuscita: '#4F9C84',
}
