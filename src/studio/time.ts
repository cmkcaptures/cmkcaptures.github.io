export function parseShootDate(text: string): Date | null {
  if (!text) return null
  const value = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // Browsers read a yearless date like "Aug 14" as 2001.
  if (date.getFullYear() < 2020) date.setFullYear(new Date().getFullYear())
  return date
}

export function countdown(target: Date, now: number): string {
  let s = Math.max(0, Math.floor((target.getTime() - now) / 1000))
  const d = Math.floor(s / 86400)
  s %= 86400
  const h = Math.floor(s / 3600)
  s %= 3600
  const m = Math.floor(s / 60)
  s %= 60
  return `in ${d ? `${d}d ` : ''}${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
