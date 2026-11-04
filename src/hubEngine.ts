import type { Client } from './types'
import { needsFollowUp, daysSince } from './types'
import type { Invoice, BusinessProfile } from './invoiceTypes'
import { isOverdue, invoiceBalance, parseMoney, formatMoney } from './invoiceTypes'

export type InsightPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface Insight {
  id: string
  type: string
  priority: InsightPriority
  icon: string
  message: string
  detail?: string
  actionLabel?: string
  actionPayload?: { view: string; clientId?: string }
}

const PRIORITY_ORDER: Record<InsightPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target - now.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeDay(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function overdueInvoices(invoices: Invoice[]): Insight[] {
  return invoices.filter(isOverdue).map((inv) => ({
    id: `overdue-${inv.id}`,
    type: 'overdue-invoice',
    priority: 'urgent' as const,
    icon: '⚠',
    message: `Invoice ${inv.number} is overdue`,
    detail: `${formatMoney(invoiceBalance(inv))} outstanding for ${inv.billToName}`,
    actionLabel: 'View invoices',
    actionPayload: { view: 'invoices' },
  }))
}

function followUps(clients: Client[]): Insight[] {
  return clients.filter(needsFollowUp).map((c) => {
    const days = daysSince(c.lastUpdated)
    return {
      id: `followup-${c.id}`,
      type: 'follow-up',
      priority: days >= 7 ? 'urgent' as const : 'high' as const,
      icon: '📩',
      message: `Follow up with ${c.name}`,
      detail: `${days} days since last update · ${c.stage}`,
      actionLabel: 'Open client',
      actionPayload: { view: 'pipeline', clientId: c.id },
    }
  })
}

function upcomingShoots(clients: Client[]): Insight[] {
  return clients
    .filter((c) => c.stage === 'booked' && c.shootDate)
    .map((c) => ({ client: c, days: daysUntil(c.shootDate) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)
    .map(({ client: c, days }) => ({
      id: `shoot-${c.id}`,
      type: 'upcoming-shoot',
      priority: days <= 1 ? 'urgent' as const : days <= 3 ? 'high' as const : 'medium' as const,
      icon: '📸',
      message: `${c.type || 'Shoot'} with ${c.name} ${relativeDay(days)}`,
      detail: c.shootDate,
      actionLabel: 'Open client',
      actionPayload: { view: 'pipeline', clientId: c.id },
    }))
}

function depositsDue(clients: Client[]): Insight[] {
  return clients
    .filter((c) => c.stage === 'booked' && !c.depositPaid && !c.fullyPaid)
    .map((c) => ({
      id: `deposit-${c.id}`,
      type: 'deposit-due',
      priority: 'high' as const,
      icon: '💷',
      message: `Get the deposit from ${c.name}`,
      detail: 'Their date is not locked in until it is paid',
      actionLabel: 'Open client',
      actionPayload: { view: 'pipeline', clientId: c.id },
    }))
}

function unpaidDelivered(clients: Client[]): Insight[] {
  return clients
    .filter((c) => (c.stage === 'delivered' || c.stage === 'shot') && !c.fullyPaid && c.price)
    .map((c) => ({
      id: `unpaid-${c.id}`,
      type: 'unpaid-work',
      priority: 'high' as const,
      icon: '💷',
      message: `${c.name} hasn't paid yet`,
      detail: `${c.price} · ${c.stage}`,
      actionLabel: 'Open client',
      actionPayload: { view: 'pipeline', clientId: c.id },
    }))
}

function revenueGoalGap(clients: Client[], invoices: Invoice[], business: BusinessProfile): Insight[] {
  const goal = parseMoney(business.monthlyGoal ?? '')
  if (!goal) return []

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  let earned = 0
  for (const inv of invoices) {
    if (inv.status === 'paid' && inv.updatedAt >= monthStart) {
      earned += parseMoney(inv.amountPaid)
    }
  }
  for (const c of clients) {
    if (c.fullyPaid && c.lastUpdated >= monthStart) {
      earned += parseMoney(c.price)
    }
  }

  const gap = goal - earned
  if (gap <= 0) return [{
    id: 'goal-hit',
    type: 'milestone',
    priority: 'low',
    icon: '🎯',
    message: `Monthly goal hit! ${formatMoney(earned)} earned`,
  }]

  return [{
    id: 'revenue-gap',
    type: 'revenue-gap',
    priority: 'medium',
    icon: '🎯',
    message: `${formatMoney(gap)} away from your ${formatMoney(goal)} monthly goal`,
    detail: `${formatMoney(earned)} earned so far this month`,
  }]
}

function quietPeriod(clients: Client[]): Insight[] {
  const hasUpcoming = clients.some((c) => {
    if (c.stage !== 'booked' || !c.shootDate) return false
    const days = daysUntil(c.shootDate)
    return days >= 0 && days <= 30
  })
  if (hasUpcoming) return []
  return [{
    id: 'quiet',
    type: 'quiet-period',
    priority: 'medium',
    icon: '📭',
    message: 'No shoots booked in the next 30 days',
    detail: 'Time to reach out and fill the calendar',
  }]
}

function contentGap(clients: Client[]): Insight[] {
  return clients
    .filter((c) => c.stage === 'delivered' && c.galleryDeliveredAt && daysSince(c.galleryDeliveredAt) >= 7)
    .slice(0, 2)
    .map((c) => ({
      id: `content-${c.id}`,
      type: 'content-gap',
      priority: 'low' as const,
      icon: '📱',
      message: `Post content from ${c.name}'s shoot`,
      detail: `Delivered ${daysSince(c.galleryDeliveredAt)} days ago`,
    }))
}

function milestones(clients: Client[]): Insight[] {
  const paidCount = clients.filter((c) => c.stage === 'paid').length
  const thresholds = [100, 50, 25, 10]
  for (const t of thresholds) {
    if (paidCount >= t) {
      return [{
        id: `milestone-${t}`,
        type: 'milestone',
        priority: 'low',
        icon: '🏆',
        message: `${paidCount} shoots completed!`,
      }]
    }
  }
  return []
}

export function generateInsights(
  clients: Client[],
  invoices: Invoice[],
  business: BusinessProfile,
): Insight[] {
  const all = [
    ...overdueInvoices(invoices),
    ...followUps(clients),
    ...upcomingShoots(clients),
    ...depositsDue(clients),
    ...unpaidDelivered(clients),
    ...revenueGoalGap(clients, invoices, business),
    ...quietPeriod(clients),
    ...contentGap(clients),
    ...milestones(clients),
  ]
  all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  return all
}

export function getGreeting(name: string): string {
  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  return `Good ${timeOfDay}${name ? ', ' + name : ''}`
}
