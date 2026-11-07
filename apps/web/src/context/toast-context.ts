import { createContext } from 'react'

export interface ToastContextValue {
  toast: (message: string, tone?: 'success' | 'info') => void
}

export const ToastContext = createContext<ToastContextValue>({ toast: () => {} })
