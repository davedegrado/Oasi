const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab']
const MONTHS_LONG = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** Data locale in formato YYYY-MM-DD */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

/** 1 = lunedì ... 7 = domenica */
export function isoWeekday(iso: string): number {
  const wd = parseISODate(iso).getDay()
  return wd === 0 ? 7 : wd
}

export function startOfWeek(iso: string): string {
  return addDays(iso, 1 - isoWeekday(iso))
}

export function weekDays(iso: string): string[] {
  const start = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS_LONG[weekday % 7]
}

export function formatDayShort(iso: string): string {
  return WEEKDAYS_SHORT[parseISODate(iso).getDay()]
}

export function formatDate(iso: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseISODate(iso)
  const parts = [`${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`]
  if (opts.year) parts.push(String(d.getFullYear()))
  const base = parts.join(' ')
  return opts.weekday ? `${WEEKDAYS_LONG[d.getDay()]} ${base}` : base
}

export function formatDateShort(iso: string): string {
  const d = parseISODate(iso)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export function monthShort(iso: string): string {
  return MONTHS_SHORT[parseISODate(iso).getMonth()]
}

export function dayNumber(iso: string): number {
  return parseISODate(iso).getDate()
}

export function relativeDayLabel(iso: string): string {
  const diff = Math.round((parseISODate(iso).getTime() - parseISODate(todayISO()).getTime()) / 86400000)
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Domani'
  if (diff === -1) return 'Ieri'
  if (diff > 1 && diff < 7) return `Tra ${diff} giorni`
  if (diff < -1 && diff > -7) return `${-diff} giorni fa`
  return formatDate(iso)
}

export function compareDateTime(a: { date: string; startTime: string }, b: { date: string; startTime: string }) {
  return `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
}

export function isPast(date: string, time = '23:59'): boolean {
  return new Date(`${date}T${time}:00`).getTime() < Date.now()
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

export function ageFrom(birthISO: string): number {
  const b = parseISODate(birthISO)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--
  return age
}
