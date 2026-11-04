import { useState } from 'react'
import type { Client } from '../types'
import type { Invoice, InvoiceStatus, LineItem, BusinessProfile } from '../invoiceTypes'
import {
  STATUS_LABELS,
  parseMoney,
  formatMoney,
  invoiceSubtotal,
  invoiceBalance,
  nextInvoiceNumber,
  todayISO,
  addDaysISO,
} from '../invoiceTypes'

interface Props {
  invoice: Invoice | null
  clients: Client[]
  profile: BusinessProfile
  onSave: (invoice: Invoice, consumedNumber: boolean) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function blankLine(): LineItem {
  return { id: crypto.randomUUID(), description: '', amount: '' }
}

function blankInvoice(profile: BusinessProfile): Invoice {
  const now = new Date().toISOString()
  const issue = todayISO()
  return {
    id: crypto.randomUUID(),
    number: nextInvoiceNumber(profile),
    clientId: null,
    billToName: '',
    billToContact: '',
    issueDate: issue,
    dueDate: addDaysISO(issue, 14),
    lineItems: [blankLine()],
    amountPaid: '',
    status: 'draft',
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

export default function InvoiceModal({ invoice, clients, profile, onSave, onDelete, onClose }: Props) {
  const isNew = invoice === null
  const [form, setForm] = useState<Invoice>(invoice ?? blankInvoice(profile))

  function update<K extends keyof Invoice>(key: K, value: Invoice[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function pickClient(id: string) {
    if (!id) {
      update('clientId', null)
      return
    }
    const c = clients.find((x) => x.id === id)
    if (!c) return
    setForm((f) => ({
      ...f,
      clientId: c.id,
      billToName: c.name,
      billToContact: c.contact,
      lineItems:
        f.lineItems.length === 1 && !f.lineItems[0].description && !f.lineItems[0].amount
          ? [{ id: crypto.randomUUID(), description: c.type || 'Photography session', amount: c.price }]
          : f.lineItems,
    }))
  }

  function updateLine(id: string, key: 'description' | 'amount', value: string) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.map((li) => (li.id === id ? { ...li, [key]: value } : li)),
    }))
  }

  function addLine() {
    setForm((f) => ({ ...f, lineItems: [...f.lineItems, blankLine()] }))
  }

  function removeLine(id: string) {
    setForm((f) => ({
      ...f,
      lineItems: f.lineItems.length > 1 ? f.lineItems.filter((li) => li.id !== id) : f.lineItems,
    }))
  }

  function handleSave() {
    const cleaned: Invoice = {
      ...form,
      billToName: form.billToName.trim() || 'Client',
      lineItems: form.lineItems.filter((li) => li.description.trim() || parseMoney(li.amount) > 0),
      updatedAt: new Date().toISOString(),
    }
    if (cleaned.lineItems.length === 0) cleaned.lineItems = [blankLine()]
    onSave(cleaned, isNew)
  }

  const subtotal = invoiceSubtotal(form)
  const balance = invoiceBalance(form)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{isNew ? 'New invoice' : 'Edit invoice'}</span>
          <button className="modal-close" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <div className="invoice-number-row">
          <span className="invoice-number">{form.number}</span>
          <select
            className="status-select"
            value={form.status}
            onChange={(e) => update('status', e.target.value as InvoiceStatus)}
          >
            {(Object.keys(STATUS_LABELS) as InvoiceStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">Bill to — client</label>
          <select value={form.clientId ?? ''} onChange={(e) => pickClient(e.target.value)}>
            <option value="">Pick a client (or type below)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Bill-to name</label>
            <input
              value={form.billToName}
              onChange={(e) => update('billToName', e.target.value)}
              placeholder="Client or company"
            />
          </div>
          <div className="field">
            <label className="field-label">Bill-to contact</label>
            <input
              value={form.billToContact}
              onChange={(e) => update('billToContact', e.target.value)}
              placeholder="Email or address"
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Issue date</label>
            <input type="date" value={form.issueDate} onChange={(e) => update('issueDate', e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Due date</label>
            <input type="date" value={form.dueDate} onChange={(e) => update('dueDate', e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Line items</label>
          <div className="line-items">
            {form.lineItems.map((li) => (
              <div className="line-item-row" key={li.id}>
                <input
                  className="line-desc"
                  value={li.description}
                  onChange={(e) => updateLine(li.id, 'description', e.target.value)}
                  placeholder="Description"
                />
                <input
                  className="line-amount"
                  value={li.amount}
                  onChange={(e) => updateLine(li.id, 'amount', e.target.value)}
                  placeholder="£0"
                />
                <button
                  className="line-remove"
                  onClick={() => removeLine(li.id)}
                  title="Remove line"
                  disabled={form.lineItems.length <= 1}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="add-line" onClick={addLine}>
            + Add line
          </button>
        </div>

        <div className="field-grid align-end">
          <div className="field">
            <label className="field-label">Amount received</label>
            <input
              value={form.amountPaid}
              onChange={(e) => update('amountPaid', e.target.value)}
              placeholder="£0"
            />
          </div>
          <div className="totals-box">
            <div className="totals-row">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="totals-row balance">
              <span>Balance due</span>
              <span>{formatMoney(balance)}</span>
            </div>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={2}
            placeholder="Thank-you note, terms, anything for the client"
          />
        </div>

        <div className="modal-footer">
          {!isNew ? (
            <button className="btn-danger" onClick={() => onDelete(form.id)}>
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="footer-right">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-brass" onClick={handleSave}>
              Save invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
