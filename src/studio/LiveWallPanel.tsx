// In Live shoot mode: start a live wall for this night and drop photos onto it from your phone.
import { useEffect, useRef, useState } from 'react'
import type { Client } from '../types'
import type { Wall } from './shareApi'
import { addToWall, existingWall, wallCount, wallFor, wallLink } from './shareApi'

export default function LiveWallPanel({ client }: { client: Client }) {
  const [wall, setWall] = useState<Wall | null>(null)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    existingWall(client.id)
      .then((w) => {
        setWall(w)
        if (w) wallCount(w.id).then(setCount)
      })
      .catch(() => {})
  }, [client.id])

  async function start() {
    setError('')
    try {
      const w = await wallFor(client.id, client.name)
      setWall(w)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function upload(files: File[]) {
    if (!wall) return
    setError('')
    for (const [i, f] of files.entries()) {
      setBusy(`Sending ${i + 1} of ${files.length}…`)
      try {
        await addToWall(wall, f)
        setCount((c) => c + 1)
      } catch (e) {
        setError((e as Error).message)
      }
    }
    setBusy('')
    navigator.vibrate?.(40)
  }

  return (
    <section className="ls-wall">
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => (upload([...(e.target.files ?? [])]), (e.target.value = ''))} />
      <div className="ls-wall-head">
        <b>📺 Live wall</b>
        {wall && <em>{count} up</em>}
      </div>
      {!wall ? (
        <>
          <p>Put your best shots on a screen or link while the night's still going. People tag you on the spot.</p>
          <button className="ls-wall-btn" onClick={start}>
            Start the wall
          </button>
        </>
      ) : (
        <>
          <button className="ls-wall-btn big" onClick={() => input.current?.click()} disabled={!!busy}>
            {busy || '+ Send photos to the wall'}
          </button>
          <div className="ls-wall-row">
            <button
              onClick={() =>
                navigator.clipboard.writeText(wallLink(wall.token)).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
              }
            >
              {copied ? 'Link copied!' : 'Copy wall link'}
            </button>
            <a href={wallLink(wall.token)} target="_blank" rel="noreferrer">
              Open wall ↗
            </a>
          </div>
        </>
      )}
      {error && <p className="ls-wall-err">{error}</p>}
    </section>
  )
}
