import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { addLead } from '../growth'
import type { RadarEvent } from './events'
import { fetchEvents, initialsOf } from './events'
import { shortDate } from './time'
import { sandyWrite } from './sandyWrite'

/** How likely a night is to want (and pay) a photographer, 0-100. Free and rule-based. */
export function fitScore(e: RadarEvent): { score: number; why: string[] } {
  const text = `${e.name} ${e.description}`.toLowerCase()
  const why: string[] = []
  let s = 40
  const days = Math.round((new Date(`${e.date}T00:00:00`).getTime() - Date.now()) / 86400000)
  if (days >= 4 && days <= 21) (s += 15), why.push('enough time to pitch')
  else if (days < 2) (s -= 15), why.push('too soon')
  const dow = new Date(`${e.date}T00:00:00`).getDay()
  if (dow === 5 || dow === 6) (s += 10), why.push('Fri/Sat')
  if (/launch|birthday|anniversary|showcase|festival|takeover|headline|all ?night|album|tour/.test(text)) (s += 15), why.push('big-night energy')
  if (/afro|amapiano|r&b|rnb|hip ?hop|grime|drill|bashment|dancehall|house|garage|ukg/.test(text)) (s += 10), why.push('your scene')
  if (/(every|weekly) (monday|tuesday|wednesday|thursday|sunday)|residency/.test(text)) (s += 5), why.push('recurring = repeat work')
  if (/student|freshers/.test(text)) (s -= 5), why.push('student budget')
  if (/photographer|photos? by|media team/.test(text)) (s -= 15), why.push('may already have a photographer')
  return { score: Math.max(0, Math.min(100, s)), why }
}

export default function EventsList() {
  const [events, setEvents] = useState<RadarEvent[] | null>(null)
  const [search, setSearch] = useState('')
  const [pitched, setPitched] = useState<string[]>([])
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<{ event: RadarEvent; text: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e: Error) => {
        setEvents([])
        setError(e.message)
      })
  }, [])

  async function openPitch(event: RadarEvent) {
    setDraft({ event, text: null })
    setCopied(false)
    const ai = await sandyWrite(
      `Write a short Instagram DM from me (CMK Captures, London nightlife photographer, @cmk._7) to the promoter of "${event.name}" at ${event.venue} on ${event.date}. Event info: ${event.description.slice(0, 250)}. Be casual and confident, mention something specific about their night, offer to shoot it, mention 48h gallery delivery and that they can see my work on my page. 3-5 sentences, no hashtags, no placeholders.`,
    )
    setDraft({
      event,
      text:
        ai ??
        `Hey! Saw ${event.name} at ${event.venue} on ${event.date} and it looks like a proper night. I shoot London nightlife (@cmk._7) and would love to cover it for you. Gallery back within 48 hours, ready for your page. Got a couple of dates free, let me know!`,
    })
  }

  async function saveLead() {
    if (!draft?.text) return
    try {
      await addLead({ name: draft.event.venue || draft.event.name, kind: 'promoter', handle: '', event_name: draft.event.name, event_date: draft.event.date })
      setPitched((p) => [...p, draft.event.id])
      setDraft(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const term = search.trim().toLowerCase()
  const shown = (events ?? [])
    .filter((e) => `${e.name} ${e.venue} ${e.area}`.toLowerCase().includes(term))
    .map((e) => ({ e, fit: fitScore(e) }))
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, 40)

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <input className="gr-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events, venues or areas" aria-label="Search events" />
      {events === null && <p className="st-empty st-loading">Scanning London events…</p>}
      {events && shown.length === 0 && <p className="st-empty">No events match.</p>}
      <div className="st-panel st-list-panel">
        {shown.map(({ e, fit }) => {
          const done = pitched.includes(e.id)
          const tier = fit.score >= 75 ? 'hot' : fit.score >= 55 ? 'warm' : 'cool'
          return (
            <div className="st-item" key={e.id}>
              <span className={`ev-score ${tier}`} title={fit.why.join(' · ')}>
                {fit.score}
              </span>
              <span className="st-item-text">
                <b>{e.name}</b>
                <small>
                  {shortDate(new Date(`${e.date}T00:00:00`))} · {e.venue}
                  {e.area ? `, ${e.area}` : ''}
                  {fit.why.length ? ` · ${fit.why.slice(0, 2).join(', ')}` : ''}
                </small>
              </span>
              <a className="st-ghost" href={e.link} target="_blank" rel="noopener noreferrer">
                View
              </a>
              <button className="st-pill st-pill-btn" disabled={done} onClick={() => openPitch(e)}>
                {done ? '✓ Lead' : '✦ Pitch'}
              </button>
            </div>
          )
        })}
      </div>

      {draft &&
        createPortal(
        <div className="app-portal"><div className="ps-drawer-wrap ps-center" onClick={() => setDraft(null)}>
          <div className="ps-reminder" onClick={(ev) => ev.stopPropagation()} role="dialog" aria-label="Pitch">
            <h2>Pitch {(draft.event.venue || draft.event.name).replace(/,s*$/, '')}</h2>
            <p>
              {initialsOf(draft.event.name)} · {draft.event.name} · {draft.event.date}
            </p>
            {draft.text === null ? (
              <p className="st-empty st-loading">Sandy is writing it…</p>
            ) : (
              <textarea className="ev-draft" rows={7} value={draft.text} onChange={(ev) => setDraft({ ...draft, text: ev.target.value })} />
            )}
            <div className="ps-footer">
              <button
                className="btn-brass"
                disabled={!draft.text}
                onClick={() =>
                  navigator.clipboard.writeText(draft.text ?? '').then(() => {
                    setCopied(true)
                  })
                }
              >
                {copied ? 'Copied!' : 'Copy DM'}
              </button>
              <button className="st-ghost" disabled={!draft.text} onClick={saveLead}>
                Save as lead
              </button>
              <button className="st-ghost" disabled={!draft.text} onClick={() => openPitch(draft.event)}>
                ↻ Rewrite
              </button>
            </div>
          </div>
        </div></div>,
        document.body,
        )}
    </div>
  )
}
