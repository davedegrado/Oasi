import type { LearningStatus } from '@/types'

export const STATUS_STYLE: Record<LearningStatus, { tone: 'neutral' | 'warn' | 'ok' | 'tessuti'; dot: string; bg: string; text: string }> = {
  da_imparare: { tone: 'neutral', dot: 'bg-ink-muted/50', bg: 'bg-cipria-100', text: 'text-ink-soft' },
  in_progetto: { tone: 'tessuti', dot: 'bg-tessuti', bg: 'bg-tessuti-soft', text: 'text-tessuti' },
  riuscita: { tone: 'ok', dot: 'bg-ok', bg: 'bg-ok-soft', text: 'text-ok' },
}

export const STATUS_COLOR: Record<LearningStatus, string> = {
  // Variabili del tema: i grafici seguono la palette del tenant
  da_imparare: 'var(--color-line)',
  in_progetto: 'var(--color-tessuti)',
  riuscita: 'var(--color-ok)',
}
