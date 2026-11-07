import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Role } from '@/types'
import { useDemo } from '@/hooks/useDemo'
import { ROLE_HOME } from '@/context/demo-context'

/** Le aree sono accessibili solo nel ruolo demo corrispondente */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { persona } = useDemo()
  if (!persona) return <Navigate to="/" replace />
  if (persona.role !== role) return <Navigate to={ROLE_HOME[persona.role]} replace />
  return <>{children}</>
}
