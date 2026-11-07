/** Profondità della navigazione interna all'app (funziona anche con il router in memoria) */
let depth = 0
let lastKey: string | null = null

export function trackNavigation(type: 'PUSH' | 'POP' | 'REPLACE', key: string) {
  if (key === lastKey) return
  lastKey = key
  if (type === 'PUSH') depth++
  else if (type === 'POP') depth = Math.max(0, depth - 1)
}

export function canGoBackInApp() {
  return depth > 0
}
