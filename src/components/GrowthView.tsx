import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Lead, LeadKind, LeadStatus } from '../growth'
import {
  LEAD_KINDS,
  LEAD_STATUSES,
  addLead,
  deleteLead,
  draftMessage,
  isFollowUpDue,
  listLeads,
  messagedChanges,
  updateLead,
} from '../growth'
import { formatDate } from '../invoiceTypes'
import './Growth.css'

type Filter = LeadStatus | 'all' | 'due' | 'watching'

const EMPTY = { name: '', kind: 'promoter' as LeadKind, handle: '', event_name: '', event_date: '' }

export default function GrowthView({ onBooked }: { onBooked: (lead: Lead) => void }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    listLeads()
      .then(setLeads)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const dueCount = leads.filter(isFollowUpDue).length
  const shown = leads.filter((l) => {
    if (filter === 'all') return true
    if (filter === 'due') return isFollowUpDue(l)
    if (filter === 'watching') return l.watching
    return l.status === filter
  })
  const selected = shown.find((l) => l.id === selectedId) ?? shown[0] ?? null

  function replace(lead: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)))
  }

  async function change(lead: Lead, changes: Partial<Lead>) {
    setError('')
    try {
      replace(await updateLead(lead.id, changes))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setError('')
    try {
      const lead = await addLead({ ...form, name: form.name.trim() })
      setLeads((prev) => [lead, ...prev])
      setSelectedId(lead.id)
      setForm(EMPTY)
      setAdding(false)
      setFilter('all')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove(lead: Lead) {
    setError('')
    try {
      await deleteLead(lead.id)
      setLeads((prev) => prev.filter((l) => l.id !== lead.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function markBooked(lead: Lead) {
    await change(lead, { status: 'booked', follow_up_on: null })
    onBooked(lead)
  }

  function copy(lead: Lead) {
    navigator.clipboard.writeText(draftMessage(lead)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${leads.length}` },
    { key: 'due', label: `Follow up ${dueCount}` },
    { key: 'watching', label: 'Watchlist' },
    ...LEAD_STATUSES,
  ]

  return (
    <div className="gr">
      <div className="gr-top">
        <div className="gr-filters">
          {filters.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'on' : ''}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button className="btn-brass" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : '+ New lead'}
        </button>
      </div>

      {error && <p className="gr-error">{error}</p>}

      {adding && (
        <form className="gr-form" onSubmit={submit}>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            autoFocus
          />
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as LeadKind })}
          >
            {LEAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            value={form.handle}
            onChange={(e) => setForm({ ...form, handle: e.target.value })}
            placeholder="@handle"
          />
          <input
            value={form.event_name}
            onChange={(e) => setForm({ ...form, event_name: e.target.value })}
            placeholder="Event (optional)"
          />
          <input
            type="date"
            value={form.event_date}
            onChange={(e) => setForm({ ...form, event_date: e.target.value })}
            aria-label="Event date"
          />
          <button className="btn-brass" type="submit">
            Add lead
          </button>
        </form>
      )}

      <div className="gr-main">
        <section className="gr-list">
          {loading && <p className="gr-empty">Loading…</p>}
          {!loading && shown.length === 0 && (
            <p className="gr-empty">
              {leads.length === 0 ? 'No leads yet. Add your first promoter or artist.' : 'Nothing here.'}
            </p>
          )}
          {shown.map((l) => (
            <button
              key={l.id}
              className={`gr-row${selected?.id === l.id ? ' selected' : ''}`}
              onClick={() => setSelectedId(l.id)}
            >
              <span className="gr-row-name">
                {l.watching && '★ '}
                {l.name}
              </span>
              <span className="gr-row-meta">
                {l.kind}
                {l.event_name ? ` · ${l.event_name}` : ''}
              </span>
              <span className={`gr-badge${isFollowUpDue(l) ? ' due' : ''}`}>
                {isFollowUpDue(l)
                  ? 'Follow up'
                  : LEAD_STATUSES.find((s) => s.key === l.status)?.label}
              </span>
            </button>
          ))}
        </section>

        <aside className="gr-detail">
          {selected ? (
            <>
              <header>
                <h2>{selected.name}</h2>
                <button
                  className="gr-star"
                  onClick={() => change(selected, { watching: !selected.watching })}
                  aria-pressed={selected.watching}
                >
                  {selected.watching ? '★ Watching' : '☆ Watch'}
                </button>
              </header>
              <div className="gr-body">
                <dl>
                  <dt>Instagram</dt>
                  <dd>{selected.handle || '—'}</dd>
                  <dt>Event</dt>
                  <dd>{selected.event_name || '—'}</dd>
                  <dt>Date</dt>
                  <dd>{selected.event_date ? formatDate(selected.event_date) : '—'}</dd>
                  <dt>Follow up</dt>
                  <dd>{selected.follow_up_on ? formatDate(selected.follow_up_on) : '—'}</dd>
                </dl>

                <h3>{isFollowUpDue(selected) ? 'Follow-up message' : 'Your message'}</h3>
                <p className="gr-message">{draftMessage(selected)}</p>
                <div className="gr-actions">
                  <button className="btn-brass" onClick={() => copy(selected)}>
                    {copied ? 'Copied!' : 'Copy message'}
                  </button>
                  <button className="gallery-btn" onClick={() => change(selected, messagedChanges())}>
                    I sent it
                  </button>
                  <button
                    className="gallery-btn"
                    onClick={() => change(selected, { status: 'replied', follow_up_on: null })}
                  >
                    They replied
                  </button>
                  <button className="gallery-btn" onClick={() => markBooked(selected)}>
                    Booked!
                  </button>
                  <button
                    className="gallery-btn"
                    onClick={() => change(selected, { status: 'passed', follow_up_on: null })}
                  >
                    Pass
                  </button>
                </div>

                <h3>Notes</h3>
                <textarea
                  key={selected.id}
                  defaultValue={selected.notes}
                  rows={3}
                  onBlur={(e) => {
                    if (e.target.value !== selected.notes) change(selected, { notes: e.target.value })
                  }}
                  placeholder="Where you met, what they run, anything useful"
                />
                <button className="gr-delete" onClick={() => remove(selected)}>
                  Delete lead
                </button>
              </div>
            </>
          ) : (
            <p className="gr-empty">Pick a lead to see your message.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
