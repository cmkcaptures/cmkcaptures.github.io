import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'
import type { Client } from '../types'
import type { Lead } from '../growth'
import { listLeads } from '../growth'
import { formatMoney, parseMoney, todayISO } from '../invoiceTypes'

interface FollowerEntry {
  logged_on: string
  followers: number
}

const CONTACTED = ['messaged', 'replied', 'booked', 'passed']
const REPLIED = ['replied', 'booked']

export default function Scoreboard({ clients }: { clients: Client[] }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [entries, setEntries] = useState<FollowerEntry[]>([])
  const [followers, setFollowers] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    listLeads()
      .then(setLeads)
      .catch((e: Error) => setError(e.message))
    supabase
      ?.from('follower_log')
      .select('logged_on,followers')
      .order('logged_on', { ascending: false })
      .limit(2)
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setEntries(data as FollowerEntry[])
      })
  }, [])

  async function logFollowers(e: FormEvent) {
    e.preventDefault()
    const count = parseInt(followers.replace(/\D/g, ''), 10)
    if (!supabase || Number.isNaN(count)) return
    setError('')
    const entry = { logged_on: todayISO(), followers: count }
    const { error: failed } = await supabase.from('follower_log').upsert(entry)
    if (failed) {
      setError(failed.message)
      return
    }
    setEntries((prev) => [entry, ...prev.filter((p) => p.logged_on !== entry.logged_on)].slice(0, 2))
    setFollowers('')
  }

  const month = todayISO().slice(0, 7)
  const earned = clients
    .filter((c) => c.fullyPaid && c.lastUpdated.slice(0, 7) === month)
    .reduce((sum, c) => sum + parseMoney(c.price), 0)
  const contacted = leads.filter((l) => CONTACTED.includes(l.status)).length
  const replied = leads.filter((l) => REPLIED.includes(l.status)).length
  const booked = leads.filter((l) => l.status === 'booked').length
  const [latest, previous] = entries
  const change = latest && previous ? latest.followers - previous.followers : null

  const stats = [
    { label: 'Messaged', value: String(contacted) },
    { label: 'Replied', value: String(replied) },
    { label: 'Booked', value: String(booked) },
    { label: 'Paid this month', value: formatMoney(earned) },
    {
      label: 'Followers',
      value: latest ? latest.followers.toLocaleString('en-GB') : '—',
      note: change === null ? undefined : `${change >= 0 ? '+' : ''}${change} since last log`,
    },
  ]

  return (
    <section className="gr-score" aria-label="Scoreboard">
      {error && <p className="gr-error">{error}</p>}
      <div className="gr-score-row">
        {stats.map((s) => (
          <div className="gr-stat" key={s.label}>
            <b>{s.value}</b>
            <span>{s.label}</span>
            {s.note && <small>{s.note}</small>}
          </div>
        ))}
        <form className="gr-follow-form" onSubmit={logFollowers}>
          <input
            inputMode="numeric"
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
            placeholder="@cmk._7 followers"
            aria-label="Follower count"
          />
          <button className="btn-brass" type="submit">
            Log
          </button>
        </form>
      </div>
    </section>
  )
}
