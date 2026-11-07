import type { OasiEvent } from '@/types'
import { todayISO } from '@/lib/dates'

export function eventSignupState(event: OasiEvent, studentId: string) {
  const joined = event.participantIds.includes(studentId)
  const closed = !!event.signupDeadline && event.signupDeadline < todayISO()
  const full = event.participantIds.length >= event.capacity
  return { joined, closed, full }
}
