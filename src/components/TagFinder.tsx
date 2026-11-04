import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'
import { addLead } from '../growth'

interface Person {
  id: string
  shoot: string
  name: string
  handle: string
  sent: boolean
  tagged: boolean
}

const EMPTY = { shoot: '', name: '', handle: '' }

function sendMessage(person: Person): string {
  const hello = person.name.trim().split(/\s+/)[0]
  return `Yo${hello ? ` ${hello}` : ''}, got this of you from ${person.shoot} 🔥 Want the full-res? Tag @cmk._7 if you post it!`
}

export default function TagFinder() {
  const [people, setPeople] = useState<Person[]>([])
  const [form, setForm] = useState(EMPTY)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [leadIds, setLeadIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      ?.from('shoot_people')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setPeople(data as Person[])
      })
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !form.shoot.trim() || !(form.name.trim() || form.handle.trim())) return
    setError('')
    const { data, error: failed } = await supabase
      .from('shoot_people')
      .insert({ shoot: form.shoot.trim(), name: form.name.trim(), handle: form.handle.trim() })
      .select()
      .single()
    if (failed) setError(failed.message)
    else {
      setPeople((prev) => [data as Person, ...prev])
      setForm({ ...EMPTY, shoot: form.shoot })
    }
  }

  async function toggle(person: Person, key: 'sent' | 'tagged') {
    if (!supabase) return
    const value = !person[key]
    const { error: failed } = await supabase.from('shoot_people').update({ [key]: value }).eq('id', person.id)
    if (failed) setError(failed.message)
    else setPeople((prev) => prev.map((p) => (p.id === person.id ? { ...p, [key]: value } : p)))
  }

  async function remove(id: string) {
    if (!supabase) return
    const { error: failed } = await supabase.from('shoot_people').delete().eq('id', id)
    if (failed) setError(failed.message)
    else setPeople((prev) => prev.filter((p) => p.id !== id))
  }

  async function makeLead(person: Person) {
    setError('')
    try {
      await addLead({
        name: person.name || person.handle,
        kind: 'model',
        handle: person.handle,
        event_name: person.shoot,
        event_date: '',
      })
      setLeadIds((prev) => [...prev, person.id])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function copy(person: Person) {
    navigator.clipboard.writeText(sendMessage(person)).then(() => {
      setCopiedId(person.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const handles = people.filter((p) => !p.tagged && p.handle).map((p) => p.handle)

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <form className="gr-form" onSubmit={add}>
        <input value={form.shoot} onChange={(e) => setForm({ ...form, shoot: e.target.value })} placeholder="Shoot (e.g. Echelon)" />
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
        <input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@handle" />
        <button className="btn-brass" type="submit">Add person</button>
      </form>
      {handles.length > 0 && <p className="gr-card-meta">Still to tag: {handles.join(' ')}</p>}
      {people.length === 0 && <p className="gr-empty">Log who's in your photos, so you can send them their shot and tag them.</p>}
      {people.map((p) => (
        <article className={`gr-card${p.sent && p.tagged ? ' done' : ''}`} key={p.id}>
          <header>
            <h3>{p.name || p.handle}</h3>
            <span className="gr-badge">{p.shoot}</span>
          </header>
          {p.handle && p.name && <p className="gr-card-meta">{p.handle}</p>}
          <p className="gr-message">{sendMessage(p)}</p>
          <div className="gr-actions">
            <button className="btn-brass" onClick={() => copy(p)}>{copiedId === p.id ? 'Copied!' : 'Copy message'}</button>
            <button className="gallery-btn" onClick={() => toggle(p, 'sent')} aria-pressed={p.sent}>{p.sent ? '✓ Sent' : 'Mark sent'}</button>
            <button className="gallery-btn" onClick={() => toggle(p, 'tagged')} aria-pressed={p.tagged}>{p.tagged ? '✓ Tagged' : 'Mark tagged'}</button>
            <button className="gallery-btn" disabled={leadIds.includes(p.id)} onClick={() => makeLead(p)}>{leadIds.includes(p.id) ? '✓ Lead added' : 'Make a lead'}</button>
            <button className="gallery-btn" onClick={() => remove(p.id)}>Remove</button>
          </div>
        </article>
      ))}
    </div>
  )
}
