import type { Client } from '../../types'
import type { Invoice, BusinessProfile } from '../../invoiceTypes'
import { parseMoney, formatMoney, invoiceBalance } from '../../invoiceTypes'

interface Props {
  clients: Client[]
  invoices: Invoice[]
  business: BusinessProfile
}

export default function RevenueWidget({ clients, invoices, business }: Props) {
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

  const pending = clients
    .filter((c) => ['booked', 'shot', 'delivered'].includes(c.stage) && !c.fullyPaid && c.price)
    .reduce((sum, c) => sum + parseMoney(c.price), 0)

  const outstanding = invoices
    .filter((inv) => inv.status !== 'paid')
    .reduce((sum, inv) => sum + invoiceBalance(inv), 0)

  const goal = parseMoney(business.monthlyGoal ?? '')
  const progress = goal > 0 ? Math.min(1, earned / goal) : 0

  return (
    <div className="hub-widget">
      <h3 className="hub-widget-title">Revenue</h3>
      <div className="hub-revenue-big">{formatMoney(earned)}</div>
      <p className="hub-revenue-label">earned this month</p>

      {goal > 0 && (
        <div className="hub-goal-bar">
          <div className="hub-goal-fill" style={{ width: `${progress * 100}%` }} />
          <span className="hub-goal-text">{Math.round(progress * 100)}% of {formatMoney(goal)}</span>
        </div>
      )}

      <div className="hub-revenue-rows">
        <div className="hub-revenue-row">
          <span>Pending</span>
          <span className="hub-revenue-val">{formatMoney(pending)}</span>
        </div>
        <div className="hub-revenue-row">
          <span>Outstanding invoices</span>
          <span className="hub-revenue-val">{formatMoney(outstanding)}</span>
        </div>
      </div>
    </div>
  )
}
