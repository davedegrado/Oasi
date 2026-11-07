import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { trackNavigation } from './navigationDepth'

export function NavigationTracker() {
  const location = useLocation()
  const type = useNavigationType()
  useEffect(() => trackNavigation(type, location.key), [type, location.key])
  return null
}
