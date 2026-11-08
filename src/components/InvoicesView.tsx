import type { Invoice } from '../invoiceTypes'
import type { Client } from '../types'
import { initials, thumbGradient } from '../types'
import type { AutoKind } from '../autoInvoice'
import { nextInvoiceFor } from '../autoInvoice'
import { parseMoney } from '../invoiceTypes'
import {
  formatMoney,
  formatDate,
  invoiceBalance,
  invoiceSubtotal,
  isOverdue,
  STATUS_LABELS,
} from '../invoiceTypes'

interface Props {
  invoices: Invoice[]
  onNew: () => void
  onEdit: (inv: Invoice) => void
  onPreview: (inv: Invoice) => void
  clients: Client[]
  onAuto: (client: Client, kind: AutoKind) => void
}

export default function InvoicesView({ invoices, onNew, onEdit, onPreview, clients, onAuto }: Props) {
  const ready = clients
    .map((c) => ({ c, kind: nextInvoiceFor(c, invoices) }))
    .filter((r): r is { c: Client; kind: AutoKind } => r.kind !== null)
  const outstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + invoiceBalance(i), 0)
  const overdueCount = invoices.filter(isOverdue).length

  const sorted = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate))

  return (
    <div className="invoices-view">
      <div className="mn-stats">
        {[
          { label: 'Waiting on', value: formatMoney(outstanding), note: `${invoices.filter((i) => i.status !== 'paid').length} open`, tone: 'cyan' },
          { label: 'Overdue', value: String(overdueCount), note: overdueCount ? 'Chase these first' : 'Nothing late', tone: overdueCount ? 'warn' : 'calm' },
          { label: 'Invoices', value: String(invoices.length), note: `${invoices.filter((i) => i.status === 'paid').length} settled`, tone: 'blue' },
        ].map((s, i) => (
          <div key={s.label} className={`mn-stat tone-${s.tone}`} style={{ animationDelay: `${i * 0.06}s` }}>
            <span>{s.label}</span>
            <b>{s.value}</b>
            <small>{s.note}</small>
          </div>
        ))}
        <button className="mn-new" onClick={onNew}>
          <b>+</b>
          New invoice
        </button>
      </div>

      {ready.length > 0 && (
        <section className="mn-auto">
          <header>
            <span className="mn-auto-spark">✦</span>
            <div>
              <h3>Ready to invoice</h3>
              <p>Built from your client cards: price, 50% deposit and terms filled in. One tap.</p>
            </div>
          </header>
          <div className="mn-auto-list">
            {ready.map(({ c, kind }, i) => {
              const total = parseMoney(c.price)
              const amount = kind === 'deposit' ? total / 2 : total / 2
              return (
                <div key={c.id} className="mn-auto-card" style={{ animationDelay: `${i * 0.06}s` }}>
                  <span className="mn-auto-avatar" style={{ background: thumbGradient(c.id) }}>
                    {initials(c.name)}
                  </span>
                  <span className="mn-auto-text">
                    <b>{c.name}</b>
                    <small>
                      {kind === 'deposit' ? '50% deposit' : 'Balance on delivery'} · {formatMoney(amount)}
                    </small>
                  </span>
                  <button className="btn-brass" onClick={() => onAuto(c, kind)}>
                    Make it
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {sorted.length === 0 ? (
        <div className="mn-empty">
          <h3>No invoices yet</h3>
          <p>Three steps and it's sent:</p>
          <ol>
            <li>
              <b>1</b>Pick the client
            </li>
            <li>
              <b>2</b>Check the price and 50% deposit
            </li>
            <li>
              <b>3</b>Send the PDF
            </li>
          </ol>
          <button className="btn-brass" onClick={onNew}>
            Make the first one
          </button>
        </div>
      ) : (
        <div className="invoice-list">
          <div className="invoice-list-head">
            <span>Number</span>
            <span>Client</span>
            <span>Issued</span>
            <span>Due</span>
            <span className="right">Total</span>
            <span className="right">Balance</span>
            <span>Status</span>
            <span />
          </div>
          {sorted.map((inv) => {
            const overdue = isOverdue(inv)
            return (
              <div className="invoice-row" key={inv.id} onClick={() => onEdit(inv)}>
                <span className="inv-number">{inv.number}</span>
                <span className="inv-client">{inv.billToName}</span>
                <span className="inv-date">{formatDate(inv.issueDate)}</span>
                <span className={`inv-date${overdue ? ' overdue' : ''}`}>
                  {formatDate(inv.dueDate)}
                  {overdue && <span className="overdue-tag">Overdue</span>}
                </span>
                <span className="inv-money right">{formatMoney(invoiceSubtotal(inv))}</span>
                <span className="inv-money right">{formatMoney(invoiceBalance(inv))}</span>
                <span className={`status-badge status-${inv.status}`}>{STATUS_LABELS[inv.status]}</span>
                <button
                  className="inv-preview-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPreview(inv)
                  }}
                >
                  View
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
