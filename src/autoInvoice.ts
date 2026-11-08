// Builds a ready-to-send invoice from a client card. 50% non-refundable deposit, balance on delivery.
import type { Client } from './types'
import type { BusinessProfile, Invoice } from './invoiceTypes'
import { addDaysISO, formatMoney, nextInvoiceNumber, parseMoney, todayISO } from './invoiceTypes'
import { parseShootDate } from './studio/time'

export type AutoKind = 'deposit' | 'balance'

export const TERMS = '50% non-refundable deposit secures your date. Balance is due when your gallery is delivered (within 48 hours of the shoot).'

/** What this client should be invoiced for next, or null if nothing. */
export function nextInvoiceFor(client: Client, invoices: Invoice[]): AutoKind | null {
  if (parseMoney(client.price) <= 0 || client.fullyPaid || client.stage === 'paid' || client.stage === 'inquiry') return null
  const theirs = invoices.filter((i) => i.clientId === client.id)
  const has = (kind: AutoKind) => theirs.some((i) => i.notes.startsWith(kind === 'deposit' ? '[Deposit]' : '[Balance]'))
  if (!client.depositPaid) return has('deposit') ? null : 'deposit'
  return has('balance') ? null : 'balance'
}

export function buildInvoice(client: Client, kind: AutoKind, profile: BusinessProfile): Invoice {
  const total = parseMoney(client.price)
  const half = Math.round(total * 50) / 100
  const shoot = parseShootDate(client.shootDate)
  const shootISO = shoot ? new Date(shoot.getTime() - shoot.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : ''
  const what = `${client.type || 'Event'} photography${client.shootDate ? ` · ${client.shootDate}` : ''}`
  const today = todayISO()
  const now = new Date().toISOString()
  const due = kind === 'deposit' ? (shootISO && shootISO > today ? addDaysISO(shootISO, -1) : addDaysISO(today, 2)) : addDaysISO(today, 3)
  return {
    id: crypto.randomUUID(),
    number: nextInvoiceNumber(profile),
    clientId: client.id,
    billToName: client.name,
    billToContact: client.contact,
    issueDate: today,
    dueDate: due < today ? today : due,
    lineItems:
      kind === 'deposit'
        ? [{ id: crypto.randomUUID(), description: `${what}: 50% deposit to secure the date (total ${formatMoney(total)})`, amount: String(half) }]
        : [{ id: crypto.randomUUID(), description: what, amount: String(total) }],
    amountPaid: kind === 'balance' ? String(half) : '0',
    status: 'draft',
    notes: `[${kind === 'deposit' ? 'Deposit' : 'Balance'}] ${TERMS}`,
    createdAt: now,
    updatedAt: now,
  }
}
