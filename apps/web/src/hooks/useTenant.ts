import { useContext } from 'react'
import { TenantContext } from '@/tenant/tenant-context'

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error('useTenant deve essere usato dentro TenantProvider')
  return ctx
}
