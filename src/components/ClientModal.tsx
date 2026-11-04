import { useState } from 'react'
import type { Client, Stage } from '../types'
import { STAGES, buildGalleryMessage } from '../types'
import { todayISO, formatDate } from '../invoiceTypes'
import GalleryManager from './GalleryManager'

interface Props {
  client: Client | null
  signature: string
  onSave: (client: Client) => void
  onDelete: (id: string) => void
  onClose: () => void
}

function emptyClient(): Client {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: '',
    contact: '',
    type: '',
    stage: 'inquiry',
    shootDate: '',
    price: '',
    depositPaid: false,
    fullyPaid: false,
    notes: '',
    galleryUrl: '',
    galleryPassword: '',
    galleryDeliveredAt: '',
    referredBy: '',
    rebookOn: '',
    costs: '',
    hoursWorked: '',
    createdAt: now,
    lastUpdated: now,
  }
}

export default function ClientModal({ client, signature, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState<Client>(client ?? emptyClient())
  const [copied, setCopied] = useState(false)
  const isNew = client === null

  function update<K extends keyof Client>(key: K, value: Client[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const delivered = !!form.galleryDeliveredAt

  function toggleDelivered() {
    update('galleryDeliveredAt', delivered ? '' : todayISO())
  }

  function openGallery() {
    if (form.galleryUrl) window.open(form.galleryUrl, '_blank', 'noopener')
  }

  function copyMessage() {
    navigator.clipboard.writeText(buildGalleryMessage(form, signature)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function handleSave() {
    const name = form.name.trim() || 'Untitled client'
    // Saving resets the staleness clock.
    onSave({ ...form, name, lastUpdated: new Date().toISOString() })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{isNew ? 'New client' : 'Edit client'}</span>
          <button className="modal-close" onClick={onClose}>
            CLOSE
          </button>
        </div>

        <div className="field">
          <label className="field-label">Name</label>
          <input
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="Client or job name"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="field-label">Contact</label>
          <input
            value={form.contact}
            onChange={(e) => update('contact', e.target.value)}
            placeholder="Email, phone, or instagram"
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Stage</label>
            <select value={form.stage} onChange={(e) => update('stage', e.target.value as Stage)}>
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Shoot date</label>
            <input
              value={form.shootDate}
              onChange={(e) => update('shootDate', e.target.value)}
              placeholder="Aug 14"
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Session type</label>
            <input
              value={form.type}
              onChange={(e) => update('type', e.target.value)}
              placeholder="Headshots, Event…"
            />
          </div>
          <div className="field">
            <label className="field-label">Price quoted</label>
            <input
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
              placeholder="£0"
            />
          </div>
        </div>

        <div className="checkbox-stack" style={{ flexDirection: 'row', gap: 28 }}>
          <div className="checkbox-row" onClick={() => update('depositPaid', !form.depositPaid)}>
            <span className={`checkbox-box${form.depositPaid ? ' checked' : ''}`} />
            <span className="checkbox-label">Deposit paid</span>
          </div>
          <div className="checkbox-row" onClick={() => update('fullyPaid', !form.fullyPaid)}>
            <span className={`checkbox-box${form.fullyPaid ? ' checked' : ''}`} />
            <span className="checkbox-label">Fully paid</span>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            rows={3}
            placeholder="Location ideas, package details, anything to remember"
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Referred by</label>
            <input
              value={form.referredBy}
              onChange={(e) => update('referredBy', e.target.value)}
              placeholder="Who sent them to you"
            />
          </div>
          <div className="field">
            <label className="field-label">Rebook on</label>
            <input
              type="date"
              value={form.rebookOn}
              onChange={(e) => update('rebookOn', e.target.value)}
            />
          </div>
        </div>

        <div className="field-grid">
          <div className="field">
            <label className="field-label">Costs (travel etc.)</label>
            <input
              value={form.costs}
              onChange={(e) => update('costs', e.target.value)}
              placeholder="£0"
            />
          </div>
          <div className="field">
            <label className="field-label">Hours worked</label>
            <input
              inputMode="decimal"
              value={form.hoursWorked}
              onChange={(e) => update('hoursWorked', e.target.value)}
              placeholder="Shooting + editing"
            />
          </div>
        </div>

        <div className="gallery-section">
          <div className="gallery-head">
            <span className="field-label">Gallery</span>
            <span className="gallery-source">Upload here, or paste any link</span>
          </div>
          <GalleryManager
            clientId={form.id}
            clientName={form.name || 'Your gallery'}
            contact={form.contact}
            onLink={(url) => update('galleryUrl', url)}
          />
          <input
            value={form.galleryUrl}
            onChange={(e) => update('galleryUrl', e.target.value)}
            placeholder="Paste the gallery link"
          />
          <div className="field-grid">
            <input
              value={form.galleryPassword}
              onChange={(e) => update('galleryPassword', e.target.value)}
              placeholder="Password (if set)"
            />
            <div
              className={`delivered-toggle${delivered ? ' on' : ''}`}
              onClick={toggleDelivered}
            >
              <span className={`checkbox-box${delivered ? ' checked' : ''}`} />
              <span className="checkbox-label">
                {delivered ? `Delivered ${formatDate(form.galleryDeliveredAt)}` : 'Mark delivered'}
              </span>
            </div>
          </div>
          {form.galleryUrl && (
            <div className="gallery-actions">
              <button className="gallery-btn" onClick={openGallery}>
                Open gallery ↗
              </button>
              <button className="gallery-btn accent" onClick={copyMessage}>
                {copied ? 'Copied!' : 'Copy send message'}
              </button>
            </div>
          )}
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
              Save client
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
