// Live event wall: a full-screen slideshow of photos uploaded during the night. New shots appear within seconds.
import { useEffect, useRef, useState } from 'react'
import { portfolio } from '../portfolio/portfolioData'
import { supabase } from '../supabase'
import './LiveWall.css'

interface Photo {
  id: string
  url: string
  at: string
}

const POLL_MS = 8000
const SLIDE_MS = 6000

export default function LiveWall({ token }: { token: string }) {
  const [wall, setWall] = useState<{ title: string; active: boolean; photos: Photo[] } | null | undefined>(undefined)
  const [index, setIndex] = useState(0)
  const [fresh, setFresh] = useState<string | null>(null)
  const known = useRef<Set<string>>(new Set())
  const [mode, setMode] = useState<'show' | 'grid'>('show')

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data } = (await supabase?.rpc('get_wall', { p_token: token })) ?? {}
      if (!alive) return
      const w = (data as { title: string; active: boolean; photos: Photo[] } | null) ?? null
      if (w) {
        const newest = w.photos.find((p) => !known.current.has(p.id))
        if (known.current.size && newest) {
          setFresh(newest.id)
          setIndex(0) // jump straight to the newest shot
          setTimeout(() => setFresh(null), 4000)
        }
        w.photos.forEach((p) => known.current.add(p.id))
      }
      setWall(w)
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [token])

  const photos = wall?.photos ?? []
  useEffect(() => {
    if (photos.length < 2 || mode !== 'show') return
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), SLIDE_MS)
    return () => clearInterval(id)
  }, [photos.length, mode])

  if (wall === undefined) return <div className="lw" />
  if (wall === null)
    return (
      <div className="lw lw-msg">
        <p>This wall isn't available.</p>
      </div>
    )

  const current = photos[index % Math.max(1, photos.length)]
  return (
    <div className="lw" onClick={() => setMode((m) => (m === 'show' ? 'grid' : 'show'))}>
      {photos.length === 0 && (
        <div className="lw-msg">
          <div className="lw-pulse" />
          <h1>{wall.title}</h1>
          <p>Photos land here live, all night. Stay close.</p>
        </div>
      )}

      {mode === 'show' && current && (
        <>
          <img className="lw-bg" src={current.url} alt="" key={`bg-${current.id}`} />
          <img className="lw-photo" src={current.url} alt="" key={current.id} />
        </>
      )}
      {mode === 'grid' && (
        <div className="lw-grid">
          {photos.map((p) => (
            <img key={p.id} src={p.url} alt="" loading="lazy" className={p.id === fresh ? 'new' : ''} />
          ))}
        </div>
      )}

      {fresh && <div className="lw-new">● Just in</div>}
      <div className="lw-bar">
        <span className="lw-live">
          <i /> LIVE
        </span>
        <b>{wall.title}</b>
        <span className="lw-credit">
          📸 {portfolio.instagramHandle} · tag me
        </span>
      </div>
    </div>
  )
}
