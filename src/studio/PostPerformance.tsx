import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { uploadPhoto } from './postsApi'

/** Reads the text off a screenshot on this device (free OCR, loaded only when needed). */
async function ocr(file: File): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    return (await worker.recognize(file)).data.text
  } finally {
    await worker.terminate()
  }
}

function toDataUrl(file: File, max: number): Promise<string> {
  return createImageBitmap(file).then((img) => {
    const s = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * s)
    c.height = Math.round(img.height * s)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  })
}

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

  const [connected, setConnected] = useState(true)
  const [reading, setReading] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function sync(quiet = false) {
    if (!supabase) return
    setSyncing(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('ig-sync')
    setSyncing(false)
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
      const msg: string = body?.error ?? error.message
      if (/not connected|IG_TOKEN/i.test(msg)) setConnected(false)
      else if (!quiet) setError(msg)
      return
    }
    setNote(data.autoPosted ? `Synced. Ticked off ${data.autoPosted} planned post${data.autoPosted === 1 ? '' : 's'} you've put up.` : 'Synced.')
    load()
  }

  useEffect(() => {
    load().then((list) => {
      const last = list[0]?.synced_at
      if (!last || Date.now() - new Date(last).getTime() > STALE_HOURS * 3600000) sync(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Screenshot → stats: Sandy reads the numbers off an Insights screenshot. */
  async function readShots(files: File[]) {
    if (!supabase) return
    const shots = files.filter((f) => f.type.startsWith('image/'))
    if (!shots.length) return
    setError('')
    setNote('')
    const done: string[] = []
    for (const [i, file] of shots.entries()) {
      setReading(`Reading screenshot ${i + 1} of ${shots.length}…`)
      try {
        const image = await toDataUrl(file, 1400)
        setReading(`Reading the numbers off screenshot ${i + 1}…`)
        const text = await ocr(file)
        const thumb = (await uploadPhoto(file)).url
        const { data, error } = await supabase.functions.invoke('ig-screenshot', { body: { image, text, thumb, today: new Date().toISOString().slice(0, 10) } })
        if (error) {
          const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
          throw new Error(body?.error ?? error.message)
        }
        const bits = [data.likes != null && `${data.likes} likes`, data.comments != null && `${data.comments} comments`, data.saves != null && `${data.saves} saves`, data.reach != null && `${data.reach} reached`].filter(Boolean)
        done.push(`${data.updated ? 'Updated' : 'Logged'}: ${bits.join(', ') || 'stats'}`)
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    setReading('')
    if (done.length) setNote(done.join(' · '))
    load()
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])]
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault()
        readShots(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ranked = [...(posts ?? [])].sort((a, b) => score(b) - score(a))
  const top = ranked[0]
  const day = bestDay(posts ?? [])

  return (
    <section
      className={`ps-block${over ? ' ss-over' : ''}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        setOver(false)
        readShots([...e.dataTransfer.files])
      }}
    >
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => (readShots([...(e.target.files ?? [])]), (e.target.value = ''))} />
      <div className="ps-head">
        <div>
          <h2>How your posts did</h2>
          <p>{top ? `Best lately: ${top.likes ?? 0} likes, ${top.saves ?? 0} saves.${day ? ` ${day}s do best for you.` : ''}` : 'Your @cmk._7 post stats.'}</p>
        </div>
        <div className="ps-head-actions">
          <button className="ap-btn" onClick={() => fileRef.current?.click()} disabled={!!reading}>
            {reading ? 'Reading…' : '📸 Add Insights screenshot'}
          </button>
          {connected && (
            <button className="st-ghost" onClick={() => sync()} disabled={syncing}>
              {syncing ? 'Syncing…' : '↻ Sync'}
            </button>
          )}
        </div>
      </div>
      <div className="ss-how">
        On Instagram, open a post → <b>View insights</b> → screenshot it. Then tap the button, drop it here, or paste it (Ctrl+V). Screenshot the same post again later and Sandy updates its numbers.
      </div>
      {reading && <p className="ps-hint st-loading">{reading}</p>}
      {error && <p className="gr-error">{error}</p>}
      {note && !error && <p className="ps-hint ss-done">✓ {note}</p>}
      {posts === null && <p className="st-empty st-loading">Loading…</p>}
      {posts?.length === 0 && !syncing && !reading && !error && <p className="st-empty">No stats yet. Add your first Insights screenshot.</p>}
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
