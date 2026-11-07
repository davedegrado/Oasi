import type { RequestStatus } from '@/types'
import { Badge } from '@/components/ui/badge'
import { REQUEST_STATUS_LABEL } from '@/lib/labels'

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const tone = status === 'approvata' ? 'ok' : status === 'rifiutata' ? 'danger' : 'warn'
  return <Badge tone={tone}>{REQUEST_STATUS_LABEL[status]}</Badge>
}
