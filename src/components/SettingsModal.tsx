import { useState } from 'react'
import type { BusinessProfile } from '../invoiceTypes'

interface Props {
  profile: BusinessProfile
  onSave: (profile: BusinessProfile) => void
  onClose: () => void
}

export default function SettingsModal({ profile, onSave, onClose }: Props) {
  const [form, setForm] = useState<BusinessProfile>(profile)

  function update<K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Business details</span>
          <button className="modal-close" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <p className="modal-hint">These appear on every invoice you send.</p>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Business name</label>
            <input
              value={form.businessName}
              onChange={(e) => update('businessName', e.target.value)}
              placeholder="Micke Photography"
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field-label">Your name</label>
            <input
              value={form.yourName}
              onChange={(e) => update('yourName', e.target.value)}
              placeholder="Your name"
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Email</label>
            <input
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="you@studio.com"
            />
          </div>
          <div className="field">
            <label className="field-label">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+44 …"
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Payment instructions</label>
          <textarea
            value={form.paymentInstructions}
            onChange={(e) => update('paymentInstructions', e.target.value)}
            rows={3}
            placeholder="Bank transfer — Sort 00-00-00, Acc 12345678. Or your payment link."
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Invoice prefix</label>
            <input
              value={form.invoicePrefix}
              onChange={(e) => update('invoicePrefix', e.target.value.toUpperCase())}
              placeholder="INV"
            />
          </div>
          <div className="field">
            <label className="field-label">Next invoice number</label>
            <input
              type="number"
              value={form.nextInvoiceSeq}
              onChange={(e) => update('nextInvoiceSeq', Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Monthly revenue goal</label>
          <input
            value={form.monthlyGoal}
            onChange={(e) => update('monthlyGoal', e.target.value)}
            placeholder="e.g. 1000"
          />
        </div>

        <div className="modal-footer">
          <span />
          <div className="footer-right">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-brass" onClick={() => onSave(form)}>
              Save details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
