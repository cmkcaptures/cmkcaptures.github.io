import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface Fact {
  id: string
  topic: string
  title: string
  body: string
  pinned: boolean
}

const TOPICS: Record<string, string> = {
  me: 'About me',
  business: 'Business',
  gear: 'Gear',
  craft: 'Shooting',
  style: 'Editing & style',
  growth: 'Growth',
  contacts: 'Contacts',
  venues: 'Venues',
  studio: 'The app',
  general: 'General',
}

export default function BrainPanel() {
  const [facts, setFacts] = useState<Fact[] | null>(null)
  const [topic, setTopic] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Fact | null>(null)
  const [error, setError] = useState('')

  async function load() {
    const { data, error } = (await supabase?.from('sandy_knowledge').select('id,topic,title,body,pinned').order('created_at')) ?? {}
    if (error) setError(error.message)
    setFacts((data ?? []) as Fact[])
  }
  useEffect(() => {
    load()
  }, [])

  async function save(f: Fact) {
    setError('')
    const row = { topic: f.topic, title: f.title.trim() || f.body.slice(0, 40), body: f.body.trim(), pinned: f.pinned, updated_at: new Date().toISOString() }
    if (!row.body) return
    const res = f.id ? await supabase!.from('sandy_knowledge').update(row).eq('id', f.id) : await supabase!.from('sandy_knowledge').insert(row)
    if (res.error) return setError(res.error.message)
    setEditing(null)
    load()
  }

  async function remove(f: Fact) {
    await supabase?.from('sandy_knowledge').delete().eq('id', f.id)
    setEditing(null)
    setFacts((list) => list?.filter((x) => x.id !== f.id) ?? null)
  }

  const term = search.trim().toLowerCase()
  const shown = (facts ?? []).filter((f) => (topic === 'all' || f.topic === topic) && `${f.title} ${f.body}`.toLowerCase().includes(term))
  const counts = (facts ?? []).reduce<Record<string, number>>((c, f) => ((c[f.topic] = (c[f.topic] ?? 0) + 1), c), {})

  return (
    <section className="sp-card br">
      <div className="br-head">
        <div>
          <h2>
            Her brain <span className="br-count">{facts?.length ?? '…'} facts</span>
          </h2>
          <p className="sp-push-text">Everything Sandy knows about you and the business. She reads the relevant bits before every answer. Tell her “remember that …” in chat, or add it here.</p>
        </div>
        <button className="btn-brass" onClick={() => setEditing({ id: '', topic: topic === 'all' ? 'general' : topic, title: '', body: '', pinned: false })}>
          + Teach her
        </button>
      </div>

      <div className="br-filters">
        <button className={topic === 'all' ? 'on' : ''} onClick={() => setTopic('all')}>
          All
        </button>
        {Object.entries(TOPICS)
          .filter(([k]) => counts[k])
          .map(([k, label]) => (
            <button key={k} className={topic === k ? 'on' : ''} onClick={() => setTopic(k)}>
              {label} <em>{counts[k]}</em>
            </button>
          ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search her brain" aria-label="Search knowledge" />
      </div>
      {error && <p className="gr-error">{error}</p>}

      {editing && (
        <div className="br-edit">
          <div className="br-edit-row">
            <select value={editing.topic} onChange={(e) => setEditing({ ...editing, topic: e.target.value })}>
              {Object.entries(TOPICS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Short title" />
            <label className="br-pin">
              <input type="checkbox" checked={editing.pinned} onChange={(e) => setEditing({ ...editing, pinned: e.target.checked })} /> Always in mind
            </label>
          </div>
          <textarea rows={4} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} placeholder="What should she know? Write it how you'd say it." autoFocus />
          <div className="ps-footer">
            <button className="btn-brass" onClick={() => save(editing)}>
              Save
            </button>
            <button className="st-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            {editing.id && (
              <button className="gr-delete" onClick={() => remove(editing)}>
                Forget this
              </button>
            )}
          </div>
        </div>
      )}

      <div className="br-grid">
        {facts === null && <p className="st-empty st-loading">Loading…</p>}
        {shown.map((f, i) => (
          <button key={f.id} className="br-fact" onClick={() => setEditing(f)} style={{ animationDelay: `${Math.min(i, 15) * 0.03}s` }}>
            <span className="br-topic">
              {TOPICS[f.topic] ?? f.topic}
              {f.pinned && <i title="Always in mind">●</i>}
            </span>
            <b>{f.title}</b>
            <small>{f.body}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
