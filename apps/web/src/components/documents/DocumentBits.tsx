import { Badge } from '@/components/ui/badge'
import type { DocumentState } from '@/services/documents'
import { STATE_META } from './documentUtils'

export function DocumentStateBadge({ state }: { state: DocumentState }) {
  const m = STATE_META[state]
  return (
    <Badge tone={m.tone}>
      <m.icon /> {m.label}
    </Badge>
  )
}
