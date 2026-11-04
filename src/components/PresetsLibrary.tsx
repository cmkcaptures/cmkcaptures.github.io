import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'

interface StylePreset {
  id: string
  name: string
  venue: string
  lighting: string
  notes: string
}

const EMPTY = { name: '', venue: '', lighting: '', notes: '' }

export default function PresetsLibrary() {
  const [presets, setPresets] = useState<StylePreset[]>([])
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      ?.from('style_presets')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setPresets(data as StylePreset[])
      })
  }, [])

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !form.name.trim()) return
    setError('')
    const { data, error: failed } = await supabase
      .from('style_presets')
      .insert({ ...form, name: form.name.trim() })
      .select()
      .single()
    if (failed) setError(failed.message)
    else {
      setPresets((prev) => [data as StylePreset, ...prev])
      setForm(EMPTY)
    }
  }

  async function remove(id: string) {
    if (!supabase) return
    const { error: failed } = await supabase.from('style_presets').delete().eq('id', id)
    if (failed) setError(failed.message)
    else setPresets((prev) => prev.filter((p) => p.id !== id))
  }

  const term = search.trim().toLowerCase()
  const shown = presets.filter((p) =>
    [p.name, p.venue, p.lighting, p.notes].some((text) => text.toLowerCase().includes(term)),
  )

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <form className="gr-form" onSubmit={add}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Preset name" />
        <input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="Venue" />
        <input value={form.lighting} onChange={(e) => setForm({ ...form, lighting: e.target.value })} placeholder="Lighting (red, blue, daylight…)" />
        <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="What worked" />
        <button className="btn-brass" type="submit">Save preset</button>
      </form>
      <input className="gr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by venue or lighting" aria-label="Search presets" />
      {shown.length === 0 && <p className="gr-empty">{presets.length ? 'No matches.' : 'Save which preset worked where, so you can reuse it.'}</p>}
      {shown.map((p) => (
        <article className="gr-card" key={p.id}>
          <header>
            <h3>{p.name}</h3>
            <button className="gr-delete gr-delete-inline" onClick={() => remove(p.id)}>Delete</button>
          </header>
          <p className="gr-card-meta">{[p.venue, p.lighting].filter(Boolean).join(' · ') || '—'}</p>
          {p.notes && <p className="gr-card-meta">{p.notes}</p>}
        </article>
      ))}
    </div>
  )
}
