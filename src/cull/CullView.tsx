import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { readRaw } from './raw'
import { analyse } from './analyse'
import type { Shot, Taste, Verdict } from './decide'
import { decide, learnTaste, TASTE_KEYS, zFeatures } from './decide'
import { writeResults } from './output'
import './Cull.css'

const RAW_EXT = /\.(arw|cr2|cr3|nef|raf|orf|rw2|dng|jpe?g)$/i
const MIN_KEEPERS = 100
const PARALLEL = 4

type Phase = 'start' | 'reading' | 'review' | 'saving' | 'done'
type Tab = 'pick' | 'maybe' | 'reject'

const LABEL: Record<Verdict, string> = { pick: 'Pick', maybe: 'Maybe', reject: 'Reject' }

async function loadTaste(): Promise<Taste> {
  const { data } = (await supabase?.from('cull_feedback').select('z,kept').order('created_at', { ascending: false }).limit(2000)) ?? {}
  return learnTaste((data ?? []) as { z: Record<string, number>; kept: boolean }[])
}

export default function CullView() {
  const supported = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const [phase, setPhase] = useState<Phase>('start')
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, text: '' })
  const [tab, setTab] = useState<Tab>('pick')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState(MIN_KEEPERS)
  const [taste, setTaste] = useState<Taste>({})
  const [opts, setOpts] = useState({ sidecars: true, copyPicks: true, includeMaybes: false })
  const [report, setReport] = useState('')
  const [error, setError] = useState('')
  const raw = useRef<Omit<Shot, 'score' | 'verdict' | 'reason' | 'group' | 'groupSize'>[]>([])
  const filmRef = useRef<HTMLDivElement>(null)

  const learned = Object.values(taste).some((v) => v)

  async function start() {
    setError('')
    try {
      const picker = (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
      const handle = await picker({ mode: 'readwrite', id: 'cull' })
      const files: File[] = []
      for await (const entry of (handle as unknown as { values: () => AsyncIterable<FileSystemHandle> }).values()) {
        if (entry.kind === 'file' && RAW_EXT.test(entry.name)) files.push(await (entry as FileSystemFileHandle).getFile())
      }
      if (!files.length) throw new Error('No RAW or JPEG files in that folder. Pick the folder with your .ARW files.')
      // If a folder has RAW + JPEG pairs, only cull the RAW.
      const rawNames = new Set(files.filter((f) => !/\.jpe?g$/i.test(f.name)).map((f) => f.name.replace(/\.[^.]+$/, '').toLowerCase()))
      const list = files.filter((f) => !(/\.jpe?g$/i.test(f.name) && rawNames.has(f.name.replace(/\.[^.]+$/, '').toLowerCase())))
      setDir(handle)
      setPhase('reading')
      const tastePromise = loadTaste().catch(() => ({}))
      raw.current = []
      let done = 0
      setProgress({ done: 0, total: list.length, text: 'Reading your shoot…' })
      const queue = [...list]
      const worker = async () => {
        while (queue.length) {
          const file = queue.shift()!
          try {
            const info = await readRaw(file)
            if (info.preview) {
              const { features, thumb } = await analyse(info.preview, info.orientation)
              raw.current.push({ name: file.name, takenAt: info.takenAt, thumb, features })
            }
          } catch {
            // Unreadable file: leave it out rather than stopping the whole cull.
          }
          done++
          setProgress({ done, total: list.length, text: `Looking at ${file.name}` })
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker))
      if (!raw.current.length) throw new Error("Couldn't read previews from these files.")
      const t = await tastePromise
      setTaste(t)
      const goal = Math.max(MIN_KEEPERS, Math.round(raw.current.length * 0.3))
      setTarget(goal)
      setShots(decide(raw.current, goal, t))
      setTab('pick')
      setIndex(0)
      setPhase('review')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
      setPhase('start')
    }
  }

  function retarget(n: number) {
    setTarget(n)
    const mine = new Map(shots.map((s) => [s.name, s.mine]))
    setShots(decide(raw.current, n, taste).map((s) => ({ ...s, mine: mine.get(s.name) })))
  }

  const final = (s: Shot) => s.mine ?? s.verdict
  const lists = useMemo(() => {
    const by: Record<Tab, Shot[]> = { pick: [], maybe: [], reject: [] }
    shots.forEach((s) => by[final(s)].push(s))
    by.pick.sort((a, b) => a.takenAt - b.takenAt)
    by.maybe.sort((a, b) => b.score - a.score)
    by.reject.sort((a, b) => a.takenAt - b.takenAt)
    return by
  }, [shots])
  const current = lists[tab][Math.min(index, lists[tab].length - 1)]

  function mark(v: Verdict) {
    if (!current) return
    setShots((list) => list.map((s) => (s.name === current.name ? { ...s, mine: v === s.verdict ? undefined : v } : s)))
  }

  useEffect(() => {
    if (phase !== 'review') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const k = e.key.toLowerCase()
      if (k === 'arrowright') setIndex((i) => Math.min(lists[tab].length - 1, i + 1))
      else if (k === 'arrowleft') setIndex((i) => Math.max(0, i - 1))
      else if (k === 'p') mark('pick')
      else if (k === 'm') mark('maybe')
      else if (k === 'x') mark('reject')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    filmRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index, tab])

  async function finish() {
    if (!dir) return
    setPhase('saving')
    setError('')
    try {
      // Teach Sandy from every frame you overruled.
      const norms = Object.fromEntries(
        TASTE_KEYS.map((k) => {
          const vals = shots.map((s) => s.features[k])
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length
          const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) || 1
          return [k, { mean, sd }]
        }),
      ) as Parameters<typeof zFeatures>[1]
      const changed = shots.filter((s) => s.mine && s.mine !== s.verdict && s.mine !== 'maybe')
      if (changed.length) await supabase?.from('cull_feedback').insert(changed.map((s) => ({ z: zFeatures(s.features, norms), kept: s.mine === 'pick' })))
      const r = await writeResults(dir, shots, opts, (text) => setProgress((p) => ({ ...p, text })))
      setReport(
        [
          opts.sidecars && `${r.sidecars} Lightroom ratings written${r.skipped ? ` (${r.skipped} already had one, left alone)` : ''}`,
          opts.copyPicks && `${r.copied} keepers copied to the Picks folder`,
          changed.length ? `Sandy learned from ${changed.length} of your calls` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      )
      setPhase('done')
    } catch (e) {
      setError((e as Error).message)
      setPhase('review')
    }
  }

  if (!supported)
    return (
      <div className="cu-card cu-start">
        <h2>Open this on your laptop in Chrome</h2>
        <p>Auto-cull needs to read your shoot folder, which works in Chrome or Edge on a computer.</p>
      </div>
    )

  if (phase === 'start' || phase === 'reading')
    return (
      <div className="cu-card cu-start">
        {phase === 'start' ? (
          <>
            <div className="cu-orb idle" />
            <h2>Auto-cull a shoot</h2>
            <p>Pick the folder with your .ARW files (straight off the card is fine). Sandy reads them on this laptop. Nothing is uploaded.</p>
            <ul className="cu-how">
              <li>Bins missed focus, motion blur, too dark / blown out</li>
              <li>Keeps the best 1–2 from every burst</li>
              <li>Aims for {MIN_KEEPERS}+ keepers</li>
              <li>{learned ? 'Using what she learned from your past culls' : 'Learns your taste every time you overrule her'}</li>
            </ul>
            <button className="btn-brass cu-go" onClick={start}>
              Choose shoot folder
            </button>
            {error && <p className="gr-error">{error}</p>}
          </>
        ) : (
          <>
            <div className="cu-orb" />
            <h2>
              {progress.done} / {progress.total}
            </h2>
            <div className="cu-bar">
              <i style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
            <p className="cu-sub">{progress.text}</p>
          </>
        )}
      </div>
    )

  if (phase === 'done')
    return (
      <div className="cu-card cu-start">
        <div className="cu-orb done" />
        <h2>Cull done</h2>
        <p>{report}</p>
        <p className="cu-sub">In Lightroom: import the Picks folder (or the whole card). Ratings show straight away: ★★★ picks, ★ maybes, rejects flagged.</p>
        <button
          className="btn-brass"
          onClick={() => {
            shots.forEach((s) => URL.revokeObjectURL(s.thumb))
            setShots([])
            setPhase('start')
          }}
        >
          Cull another shoot
        </button>
      </div>
    )

  const counts = { pick: lists.pick.length, maybe: lists.maybe.length, reject: lists.reject.length }
  const overrides = shots.filter((s) => s.mine).length

  return (
    <div className="cu">
      <div className="cu-top">
        <div className="cu-tabs">
          {(['pick', 'maybe', 'reject'] as Tab[]).map((t) => (
            <button
              key={t}
              className={`cu-tab t-${t}${tab === t ? ' on' : ''}`}
              onClick={() => {
                setTab(t)
                setIndex(0)
              }}
            >
              <b>{counts[t]}</b>
              {LABEL[t]}s
            </button>
          ))}
        </div>
        <label className="cu-target">
          Aim for <b>{target}</b> keepers
          <input type="range" min={40} max={Math.max(60, shots.length)} value={target} onChange={(e) => retarget(+e.target.value)} />
        </label>
      </div>

      {current ? (
        <div className="cu-stage">
          <img src={current.thumb} alt={current.name} key={current.name} />
          <div className="cu-info">
            <span className={`cu-badge v-${final(current)}`}>{LABEL[final(current)]}</span>
            <b>{current.name}</b>
            <small>
              {current.mine ? `You moved this (Sandy said ${LABEL[current.verdict]})` : current.reason}
              {current.groupSize > 1 ? ` · burst of ${current.groupSize}` : ''}
            </small>
            <div className="cu-meters">
              <span>
                Focus <i style={{ width: `${Math.min(100, (current.features.sharp / 40) * 100)}%` }} />
              </span>
              <span>
                Light <i style={{ width: `${Math.min(100, (current.features.bright / 160) * 100)}%` }} />
              </span>
            </div>
          </div>
          <div className="cu-actions">
            <button className="a-pick" onClick={() => mark('pick')}>
              Pick <kbd>P</kbd>
            </button>
            <button className="a-maybe" onClick={() => mark('maybe')}>
              Maybe <kbd>M</kbd>
            </button>
            <button className="a-reject" onClick={() => mark('reject')}>
              Reject <kbd>X</kbd>
            </button>
          </div>
          <button className="cu-nav prev" onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Previous">
            ‹
          </button>
          <button className="cu-nav next" onClick={() => setIndex((i) => Math.min(lists[tab].length - 1, i + 1))} aria-label="Next">
            ›
          </button>
        </div>
      ) : (
        <p className="st-empty">Nothing in {LABEL[tab]}s.</p>
      )}

      <div className="cu-film" ref={filmRef}>
        {lists[tab].map((s, i) => (
          <button key={s.name} className={`${i === index ? 'on' : ''}${s.mine ? ' moved' : ''}`} onClick={() => setIndex(i)}>
            <img src={s.thumb} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      <div className="cu-finish">
        <div className="cu-opts">
          <label>
            <input type="checkbox" checked={opts.sidecars} onChange={(e) => setOpts({ ...opts, sidecars: e.target.checked })} /> Lightroom stars
          </label>
          <label>
            <input type="checkbox" checked={opts.copyPicks} onChange={(e) => setOpts({ ...opts, copyPicks: e.target.checked })} /> Copy picks to "Picks" folder
          </label>
          <label>
            <input type="checkbox" checked={opts.includeMaybes} onChange={(e) => setOpts({ ...opts, includeMaybes: e.target.checked })} /> Include maybes
          </label>
        </div>
        <span className="cu-sub">
          {phase === 'saving' ? progress.text : `${overrides} change${overrides === 1 ? '' : 's'} by you · ← → to move · P / M / X`}
        </span>
        <button className="btn-brass" disabled={phase === 'saving'} onClick={finish}>
          {phase === 'saving' ? 'Saving…' : `Done: keep ${counts.pick}${opts.includeMaybes ? ` + ${counts.maybe}` : ''}`}
        </button>
      </div>
      {error && <p className="gr-error">{error}</p>}
    </div>
  )
}
