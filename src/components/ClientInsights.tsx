import { useState } from 'react'
import type { Client } from '../types'
import { firstName } from '../types'
import { formatDate, formatMoney, parseMoney, todayISO } from '../invoiceTypes'

const DELIVERY_HOURS = 48
const REBOOK_WINDOW_DAYS = 30

function parseDate(text: string): Date | null {
  if (!text) return null
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00` : text
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  // Browsers read a yearless date like "Aug 14" as 2001.
  if (date.getFullYear() < 2020) date.setFullYear(new Date().getFullYear())
  return date
}

function hoursLeft(client: Client): number | null {
  const shot = parseDate(client.shootDate)
  if (!shot) return null
  // The shoot often ends late at night, so the clock runs from the end of the shoot day.
  const deadline = new Date(shot)
  deadline.setHours(24 + DELIVERY_HOURS, 0, 0, 0)
  return Math.round((deadline.getTime() - Date.now()) / 3600000)
}

function daysUntil(iso: string): number {
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000)
}

function rebookMessage(client: Client): string {
  return `Yo ${firstName(client.name)}, hope you're good! It's nearly time for ${client.type ? `another ${client.type.toLowerCase()}` : 'another shoot'} and I'd love to work with you again. Want me to hold a date for you?`
}

export default function ClientInsights({
  clients,
  onOpen,
}: {
  clients: Client[]
  onOpen: (client: Client) => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const queue = clients
    .filter((c) => c.stage === 'shot')
    .map((c) => ({ client: c, left: hoursLeft(c) }))
    .sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity))

  const rebook = clients
    .filter((c) => c.rebookOn)
    .map((c) => ({ client: c, days: daysUntil(c.rebookOn) }))
    .filter((x) => x.days <= REBOOK_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days)

  const earners = clients.filter((c) => c.fullyPaid || c.stage === 'paid')
  const rows = earners
    .map((c) => {
      const profit = parseMoney(c.price) - parseMoney(c.costs)
      const hours = parseFloat(c.hoursWorked)
      return { client: c, profit, rate: hours > 0 ? profit / hours : null }
    })
    .sort((a, b) => b.profit - a.profit)
  const totalProfit = rows.reduce((sum, r) => sum + r.profit, 0)

  const referrals = new Map<string, { count: number; value: number }>()
  for (const c of clients) {
    const by = c.referredBy.trim()
    if (!by) continue
    const entry = referrals.get(by) ?? { count: 0, value: 0 }
    referrals.set(by, { count: entry.count + 1, value: entry.value + parseMoney(c.price) })
  }
  const referrers = [...referrals].sort((a, b) => b[1].count - a[1].count)

  function copy(client: Client) {
    navigator.clipboard.writeText(rebookMessage(client)).then(() => {
      setCopiedId(client.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  return (
    <div className="gr-sections">
      <section>
        <h2 className="px-pill-title">Editing queue</h2>
        {queue.length === 0 && <p className="gr-empty">Nothing waiting. Shoots in the Shot stage appear here.</p>}
        {queue.map(({ client: c, left }) => (
          <button className="gr-row" key={c.id} onClick={() => onOpen(c)}>
            <span className="gr-row-name">{c.name}</span>
            <span className="gr-row-meta">{c.shootDate || 'No shoot date'}</span>
            <span className={`gr-badge${left !== null && left <= 12 ? ' due' : ''}`}>
              {left === null ? 'Add a date' : left < 0 ? `${-left}h late` : `${left}h left`}
            </span>
          </button>
        ))}
      </section>

      <section>
        <h2 className="px-pill-title">Rebooking radar</h2>
        {rebook.length === 0 && <p className="gr-empty">Nobody due. Set a "Rebook on" date on a client.</p>}
        {rebook.map(({ client: c, days }) => (
          <article className="gr-card" key={c.id}>
            <header>
              <h3>{c.name}</h3>
              <span className="gr-badge">{days < 0 ? 'Overdue' : days === 0 ? 'Today' : `${days} days`}</span>
            </header>
            <p className="gr-card-meta">Rebook on {formatDate(c.rebookOn)}</p>
            <p className="gr-message">{rebookMessage(c)}</p>
            <div className="gr-actions">
              <button className="btn-brass" onClick={() => copy(c)}>
                {copiedId === c.id ? 'Copied!' : 'Copy message'}
              </button>
              <button className="gallery-btn" onClick={() => onOpen(c)}>
                Open client
              </button>
            </div>
          </article>
        ))}
      </section>

      <section>
        <h2 className="px-pill-title">Earnings per shoot</h2>
        {rows.length === 0 && <p className="gr-empty">Paid shoots appear here. Add costs and hours on a client.</p>}
        {rows.length > 0 && <p className="gr-total">Profit so far: {formatMoney(totalProfit)}</p>}
        {rows.map(({ client: c, profit, rate }) => (
          <button className="gr-row" key={c.id} onClick={() => onOpen(c)}>
            <span className="gr-row-name">{c.name}</span>
            <span className="gr-row-meta">{rate === null ? 'Add hours to see your hourly rate' : `${formatMoney(Math.round(rate))} an hour`}</span>
            <span className="gr-badge">{formatMoney(profit)}</span>
          </button>
        ))}
      </section>

      <section>
        <h2 className="px-pill-title">Referrals</h2>
        {referrers.length === 0 && <p className="gr-empty">Add "Referred by" on a client to track who sends you work.</p>}
        {referrers.map(([name, r]) => (
          <div className="gr-row gr-static" key={name}>
            <span className="gr-row-name">{name}</span>
            <span className="gr-row-meta">
              {r.count} {r.count === 1 ? 'client' : 'clients'}
            </span>
            <span className="gr-badge">{formatMoney(r.value)}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
