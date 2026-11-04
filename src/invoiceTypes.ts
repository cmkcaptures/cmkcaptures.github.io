export type InvoiceStatus = 'draft' | 'sent' | 'paid'

export interface LineItem {
  id: string
  description: string
  amount: string
}

export interface Invoice {
  id: string
  number: string
  clientId: string | null
  billToName: string
  billToContact: string
  issueDate: string // yyyy-mm-dd
  dueDate: string // yyyy-mm-dd
  lineItems: LineItem[]
  amountPaid: string
  status: InvoiceStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export interface BusinessProfile {
  businessName: string
  yourName: string
  email: string
  phone: string
  paymentInstructions: string
  invoicePrefix: string
  nextInvoiceSeq: number
  monthlyGoal: string
}

export const DEFAULT_BUSINESS: BusinessProfile = {
  businessName: '',
  yourName: '',
  email: '',
  phone: '',
  paymentInstructions: '',
  invoicePrefix: 'INV',
  nextInvoiceSeq: 1,
  monthlyGoal: '',
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
}

/** Parse a free-text money string into a number. */
export function parseMoney(s: string): number {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Format a number as GBP, dropping .00 for whole amounts. */
export function formatMoney(n: number): string {
  const whole = Math.round(n) === n
  return (
    '£' +
    n.toLocaleString('en-GB', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  )
}

export function invoiceSubtotal(inv: Invoice): number {
  return inv.lineItems.reduce((sum, li) => sum + parseMoney(li.amount), 0)
}

export function invoiceBalance(inv: Invoice): number {
  return Math.max(0, invoiceSubtotal(inv) - parseMoney(inv.amountPaid))
}

/** Unpaid and past its due date. */
export function isOverdue(inv: Invoice): boolean {
  if (inv.status === 'paid' || invoiceBalance(inv) <= 0) return false
  if (!inv.dueDate) return false
  const due = new Date(inv.dueDate + 'T23:59:59').getTime()
  return Date.now() > due
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function nextInvoiceNumber(profile: BusinessProfile): string {
  const prefix = profile.invoicePrefix || 'INV'
  return `${prefix}-${String(profile.nextInvoiceSeq).padStart(4, '0')}`
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
