import { useEffect, useState } from 'react'
import type { PointerEvent } from 'react'
import { supabase } from '../supabase'
import type { Client } from '../types'
import { initials } from '../types'
import { addLead, isFollowUpDue, listLeads } from '../growth'
import type { Lead } from '../growth'
import type { RadarEvent } from './events'
import { fetchEvents, initialsOf } from './events'
import { countdown, parseShootDate, shortDate } from './time'

interface Props {
  clients: Client[]
  tips: string[]
  greetingName: string
  onOpenClient: (client: Client) => void
  onNavigate: (view: 'clients' | 'outreach' | 'posts') => void
}

function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`)
}

function useCountUp(target: number | null): number | null {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target === null) return
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1100)
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return target === null ? null : value
}

function Stat({ label, value, note, onClick, delay }: { label: string; value: number | null; note: string; onClick: () => void; delay: number }) {
  const shown = useCountUp(value)
  return (
    <button className="st-card" style={{ animationDelay: `${delay}s` }} onPointerMove={spotlight} onClick={onClick}>
      <span className="st-label">{label}</span>
      <span className="st-value">{shown === null ? '—' : shown.toLocaleString('en-GB')}</span>
      <span className="st-note">
        <i className="st-live" />
        {note}
      </span>
    </button>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function HomeView({ clients, tips, greetingName, onOpenClient, onNavigate }: Props) {
  const [now, setNow] = useState(Date.now())
  const [tip, setTip] = useState(0)
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [postsWaiting, setPostsWaiting] = useState<number | null>(null)
  const [thisWeek, setThisWeek] = useState<number | null>(null)
  const [events, setEvents] = useState<RadarEvent[] | null>(null)
  const [pitched, setPitched] = useState<string[]>([])
  const [eventError, setEventError] = useState('')

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    const rotate = setInterval(() => setTip((t) => t + 1), 4500)
    return () => {
      clearInterval(clock)
      clearInterval(rotate)
    }
  }, [])

  useEffect(() => {
    listLeads().then(setLeads).catch(() => setLeads([]))
    supabase
      ?.from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('posted', false)
      .then(({ count }) => setPostsWaiting(count ?? 0))
    const weekEnd = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)
    supabase
      ?.from('posts')
      .select('id', { count: 'exact', head: true })
      .eq('posted', false)
      .lte('post_on', weekEnd)
      .then(({ count }) => setThisWeek(count ?? 0))
    fetchEvents()
      .then((all) => setEvents(all.slice(0, 4)))
      .catch((e: Error) => {
        setEvents([])
        setEventError(e.message)
      })
  }, [])

  const upcoming = clients
    .filter((c) => c.stage === 'booked' || c.stage === 'shot')
    .map((c) => ({ client: c, date: parseShootDate(c.shootDate) }))
    .filter((x) => !x.date || x.date.getTime() > now - 86400000)
    .sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))
    .slice(0, 4)

  const leadsToMessage = leads ? leads.filter((l) => l.status === 'to_contact' || isFollowUpDue(l)).length : null
  const followUps = leads ? leads.filter(isFollowUpDue).length : 0
  const needs = (followUps > 0 ? 1 : 0) + clients.filter((c) => c.stage === 'booked' && !c.depositPaid).length
  const shownTip = tips.length ? tips[tip % tips.length] : 'All quiet. A good day to message a few promoters.'

  async function pitch(event: RadarEvent) {
    try {
      await addLead({ name: event.venue || event.name, kind: 'venue', handle: '', event_name: event.name, event_date: event.date })
      setPitched((p) => [...p, event.id])
    } catch (e) {
      setEventError((e as Error).message)
    }
  }

  return (
    <div className="st-home">
      <header className="st-top">
        <div>
          <h1>
            {greeting()}
            {greetingName ? `, ${greetingName}` : ''}
          </h1>
          <p className="st-sub">{needs ? `${needs} ${needs === 1 ? 'thing needs' : 'things need'} you today.` : "You're all caught up."}</p>
        </div>
      </header>

      <div className="st-ticker" aria-live="polite">
        <span className="st-ticker-live">
          <i />
          LIVE
        </span>
        <span className="st-ticker-text" key={tip}>
          {shownTip}
        </span>
        <span className="st-ticker-dots">
          {tips.slice(0, 6).map((_, i) => (
            <b key={i} className={i === tip % Math.min(tips.length, 6) ? 'on' : ''} />
          ))}
        </span>
      </div>

      <section className="st-cards">
        <Stat label="Photos to post" value={postsWaiting} note="Ready in Posts" onClick={() => onNavigate('posts')} delay={0.05} />
        <Stat label="Upcoming shoots" value={upcoming.length} note={upcoming[0]?.date ? `Next: ${shortDate(upcoming[0].date)}` : 'Nothing booked yet'} onClick={() => onNavigate('clients')} delay={0.1} />
        <Stat label="Leads to message" value={leadsToMessage} note={`${followUps} follow-up${followUps === 1 ? '' : 's'} due`} onClick={() => onNavigate('outreach')} delay={0.15} />
        <Stat label="Posts this week" value={thisWeek} note="Scheduled in Posts" onClick={() => onNavigate('posts')} delay={0.2} />
      </section>

      <section className="st-row">
        <div className="st-panel" style={{ animationDelay: '.25s' }}>
          <div className="st-panel-head">
            <h2>Up next</h2>
            <button className="st-ghost" onClick={() => onNavigate('clients')}>
              View all
            </button>
          </div>
          {upcoming.length === 0 && <p className="st-empty">No shoots booked. Sandy's picks are a good place to start.</p>}
          {upcoming.map(({ client: c, date }) => (
            <button className="st-item" key={c.id} onClick={() => onOpenClient(c)}>
              <span className="st-avatar">{initials(c.name)}</span>
              <span className="st-item-text">
                <b>{c.name}</b>
                <small>
                  {c.type || 'Shoot'}
                  {date ? ` · ${shortDate(date)}` : ''}
                </small>
                {date && <span className="st-count">{countdown(date, now)}</span>}
              </span>
              <span className={`st-pill${c.stage === 'booked' && !c.depositPaid ? ' warn' : ''}`}>
                {c.stage === 'shot' ? 'Editing' : c.depositPaid ? 'Booked' : 'Deposit due'}
              </span>
            </button>
          ))}
        </div>

        <div className="st-panel" style={{ animationDelay: '.3s' }}>
          <div className="st-panel-head">
            <h2>Sandy's picks</h2>
            <button className="st-ghost" onClick={() => onNavigate('outreach')}>
              More
            </button>
          </div>
          {events === null && <p className="st-empty st-loading">Sandy is checking London events…</p>}
          {events?.length === 0 && <p className="st-empty">{eventError ? "Couldn't load events right now." : 'No events found.'}</p>}
          {events?.map((e) => {
            const done = pitched.includes(e.id)
            return (
              <div className="st-item" key={e.id}>
                <span className="st-avatar">{initialsOf(e.venue || e.name)}</span>
                <span className="st-item-text">
                  <b>{e.name}</b>
                  <small>
                    {shortDate(new Date(`${e.date}T00:00:00`))} · {e.venue}
                  </small>
                </span>
                <button className="st-pill st-pill-btn" disabled={done} onClick={() => pitch(e)}>
                  {done ? '✓ Lead' : 'Pitch'}
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
