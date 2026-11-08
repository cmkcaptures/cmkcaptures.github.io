import { useEffect, useState } from 'react'
import { addLead } from '../growth'
import type { RadarEvent } from './events'
import { fetchEvents, initialsOf } from './events'
import { shortDate } from './time'

export default function EventsList() {
  const [events, setEvents] = useState<RadarEvent[] | null>(null)
  const [search, setSearch] = useState('')
  const [pitched, setPitched] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e: Error) => {
        setEvents([])
        setError(e.message)
      })
  }, [])

  async function pitch(event: RadarEvent) {
    try {
      await addLead({ name: event.venue || event.name, kind: 'venue', handle: '', event_name: event.name, event_date: event.date })
      setPitched((p) => [...p, event.id])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const term = search.trim().toLowerCase()
  const shown = (events ?? []).filter((e) => `${e.name} ${e.venue} ${e.area}`.toLowerCase().includes(term)).slice(0, 40)

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <input className="gr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, venues or areas" aria-label="Search events" />
      {events === null && <p className="st-empty st-loading">Loading London events…</p>}
      {events && shown.length === 0 && <p className="st-empty">No events match.</p>}
      <div className="st-panel st-list-panel">
        {shown.map((e) => {
          const done = pitched.includes(e.id)
          return (
            <div className="st-item" key={e.id}>
              <span className="st-avatar">{initialsOf(e.venue || e.name)}</span>
              <span className="st-item-text">
                <b>{e.name}</b>
                <small>
                  {shortDate(new Date(`${e.date}T00:00:00`))} · {e.venue}
                  {e.area ? `, ${e.area}` : ''}
                </small>
              </span>
              <a className="st-ghost" href={e.link} target="_blank" rel="noopener noreferrer">
                View
              </a>
              <button className="st-pill st-pill-btn" disabled={done} onClick={() => pitch(e)}>
                {done ? '✓ Lead' : 'Pitch'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
