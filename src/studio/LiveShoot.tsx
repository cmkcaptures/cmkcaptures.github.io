import { useEffect, useRef, useState } from 'react'
import type { Client } from '../types'
import LiveWallPanel from './LiveWallPanel'
import './LiveShoot.css'

interface Shot {
  id: string
  label: string
  must?: boolean
}

const LISTS: Record<string, Shot[]> = {
  club: [
    { id: 'venue', label: 'Venue exterior / sign', must: true },
    { id: 'empty', label: 'Room before it fills (detail + lights)' },
    { id: 'dj', label: 'DJ in the booth, flash + ambient', must: true },
    { id: 'djcrowd', label: 'DJ with crowd behind, wide', must: true },
    { id: 'crowdwide', label: 'Crowd wide from high up', must: true },
    { id: 'hands', label: 'Hands-up moment on a drop' },
    { id: 'candids', label: '10+ candids on the floor' },
    { id: 'groups', label: 'Group shots (ask, 3 frames each)', must: true },
    { id: 'bar', label: 'Bar / drinks / brand details' },
    { id: 'promoter', label: 'Promoter + team portrait', must: true },
    { id: 'headliner', label: 'Headliner close-up', must: true },
    { id: 'peak', label: 'Peak-time energy wide' },
  ],
  portrait: [
    { id: 'wide', label: 'Wide environmental', must: true },
    { id: 'half', label: 'Half body', must: true },
    { id: 'close', label: 'Tight close-up', must: true },
    { id: 'profile', label: 'Profile / side light' },
    { id: 'movement', label: 'Movement / walking' },
    { id: 'detail', label: 'Details: hands, outfit, jewellery' },
    { id: 'flash', label: 'Flash look' },
    { id: 'alt', label: 'Second location or outfit' },
  ],
}

function listFor(type: string): Shot[] {
  return /portrait|model|headshot/i.test(type) ? LISTS.portrait : LISTS.club
}

const NUDGE_MINUTES = 20

export default function LiveShoot({ client, onClose }: { client: Client; onClose: () => void }) {
  const key = `live.${client.id}`
  const shots = listFor(client.type)
  const [state, setState] = useState<{ start: number; hours: number; done: string[] }>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '') as { start: number; hours: number; done: string[] }
    } catch {
      return { start: Date.now(), hours: 3, done: [] }
    }
  })
  const [now, setNow] = useState(Date.now())
  const [nudge, setNudge] = useState('')
  const lastNudge = useRef(Date.now())

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Progress is a convenience.
    }
  }, [key, state])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    let lock: { release: () => Promise<void> } | null = null
    ;(navigator as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => {
      clearInterval(id)
      lock?.release().catch(() => {})
    }
  }, [])

  const elapsed = now - state.start
  const total = state.hours * 3600000
  const left = Math.max(0, total - elapsed)
  const missingMust = shots.filter((s) => s.must && !state.done.includes(s.id))

  useEffect(() => {
    if (now - lastNudge.current < NUDGE_MINUTES * 60000 || !missingMust.length) return
    lastNudge.current = now
    setNudge(`Still need: ${missingMust.slice(0, 2).map((s) => s.label).join(', ')}`)
    navigator.vibrate?.([120, 80, 120])
  }, [now, missingMust])

  function toggle(id: string) {
    setState((s) => ({ ...s, done: s.done.includes(id) ? s.done.filter((x) => x !== id) : [...s.done, id] }))
    navigator.vibrate?.(30)
  }

  const fmt = (ms: number) => {
    const m = Math.floor(ms / 60000)
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  }
  const pct = Math.min(100, (elapsed / total) * 100)
  const doneCount = state.done.length

  return (
    <div className="ls" role="dialog" aria-label="Live shoot">
      <header className="ls-top">
        <div>
          <span className="ls-live">
            <i /> LIVE
          </span>
          <h1>{client.name}</h1>
        </div>
        <button className="ls-close" onClick={onClose}>
          End
        </button>
      </header>

      <section className="ls-clock">
        <div className="ls-ring" style={{ ['--p' as string]: `${pct}%` }}>
          <b>{fmt(left)}</b>
          <small>left</small>
        </div>
        <div className="ls-stats">
          <span>
            <b>{fmt(elapsed)}</b> in
          </span>
          <span>
            <b>
              {doneCount}/{shots.length}
            </b>{' '}
            shots
          </span>
          <span className={missingMust.length ? 'warn' : 'ok'}>
            <b>{missingMust.length}</b> must-gets left
          </span>
          <div className="ls-hours">
            {[2, 3, 4, 5].map((h) => (
              <button key={h} className={state.hours === h ? 'on' : ''} onClick={() => setState((s) => ({ ...s, hours: h }))}>
                {h}h
              </button>
            ))}
          </div>
        </div>
      </section>

      {nudge && (
        <button className="ls-nudge" onClick={() => setNudge('')}>
          ⚡ {nudge}
        </button>
      )}

      <section className="ls-list">
        {shots.map((s) => {
          const done = state.done.includes(s.id)
          return (
            <button key={s.id} className={`ls-shot${done ? ' done' : ''}${s.must ? ' must' : ''}`} onClick={() => toggle(s.id)}>
              <i>{done ? '✓' : ''}</i>
              <span>{s.label}</span>
              {s.must && !done && <em>must</em>}
            </button>
          )
        })}
      </section>

      <LiveWallPanel client={client} />

      <footer className="ls-foot">
        <button
          onClick={() => {
            if (confirm('Restart the timer and clear ticks?')) setState({ start: Date.now(), hours: state.hours, done: [] })
          }}
        >
          Restart
        </button>
        <span>Screen stays on · buzzes every {NUDGE_MINUTES} min if must-gets are missing</span>
      </footer>
    </div>
  )
}
