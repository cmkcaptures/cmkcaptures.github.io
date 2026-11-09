// Promoter memory cards: everyone you've pitched or shot for, in one profile each.
import { useEffect, useMemo, useState } from 'react'
import type { Client } from '../types'
import { initials, thumbGradient, paymentStatus } from '../types'
import type { Lead } from '../growth'
import { listLeads } from '../growth'
import { supabase } from '../supabase'
import { parseShootDate, shortDate } from './time'
import { sandyWrite } from './sandyWrite'
import Portal from './Portal'
import type { Partner } from './shareApi'
import { findPartner, partnerLink, savePartner } from './shareApi'
import './People.css'

interface Person {
  key: string
  name: string
  kind: string
  handles: string[]
  leads: Lead[]
  clients: Client[]
  notes: string[]
  lastDate: Date | null
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function nextPitch(p: Person): { date: Date; why: string } | null {
  const rebook = p.clients.map((c) => c.rebookOn).filter(Boolean).sort().pop()
  if (rebook) return { date: new Date(`${rebook}T00:00:00`), why: 'your rebook reminder' }
  if (!p.lastDate) return null
  const d = new Date(p.lastDate.getTime() + 21 * 86400000)
  return { date: d, why: 'about 3 weeks after their last night, before the next one' }
}

export default function PeopleView({ clients }: { clients: Client[] }) {
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [facts, setFacts] = useState<{ title: string; body: string }[]>([])
  const [open, setOpen] = useState<Person | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    listLeads().then(setLeads).catch(() => setLeads([]))
    supabase
      ?.from('sandy_knowledge')
      .select('title,body')
      .then(({ data }) => setFacts((data ?? []) as { title: string; body: string }[]))
  }, [])

  const people = useMemo(() => {
    const map = new Map<string, Person>()
    const get = (name: string, kind: string) => {
      const key = norm(name)
      if (!key) return null
      if (!map.has(key)) map.set(key, { key, name, kind, handles: [], leads: [], clients: [], notes: [], lastDate: null })
      return map.get(key)!
    }
    for (const l of leads ?? []) {
      const p = get(l.name, l.kind)
      if (!p) continue
      p.leads.push(l)
      if (l.handle && !p.handles.includes(l.handle)) p.handles.push(l.handle)
      if (l.notes) p.notes.push(l.notes)
      const d = l.event_date ? new Date(`${l.event_date}T00:00:00`) : null
      if (d && (!p.lastDate || d > p.lastDate)) p.lastDate = d
    }
    for (const c of clients) {
      const p = get(c.name, c.type || 'client')
      if (!p) continue
      p.clients.push(c)
      const handle = c.contact.match(/@[\w.]+/)?.[0]
      if (handle && !p.handles.includes(handle)) p.handles.push(handle)
      if (c.notes) p.notes.push(c.notes)
      const d = parseShootDate(c.shootDate)
      if (d && (!p.lastDate || d > p.lastDate)) p.lastDate = d
    }
    for (const p of map.values()) {
      const n = p.name.toLowerCase()
      for (const f of facts) if (n.length > 2 && `${f.title} ${f.body}`.toLowerCase().includes(n)) p.notes.push(f.body)
    }
    return [...map.values()].sort((a, b) => (b.lastDate?.getTime() ?? 0) - (a.lastDate?.getTime() ?? 0))
  }, [leads, clients, facts])

  const term = search.trim().toLowerCase()
  const shown = people.filter((p) => `${p.name} ${p.handles.join(' ')} ${p.leads.map((l) => l.event_name).join(' ')}`.toLowerCase().includes(term))

  return (
    <div className="pp">
      <input className="gr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, handles or nights" aria-label="Search people" />
      {leads === null && <p className="st-empty st-loading">Loading people…</p>}
      {leads && !people.length && <p className="st-empty">Nobody yet. Every lead and client you add gets a card here.</p>}
      <div className="pp-grid">
        {shown.map((p, i) => {
          const due = nextPitch(p)
          const overdue = due && due.date.getTime() <= Date.now()
          return (
            <button key={p.key} className="pp-card" onClick={() => setOpen(p)} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
              <span className="pp-avatar" style={{ background: thumbGradient(p.key) }}>
                {initials(p.name)}
              </span>
              <span className="pp-text">
                <b>{p.name}</b>
                <small>{[p.kind, p.handles[0]].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="pp-stats">
                <em>{p.clients.length} booked</em>
                <em>{p.leads.length} pitched</em>
              </span>
              {due && <span className={`pp-next${overdue ? ' now' : ''}`}>{overdue ? 'Pitch again now' : `Pitch again ${shortDate(due.date)}`}</span>}
            </button>
          )
        })}
      </div>
      {open && <PersonCard person={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function PersonCard({ person: p, onClose }: { person: Person; onClose: () => void }) {
  const [pitch, setPitch] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const due = nextPitch(p)
  const [partner, setPartner] = useState<Partner | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  useEffect(() => {
    findPartner(p.name).then(setPartner).catch(() => {})
  }, [p.name])

  async function sharePortal() {
    const saved = await savePartner(p.name, p.handles[0] ?? '', p.clients.map((c) => c.id))
    setPartner(saved)
    await navigator.clipboard.writeText(partnerLink(saved.token))
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1800)
  }

  const history = [
    ...p.clients.map((c) => ({ when: parseShootDate(c.shootDate), text: `Shot ${c.type || 'a shoot'}${c.price ? ` · ${c.price}` : ''} · ${paymentStatus(c)}`, booked: true })),
    ...p.leads.map((l) => ({ when: l.event_date ? new Date(`${l.event_date}T00:00:00`) : null, text: `${l.event_name || 'Pitched'} · ${l.status.replace('_', ' ')}`, booked: false })),
  ].sort((a, b) => (b.when?.getTime() ?? 0) - (a.when?.getTime() ?? 0))

  async function write() {
    setBusy(true)
    setCopied(false)
    const text = await sandyWrite(
      `Write a short Instagram DM from me to ${p.name} (${p.kind}) to pitch shooting their next night. Our history: ${history.map((h) => h.text).join('; ') || 'none yet'}. Notes: ${p.notes.join(' | ').slice(0, 400) || 'none'}. Be warm and specific, reference past work together if any, mention 48h delivery. 3-4 sentences.`,
    )
    setPitch(text ?? `Hey ${p.name.split(' ')[0]}! Hope the last night went well. Got anything coming up? I'd love to shoot it, gallery back within 48 hours as always.`)
    setBusy(false)
  }

  async function teach() {
    if (!note.trim()) return
    const { error } = (await supabase?.from('sandy_knowledge').insert({ topic: 'contacts', title: p.name, body: `${p.name}: ${note.trim()}` })) ?? {}
    if (!error) {
      setSaved(true)
      setNote('')
    }
  }

  return (
    <Portal>
      <div className="ps-drawer-wrap" onClick={onClose}>
        <aside className="ps-drawer pp-drawer" onClick={(e) => e.stopPropagation()} aria-label={p.name}>
          <header>
            <span className="pp-avatar big" style={{ background: thumbGradient(p.key) }}>
              {initials(p.name)}
            </span>
            <div className="pp-title">
              <h2>{p.name}</h2>
              <small>{[p.kind, ...p.handles].join(' · ')}</small>
            </div>
            <button className="st-ghost" onClick={onClose}>
              Close
            </button>
          </header>

          <div className="pp-chips">
            <span>
              <b>{p.clients.length}</b> booked
            </span>
            <span>
              <b>{p.leads.length}</b> pitched
            </span>
            {due && (
              <span className={due.date.getTime() <= Date.now() ? 'now' : ''}>
                Next pitch <b>{shortDate(due.date)}</b>
              </span>
            )}
          </div>
          {due && <p className="ps-hint">Suggested from {due.why}.</p>}

          <h3 className="ps-label">History</h3>
          {history.length ? (
            <ol className="pp-timeline">
              {history.map((h, i) => (
                <li key={i} className={h.booked ? 'booked' : ''}>
                  <i />
                  <span>
                    <b>{h.when ? shortDate(h.when) : 'No date'}</b> {h.text}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="st-empty">Nothing yet.</p>
          )}

          <h3 className="ps-label">What you know</h3>
          {p.notes.length ? (
            <ul className="pp-notes">
              {[...new Set(p.notes)].map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="st-empty">No notes yet.</p>
          )}
          <div className="pp-teach">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && teach()} placeholder="e.g. pays on the night, runs a monthly at XOYO" />
            <button className="st-ghost" onClick={teach} disabled={!note.trim()}>
              {saved ? 'Saved ✓' : 'Teach Sandy'}
            </button>
          </div>

          <h3 className="ps-label">Partner portal</h3>
          <div className="pp-portal">
            <p>A private page for them: every night you've shot together, their galleries, payment status and a one-tap rebook.</p>
            <div className="ps-footer">
              <button className="btn-brass" onClick={sharePortal} disabled={!p.clients.length}>
                {linkCopied ? 'Link copied!' : partner ? 'Update + copy link' : 'Create + copy link'}
              </button>
              {partner && (
                <a className="st-ghost" href={partnerLink(partner.token)} target="_blank" rel="noreferrer">
                  Open ↗
                </a>
              )}
            </div>
            {!p.clients.length && <small className="ps-hint">Available once you've shot for them.</small>}
          </div>

          <h3 className="ps-label">Pitch</h3>
          {pitch !== null && <textarea className="ev-draft" rows={6} value={pitch} onChange={(e) => setPitch(e.target.value)} />}
          <div className="ps-footer">
            <button className="btn-brass" onClick={write} disabled={busy}>
              {busy ? 'Sandy is writing…' : pitch ? '↻ Rewrite' : '✦ Write a pitch'}
            </button>
            {pitch && (
              <button className="st-ghost" onClick={() => navigator.clipboard.writeText(pitch).then(() => setCopied(true))}>
                {copied ? 'Copied!' : 'Copy DM'}
              </button>
            )}
          </div>
        </aside>
      </div>
    </Portal>
  )
}
