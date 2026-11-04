import type { Invoice } from '../invoiceTypes'
import {
  formatMoney,
  formatDate,
  invoiceBalance,
  invoiceSubtotal,
  isOverdue,
  parseMoney,
  STATUS_LABELS,
} from '../invoiceTypes'

interface Props {
  invoices: Invoice[]
  onNew: () => void
  onEdit: (inv: Invoice) => void
  onPreview: (inv: Invoice) => void
}

export default function InvoicesView({ invoices, onNew, onEdit, onPreview }: Props) {
  const outstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + invoiceBalance(i), 0)
  const received = invoices.reduce((sum, i) => sum + parseMoney(i.amountPaid), 0)
  const overdueCount = invoices.filter(isOverdue).length

  const sorted = [...invoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate))

  return (
    <div className="invoices-view">
      <div className="summary-row">
        <div className="summary-card">
          <span className="summary-label">Outstanding</span>
          <span className="summary-value brass">{formatMoney(outstanding)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Received</span>
          <span className="summary-value">{formatMoney(received)}</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Overdue</span>
          <span className={`summary-value${overdueCount > 0 ? ' alert' : ''}`}>{overdueCount}</span>
        </div>
        <div className="summary-spacer" />
        <button className="btn-brass" onClick={onNew}>
          + New invoice
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="invoices-empty">
          <p className="empty-serif">No invoices yet</p>
          <p className="empty-hint-sub">Create one from a client, or start blank.</p>
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
