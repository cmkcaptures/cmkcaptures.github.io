import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'

interface Collab {
  id: string
  event: string
  organiser: string
  shoot_date: string
  tags: number
  reposts: number
  leads: number
  notes: string
}

const COUNTERS = [
  { key: 'tags', label: 'Tags' },
  { key: 'reposts', label: 'Reposts' },
  { key: 'leads', label: 'Leads' },
] as const

const EMPTY = { event: '', organiser: '', shoot_date: '' }

export default function CollabTracker() {
  const [collabs, setCollabs] = useState<Collab[]>([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      ?.from('collabs')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setCollabs(data as Collab[])
      })
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !form.event.trim()) return
    setError('')
    const { data, error: failed } = await supabase
      .from('collabs')
      .insert({ ...form, event: form.event.trim() })
      .select()
      .single()
    if (failed) setError(failed.message)
    else {
      setCollabs((prev) => [data as Collab, ...prev])
      setForm(EMPTY)
    }
  }

  async function bump(collab: Collab, key: 'tags' | 'reposts' | 'leads', by: number) {
    if (!supabase) return
    const value = Math.max(0, collab[key] + by)
    setError('')
    const { error: failed } = await supabase.from('collabs').update({ [key]: value }).eq('id', collab.id)
    if (failed) setError(failed.message)
    else setCollabs((prev) => prev.map((c) => (c.id === collab.id ? { ...c, [key]: value } : c)))
  }

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <form className="gr-form" onSubmit={add}>
        <input value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value })} placeholder="Event" />
        <input value={form.organiser} onChange={(e) => setForm({ ...form, organiser: e.target.value })} placeholder="Organiser" />
        <input type="date" aria-label="Date" value={form.shoot_date} onChange={(e) => setForm({ ...form, shoot_date: e.target.value })} />
        <button className="btn-brass" type="submit">Add collab</button>
      </form>
      {collabs.length === 0 && <p className="gr-empty">No collabs yet. Log unpaid shoots to see if they pay off.</p>}
      {collabs.map((c) => (
        <article className="gr-card" key={c.id}>
          <header>
            <h3>{c.event}</h3>
            <span className={`gr-badge${c.leads > 0 ? ' due' : ''}`}>{c.leads > 0 ? 'Paid off' : 'No leads yet'}</span>
          </header>
          <p className="gr-card-meta">{[c.organiser, c.shoot_date].filter(Boolean).join(' · ') || '—'}</p>
          <div className="gr-counters">
            {COUNTERS.map(({ key, label }) => (
              <div className="gr-counter" key={key}>
                <span>{label}</span>
                <button onClick={() => bump(c, key, -1)} aria-label={`Remove from ${label}`}>−</button>
                <b>{c[key]}</b>
                <button onClick={() => bump(c, key, 1)} aria-label={`Add to ${label}`}>+</button>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}
