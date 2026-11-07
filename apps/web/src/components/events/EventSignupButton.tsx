import type { OasiEvent } from '@/types'
import { Button } from '@/components/ui/button'
import { useRepository } from '@/hooks/useDatabase'
import { useToast } from '@/hooks/useToast'
import { eventSignupState } from './signupState'

/** Adesione all'evento con controllo di scadenza e capienza */
export function EventSignupButton({ event, studentId }: { event: OasiEvent; studentId: string }) {
  const repo = useRepository()
  const { toast } = useToast()
  const { joined, closed, full } = eventSignupState(event, studentId)
  if (joined)
    return (
      <Button
        size="sm"
        variant="soft"
        disabled={closed}
        onClick={async () => {
          await repo.toggleEventParticipation(event.id, studentId)
          toast('Adesione annullata', 'info')
        }}
      >
        ✓ Partecipo{closed ? '' : ' · annulla'}
      </Button>
    )
  return (
    <Button
      size="sm"
      disabled={closed || full}
      onClick={async () => {
        await repo.toggleEventParticipation(event.id, studentId)
        toast('Adesione confermata!')
      }}
    >
      {closed ? 'Iscrizioni chiuse' : full ? 'Posti esauriti' : 'Partecipo'}
    </Button>
  )
}
