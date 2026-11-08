import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface IgPost {
  id: string
  caption: string
  media_type: string
  media_url: string | null
  thumbnail_url: string | null
  permalink: string | null
  posted_at: string | null
  likes: number | null
  comments: number | null
  reach: number | null
  saves: number | null
  shares: number | null
  synced_at: string
}

const STALE_HOURS = 6

function score(p: IgPost): number {
  return (p.likes ?? 0) + 3 * (p.comments ?? 0) + 4 * (p.saves ?? 0) + 4 * (p.shares ?? 0)
}

function bestDay(posts: IgPost[]): string | null {
  const byDay: Record<string, number[]> = {}
  for (const p of posts) {
    if (!p.posted_at) continue
    const day = new Date(p.posted_at).toLocaleDateString('en-GB', { weekday: 'long' })
    ;(byDay[day] ??= []).push(score(p))
  }
  const ranked = Object.entries(byDay)
    .filter(([, s]) => s.length >= 2)
    .map(([d, s]) => [d, s.reduce((a, b) => a + b, 0) / s.length] as const)
    .sort((a, b) => b[1] - a[1])
  return ranked[0]?.[0] ?? null
}

export default function PostPerformance() {
  const [posts, setPosts] = useState<IgPost[] | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const { data } = (await supabase?.from('ig_media').select('*').order('posted_at', { ascending: false }).limit(30)) ?? {}
    const list = (data ?? []) as IgPost[]
    setPosts(list)
    return list
  }

  async function sync() {
    if (!supabase) return
    setSyncing(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('ig-sync')
    setSyncing(false)
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
      setError(body?.error ?? error.message)
      return
    }
    setNote(data.autoPosted ? `Synced. Ticked off ${data.autoPosted} planned post${data.autoPosted === 1 ? '' : 's'} you've put up.` : 'Synced.')
    load()
  }

  useEffect(() => {
    load().then((list) => {
      const last = list[0]?.synced_at
      if (!last || Date.now() - new Date(last).getTime() > STALE_HOURS * 3600000) sync()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ranked = [...(posts ?? [])].sort((a, b) => score(b) - score(a))
  const top = ranked[0]
  const day = bestDay(posts ?? [])

  return (
    <section className="ps-block">
      <div className="ps-head">
        <div>
          <h2>How your posts did</h2>
          <p>{top ? `Best lately: ${top.likes ?? 0} likes, ${top.saves ?? 0} saves.${day ? ` ${day}s do best for you.` : ''}` : 'Pulled from @cmk._7.'}</p>
        </div>
        <button className="st-ghost" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : '↻ Sync'}
        </button>
      </div>
      {error && <p className="gr-error">{error}</p>}
      {note && !error && <p className="ps-hint">{note}</p>}
      {posts === null && <p className="st-empty st-loading">Loading…</p>}
      {posts?.length === 0 && !syncing && !error && <p className="st-empty">Nothing synced yet.</p>}
      <div className="ps-perf">
        {(posts ?? []).slice(0, 12).map((p, i) => (
          <a key={p.id} className={`ps-perf-tile${p.id === top?.id ? ' top' : ''}`} href={p.permalink ?? '#'} target="_blank" rel="noreferrer" style={{ animationDelay: `${i * 0.03}s` }}>
            <img src={(p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url) ?? ''} alt="" loading="lazy" />
            {p.id === top?.id && <span className="ps-perf-badge">Top</span>}
            <span className="ps-perf-stats">
              <b>♥ {p.likes ?? '–'}</b>
              <b>💬 {p.comments ?? '–'}</b>
              {p.saves !== null && <b>🔖 {p.saves}</b>}
              {p.reach !== null && <b>👁 {p.reach}</b>}
            </span>
          </a>
        ))}
      </div>
    </section>
  )
}
