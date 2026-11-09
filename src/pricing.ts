// Shared quick pricing, in line with the Price it tool.
import type { Client } from './types'
import { formatMoney, parseMoney } from './invoiceTypes'
import { parseShootDate } from './studio/time'

export function quickPrice(type: string, dateISO: string, hours: number | null, clients: Client[], lateNight = false): { price: number; why: string } {
  const t = type.toLowerCase()
  const [base, perHour, label] = /portrait|headshot/.test(t) ? [90, 40, 'portrait'] : /brand|content|commercial/.test(t) ? [220, 65, 'brand'] : /concert|live|artist|gig/.test(t) ? [120, 45, 'live set'] : /birthday|private|wedding|party/.test(t) ? [170, 50, 'private event'] : [150, 45, 'club/event']
  const h = hours ?? (/portrait/.test(t) ? 1.5 : 3)
  let price = base + Math.max(0, h - 2) * perHour
  const day = dateISO ? new Date(`${dateISO}T00:00:00`).getDay() : -1
  if (day === 5 || day === 6) price += 20
  if (lateNight) price += 15
  price = Math.round(price / 5) * 5
  const past = clients.map((c) => parseMoney(c.price)).filter((n) => n > 0)
  const avg = past.length ? past.reduce((a, n) => a + n, 0) / past.length : 0
  return { price, why: `${label}, ~${h}h${day === 5 || day === 6 ? ', weekend' : ''}${avg ? `; you usually charge ${formatMoney(avg)}` : ''}` }
}

/** Clients already booked on a date. */
export function clashesOn(dateISO: string, clients: Client[], ignoreId?: string): string[] {
  if (!dateISO) return []
  const target = new Date(`${dateISO}T00:00:00`).toDateString()
  return clients
    .filter((c) => c.id !== ignoreId && c.stage !== 'inquiry')
    .filter((c) => parseShootDate(c.shootDate)?.toDateString() === target)
    .map((c) => `${c.name} (${c.stage})`)
}
