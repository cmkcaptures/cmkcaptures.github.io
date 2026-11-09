// One month view of everything: shoots, planned posts, events you're pitching, reminders.
import { useEffect, useMemo, useState } from 'react'
import type { Client } from '../types'
import { supabase } from '../supabase'
import { listLeads } from '../growth'
import { parseShootDate } from './time'
import './Calendar.css'

type Kind = 'shoot' | 'post' | 'pitch' | 'reminder'
interface Item {
  kind: Kind
  date: string
  title: string
  sub?: string
}

const KIND_LABEL: Record<Kind, string> = { shoot: 'Shoots', post: 'Posts', pitch: 'Pitched nights', reminder: 'Reminders' }
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

export default function CalendarView({ clients, onOpenClient }: { clients: Client[]; onOpenClient: (c: Client) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [extra, setExtra] = useState<Item[]>([])
  const [show, setShow] = useState<Record<Kind, boolean>>({ shoot: true, post: true, pitch: true, reminder: true })
  const [picked, setPicked] = useState<string>(iso(new Date()))

  useEffect(() => {
    Promise.all([
      supabase?.from('posts').select('caption,post_on,photos').eq('posted', false).not('post_on', 'is', null).then((r) => r.data ?? []) ?? [],
      supabase?.from('sandy_reminders').select('text,due_on').eq('done', false).not('due_on', 'is', null).then((r) => r.data ?? []) ?? [],
      listLeads().catch(() => []),
    ]).then(([posts, rems, leads]) => {
      const items: Item[] = []
      for (const p of posts as { caption: string; post_on: string; photos: unknown[] }[]) items.push({ kind: 'post', date: p.post_on, title: p.caption.split('\n')[0].slice(0, 60) || 'Planned post', sub: `${p.photos.length} photo${p.photos.length === 1 ? '' : 's'}` })
      for (const r of rems as { text: string; due_on: string }[]) items.push({ kind: 'reminder', date: r.due_on, title: r.text })
      for (const l of leads) if (l.event_date && l.status !== 'passed') items.push({ kind: 'pitch', date: l.event_date.slice(0, 10), title: l.event_name || l.name, sub: `${l.name} · ${l.status.replace('_', ' ')}` })
      setExtra(items)
    })
  }, [])

  const items = useMemo(() => {
    const shoots: Item[] = clients
      .map((c) => ({ c, d: parseShootDate(c.shootDate) }))
      .filter((x) => x.d)
      .map(({ c, d }) => ({ kind: 'shoot' as Kind, date: iso(d!), title: c.name, sub: `${c.type || 'Shoot'} · ${c.stage}` }))
    return [...shoots, ...extra].filter((i) => show[i.kind])
  }, [clients, extra, show])

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i])
    return m
  }, [items])

  const startPad = (month.getDay() + 6) % 7
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((startPad + daysIn) / 7) * 7 }, (_, i) => {
    const day = i - startPad + 1
    return day >= 1 && day <= daysIn ? new Date(month.getFullYear(), month.getMonth(), day) : null
  })
  const today = iso(new Date())
  const dayItems = byDay.get(picked) ?? []
  const shootsThisMonth = items.filter((i) => i.kind === 'shoot' && i.date.startsWith(iso(month).slice(0, 7))).length
  const freeWeekends = cells.filter((d) => d && (d.getDay() === 5 || d.getDay() === 6) && iso(d) >= today && !(byDay.get(iso(d)) ?? []).some((i) => i.kind === 'shoot')).length

  return (
    <div className="cal">
      <div className="cal-top">
        <div className="cal-month">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">
            ‹
          </button>
          <h2 key={month.toISOString()}>{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</h2>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="cal-sum">
          <span>
            <b>{shootsThisMonth}</b> shoots
          </span>
          <span>
            <b>{freeWeekends}</b> free Fri/Sat nights left
          </span>
        </div>
        <div className="cal-keys">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className={`k-${k}${show[k] ? ' on' : ''}`} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>
              <i />
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="cal-body">
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <span key={d} className="cal-dow">
              {d}
            </span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} className="cal-cell empty" />
            const key = iso(d)
            const list = byDay.get(key) ?? []
            const weekend = d.getDay() === 5 || d.getDay() === 6
            const hasShoot = list.some((x) => x.kind === 'shoot')
            return (
              <button
                key={key}
                className={`cal-cell${key === today ? ' today' : ''}${key === picked ? ' on' : ''}${key < today ? ' past' : ''}${weekend && !hasShoot && key >= today ? ' free' : ''}`}
                onClick={() => setPicked(key)}
                style={{ animationDelay: `${(i % 7) * 0.02 + Math.floor(i / 7) * 0.03}s` }}
              >
                <span className="cal-num">{d.getDate()}</span>
                <span className="cal-dots">
                  {list.slice(0, 4).map((x, j) => (
                    <i key={j} className={`k-${x.kind}`} />
                  ))}
                </span>
                {hasShoot && <span className="cal-tag">{list.find((x) => x.kind === 'shoot')!.title}</span>}
              </button>
            )
          })}
        </div>

        <aside className="cal-day">
          <h3>{new Date(`${picked}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
          {!dayItems.length && <p className="st-empty">Nothing on. {[5, 6].includes(new Date(`${picked}T00:00:00`).getDay()) && picked >= today ? 'Free weekend night: worth pitching an event.' : ''}</p>}
          {dayItems.map((x, i) => (
            <button
              key={i}
              className={`cal-item k-${x.kind}`}
              onClick={() => {
                if (x.kind === 'shoot') {
                  const c = clients.find((c) => c.name === x.title)
                  if (c) onOpenClient(c)
                }
              }}
            >
              <i />
              <span>
                <b>{x.title}</b>
                {x.sub && <small>{x.sub}</small>}
              </span>
              <em>{x.kind}</em>
            </button>
          ))}
        </aside>
      </div>
    </div>
  )
}
