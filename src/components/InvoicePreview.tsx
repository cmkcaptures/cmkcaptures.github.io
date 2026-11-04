import type { Invoice, BusinessProfile } from '../invoiceTypes'
import {
  parseMoney,
  formatMoney,
  invoiceSubtotal,
  invoiceBalance,
  formatDate,
  STATUS_LABELS,
} from '../invoiceTypes'

interface Props {
  invoice: Invoice
  profile: BusinessProfile
  onClose: () => void
}

export default function InvoicePreview({ invoice, profile, onClose }: Props) {
  const subtotal = invoiceSubtotal(invoice)
  const paid = parseMoney(invoice.amountPaid)
  const balance = invoiceBalance(invoice)

  return (
    <div className="preview-overlay" onClick={onClose}>
      <div className="preview-shell" onClick={(e) => e.stopPropagation()}>
        <div className="preview-toolbar">
          <button className="btn-ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn-brass" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>

        <div className="invoice-paper" id="invoice-paper">
          <div className="paper-head">
            <div>
              <div className="paper-business">{profile.businessName || 'Your business'}</div>
              {profile.yourName && <div className="paper-sub">{profile.yourName}</div>}
              {profile.email && <div className="paper-sub">{profile.email}</div>}
              {profile.phone && <div className="paper-sub">{profile.phone}</div>}
            </div>
            <div className="paper-invoice-meta">
              <div className="paper-invoice-word">Invoice</div>
              <div className="paper-number">{invoice.number}</div>
              <div className={`paper-status status-${invoice.status}`}>
                {STATUS_LABELS[invoice.status]}
              </div>
            </div>
          </div>

          <div className="paper-rule" />

          <div className="paper-parties">
            <div>
              <div className="paper-label">Billed to</div>
              <div className="paper-billto-name">{invoice.billToName}</div>
              {invoice.billToContact && <div className="paper-sub">{invoice.billToContact}</div>}
            </div>
            <div className="paper-dates">
              <div>
                <span className="paper-label">Issued</span>
                <span>{formatDate(invoice.issueDate)}</span>
              </div>
              <div>
                <span className="paper-label">Due</span>
                <span>{formatDate(invoice.dueDate)}</span>
              </div>
            </div>
          </div>

          <table className="paper-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((li) => (
                <tr key={li.id}>
                  <td>{li.description || '—'}</td>
                  <td className="right">{formatMoney(parseMoney(li.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="paper-totals">
            <div className="paper-total-row">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {paid > 0 && (
              <div className="paper-total-row">
                <span>Amount received</span>
                <span>−{formatMoney(paid)}</span>
              </div>
            )}
            <div className="paper-total-row grand">
              <span>Balance due</span>
              <span>{formatMoney(balance)}</span>
            </div>
          </div>

          {profile.paymentInstructions && (
            <div className="paper-payment">
              <div className="paper-label">Payment</div>
              <div className="paper-payment-text">{profile.paymentInstructions}</div>
            </div>
          )}

          {invoice.notes && <div className="paper-notes">{invoice.notes}</div>}
        </div>
      </div>
    </div>
  )
}
