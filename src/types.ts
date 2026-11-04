export type Stage = 'inquiry' | 'booked' | 'shot' | 'delivered' | 'paid'

export const STAGES: { key: Stage; label: string }[] = [
  { key: 'inquiry', label: 'Inquiry' },
  { key: 'booked', label: 'Booked' },
  { key: 'shot', label: 'Shot' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'paid', label: 'Paid' },
]

export interface Client {
  id: string
  name: string
  contact: string
  type: string
  stage: Stage
  shootDate: string
  price: string
  depositPaid: boolean
  fullyPaid: boolean
  notes: string
  galleryUrl: string
  galleryPassword: string
  galleryDeliveredAt: string
  createdAt: string
  lastUpdated: string
}

/** Backfill defaults so older saved clients don't break newer fields. */
export function normalizeClient(c: Partial<Client> & { id: string }): Client {
  const now = new Date().toISOString()
  return {
    id: c.id,
    name: c.name ?? '',
    contact: c.contact ?? '',
    type: c.type ?? '',
    stage: c.stage ?? 'inquiry',
    shootDate: c.shootDate ?? '',
    price: c.price ?? '',
    depositPaid: c.depositPaid ?? false,
    fullyPaid: c.fullyPaid ?? false,
    notes: c.notes ?? '',
    galleryUrl: c.galleryUrl ?? '',
    galleryPassword: c.galleryPassword ?? '',
    galleryDeliveredAt: c.galleryDeliveredAt ?? '',
    createdAt: c.createdAt ?? now,
    lastUpdated: c.lastUpdated ?? now,
  }
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'there'
}

/** Build a ready-to-send gallery delivery message for the client. */
export function buildGalleryMessage(c: Client, signature: string): string {
  const lines = [
    `Hi ${firstName(c.name)},`,
    '',
    `Your ${c.type ? c.type.toLowerCase() + ' ' : ''}gallery is ready to view and download:`,
    c.galleryUrl,
  ]
  if (c.galleryPassword) lines.push(`Password: ${c.galleryPassword}`)
  lines.push('', 'Hope you love them!')
  if (signature) lines.push(signature)
  return lines.join('\n')
}

export const FOLLOWUP_THRESHOLD_DAYS = 3

export function daysSince(iso: string): number {
  const last = new Date(iso).getTime()
  return Math.floor((Date.now() - last) / (1000 * 60 * 60 * 24))
}

/** Flag when a client has gone stale, isn't fully paid, and isn't in the Paid column. */
export function needsFollowUp(client: Client): boolean {
  if (client.stage === 'paid' || client.fullyPaid) return false
  return daysSince(client.lastUpdated) >= FOLLOWUP_THRESHOLD_DAYS
}

export type PaymentStatus = 'unpaid' | 'deposit' | 'paid'

export function paymentStatus(client: Client): PaymentStatus {
  return client.fullyPaid ? 'paid' : client.depositPaid ? 'deposit' : 'unpaid'
}

const GRADIENTS = [
  'linear-gradient(135deg,#3B2F21 0%,#211A12 70%)',
  'linear-gradient(135deg,#33281C 0%,#1D1710 70%)',
  'linear-gradient(135deg,#2E2A20 0%,#1A1712 70%)',
  'linear-gradient(135deg,#282217 0%,#171310 70%)',
]

/** Stable-per-client duotone gradient for the placeholder thumbnail. */
export function thumbGradient(id: string): string {
  let sum = 0
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return GRADIENTS[sum % GRADIENTS.length]
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·'
  )
}
