import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { readRaw } from './raw'
import { analyse } from './analyse'
import type { Shot, Taste, Verdict } from './decide'
import { decide, learnTaste, TASTE_KEYS, zFeatures } from './decide'
import { sidecarFiles, writeResults } from './output'
import { canWriteFolders, download, pickFolder } from './folder'
import { makeZip } from './zip'
import type { Edits } from './output'
import type { SavedLook } from '../lab/looksApi'
import { listLooks } from '../lab/looksApi'
import { loadPixels, recipeCrs } from '../lab/look'
import type { Calibration, Descriptor } from '../lab/engine'
import { fit, prepare, toRecipe } from '../lab/engine'
import { loadCalibration } from '../lab/calibration'
import type { StyleProfile, StyleSample } from './style'
import { combineLooks, learnStyle, loadStyle, measureLook, parseXmp, referenceNudge, saveStyle } from './style'
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
  const supported = typeof window !== 'undefined' && (canWriteFolders || 'webkitdirectory' in document.createElement('input')) && !/iphone|ipad|android/i.test(navigator.userAgent)
  const [folder, setFolder] = useState<{ name: string; existing: Set<string> }>({ name: 'shoot', existing: new Set() })
  const [phase, setPhase] = useState<Phase>('start')
  const [dir, setDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, text: '' })
  const [tab, setTab] = useState<Tab>('pick')
  const [index, setIndex] = useState(0)
  const [target, setTarget] = useState(MIN_KEEPERS)
  const [taste, setTaste] = useState<Taste>({})
  const [opts, setOpts] = useState({ sidecars: true, copyPicks: true, includeMaybes: false, applyStyle: true })
  const [looks, setLooks] = useState<SavedLook[]>([])
  const [lookId, setLookId] = useState('')
  const fileMap = useRef(new Map<string, File>())
  const calibRef = useRef<Calibration | null>(null)
  useEffect(() => {
    listLooks().then((l) => setLooks(l.filter((x) => (x.look as unknown as Descriptor).v === 2))).catch(() => {})
    loadCalibration().then((c) => (calibRef.current = c)).catch(() => {})
  }, [])

  /** Per-photo recipes that take each keeper to a saved look. */
  async function lookEdits(): Promise<Edits | undefined> {
    const target = looks.find((l) => l.id === lookId)
    if (!target) return undefined
    const edits: Edits = new Map()
    const keep = shots.filter((s) => (s.mine ?? s.verdict) !== 'reject')
    for (const [i, s] of keep.entries()) {
      setProgress((p) => ({ ...p, text: `Matching ${target.name}: ${i + 1}/${keep.length}` }))
      const file = fileMap.current.get(s.name)
      if (!file) continue
      try {
        const info = await readRaw(file)
        if (!info.preview) continue
        const res = fit(prepare(await loadPixels(info.preview, 240), 72, calibRef.current), target.look as unknown as Descriptor, undefined, 1)
        edits.set(s.name, recipeCrs(toRecipe(res.params)))
        await new Promise((r) => setTimeout(r, 0))
      } catch {
        // Skip a photo we can't read; it keeps its rating.
      }
    }
    return edits
  }
  const [style, setStyle] = useState<StyleProfile | null>(null)
  const [teaching, setTeaching] = useState('')

  useEffect(() => {
    loadStyle().then(setStyle).catch(() => {})
  }, [])

  async function teachReference() {
    if (!style) return
    setError('')
    try {
      const picked = await pickFolder('read', 'reference')
      const looks = []
      for (const file of picked.files) {
        if (!/\.(jpe?g|png|webp)$/i.test(file.name)) continue
        setTeaching(`Studying ${file.name}…`)
        looks.push(await measureLook(file))
      }
      if (!looks.length) throw new Error('No JPG or PNG photos in that folder.')
      const next = { ...style, reference: combineLooks(looks), strength: style.strength ?? 0.5 }
      await saveStyle(next)
      setStyle(next)
      setTeaching(`Reference look learned from ${looks.length} photos.`)
    } catch (e) {
      setTeaching('')
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    }
  }

  async function setStrength(v: number) {
    if (!style) return
    const next = { ...style, strength: v }
    setStyle(next)
    saveStyle(next).catch(() => {})
  }

  async function teachStyle() {
    setError('')
    try {
      const picked = await pickFolder('read', 'style')
      const files = new Map<string, File>(picked.files.map((f) => [f.name.toLowerCase(), f]))
      const xmps = [...files.keys()].filter((n) => n.endsWith('.xmp'))
      if (!xmps.length) throw new Error('No .xmp files in that folder. Pick a shoot you edited in Lightroom (with "write changes to XMP" on).')
      const fresh: StyleSample[] = []
      for (const [i, x] of xmps.entries()) {
        setTeaching(`Studying your edit ${i + 1} of ${xmps.length}…`)
        const base = x.replace(/\.xmp$/, '')
        const rawFile = [...files.entries()].find(([n]) => n.startsWith(base + '.') && RAW_EXT.test(n) && !n.endsWith('.xmp'))?.[1]
        if (!rawFile) continue
        const { settings, curves } = parseXmp(await files.get(x)!.text())
        const info = await readRaw(rawFile)
        if (!info.preview) continue
        const { features, thumb } = await analyse(info.preview, info.orientation)
        URL.revokeObjectURL(thumb)
        const keep: Record<string, string> = {}
        for (const [k, v] of Object.entries(settings)) if (/^(Exposure2012|Temperature|Tint|CameraProfile|WhiteBalance)$/.test(k) || /2012$|Adjustment|SplitToning|ColorGrade|Parametric|Grain|Vibrance|Saturation|Sharpen|Sharpness|Clarity|Texture|Dehaze|Smoothing|NoiseReduction|PostCropVignette/.test(k)) keep[k] = v
        fresh.push({ settings: keep, curves, bright: features.bright })
      }
      const all = [...(style?.data ?? []), ...fresh].slice(-500)
      const learned = learnStyle(all)
      if (!learned) throw new Error('Need at least 3 edited shots to learn from. Pick a folder with more of your edits.')
      learned.data = all
      await saveStyle(learned)
      setStyle(learned)
      setTeaching(`Learned from ${fresh.length} new edits (${learned.samples} in total).`)
    } catch (e) {
      setTeaching('')
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    }
  }
  const [report, setReport] = useState('')
  const [error, setError] = useState('')
  const raw = useRef<Omit<Shot, 'score' | 'verdict' | 'reason' | 'group' | 'groupSize'>[]>([])
  const filmRef = useRef<HTMLDivElement>(null)

  const learned = Object.values(taste).some((v) => v)

  async function start() {
    setError('')
    try {
      const picked = await pickFolder('readwrite', 'cull')
      const files = picked.files.filter((f) => RAW_EXT.test(f.name))
      fileMap.current = new Map(files.map((f) => [f.name, f]))
      setFolder({ name: picked.name, existing: new Set(picked.files.filter((f) => /\.xmp$/i.test(f.name)).map((f) => f.name.toLowerCase())) })
      const handle = picked.handle
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
    if (!dir && canWriteFolders) return
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
      let r = { sidecars: 0, skipped: 0, copied: 0 }
      const edits = opts.sidecars ? await lookEdits() : undefined
      if (dir) r = await writeResults(dir, shots, { ...opts, style: opts.applyStyle ? style : null, edits }, (text) => setProgress((p) => ({ ...p, text })))
      else if (opts.sidecars) {
        const files = sidecarFiles(shots, opts.applyStyle ? style : null, folder.existing, edits)
        download(makeZip(files), `${folder.name}-lightroom.zip`)
        r = { sidecars: files.length, skipped: shots.length - files.length, copied: 0 }
      }
      setReport(
        [
          opts.sidecars && `${r.sidecars} Lightroom ratings${lookId ? ` + "${looks.find((l) => l.id === lookId)?.name}" look` : opts.applyStyle && style ? ' + your edit' : ''} written${r.skipped ? ` (${r.skipped} already had one, left alone)` : ''}`,
          opts.copyPicks && dir && `${r.copied} keepers copied to the Picks folder`,
          !dir && opts.sidecars && 'Unzip the download into your shoot folder (next to the .ARW files), then import into Lightroom',
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
        <h2>Open this on your laptop</h2>
        <p>Auto-cull needs to read your shoot folder from a computer (Chrome, Edge or Firefox).</p>
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
            <div className="cu-style">
              <div>
                <b>✦ Auto-edit in your style</b>
                <small>
                  {style
                    ? `Learned from ${style.samples} of your edits: Contrast ${style.base.Contrast2012 ?? 0}, Highlights ${style.base.Highlights2012 ?? 0}, Shadows ${style.base.Shadows2012 ?? 0}, Blacks ${style.base.Blacks2012 ?? 0}, Vibrance ${style.base.Vibrance ?? 0}. Exposure is matched to each shot.`
                    : 'Show Sandy a shoot you already edited in Lightroom (RAW + .xmp files) and she learns your look. Keepers then open in Lightroom pre-edited.'}
                </small>
                {style?.reference && (
                  <div className="cu-ref">
                    <small>
                      Leaning towards your reference look ({style.reference.n} photos):{' '}
                      {(() => {
                        const n = referenceNudge(style)
                        return [n.exposure ? `exposure ${n.exposure > 0 ? '+' : ''}${n.exposure}` : '', ...Object.entries(n.sliders).filter(([, v]) => v).map(([k, v]) => `${k.replace('2012', '')} ${v > 0 ? '+' : ''}${v}`)].filter(Boolean).join(', ') || 'no change'
                      })()}
                    </small>
                    <label>
                      Strength <b>{Math.round((style.strength ?? 0.5) * 100)}%</b>
                      <input type="range" min={0} max={100} value={Math.round((style.strength ?? 0.5) * 100)} onChange={(e) => setStrength(+e.target.value / 100)} />
                    </label>
                  </div>
                )}
                {teaching && <small className="cu-teach">{teaching}</small>}
              </div>
              <div className="cu-style-btns">
                <button className="st-ghost" onClick={teachStyle}>
                  {style ? 'Teach more' : 'Teach Sandy my editing'}
                </button>
                {style && (
                  <button className="st-ghost" onClick={teachReference}>
                    {style.reference ? 'Change reference look' : 'Add a reference look'}
                  </button>
                )}
              </div>
            </div>
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
            <input type="checkbox" checked={opts.sidecars} onChange={(e) => setOpts({ ...opts, sidecars: e.target.checked })} /> Lightroom stars{dir ? '' : ' (as a zip download)'}
          </label>
          {dir && (
            <label>
              <input type="checkbox" checked={opts.copyPicks} onChange={(e) => setOpts({ ...opts, copyPicks: e.target.checked })} /> Copy picks to "Picks" folder
            </label>
          )}
          <label>
            <input type="checkbox" checked={opts.includeMaybes} onChange={(e) => setOpts({ ...opts, includeMaybes: e.target.checked })} /> Include maybes
          </label>
          {style && !lookId && (
            <label>
              <input type="checkbox" checked={opts.applyStyle} disabled={!opts.sidecars} onChange={(e) => setOpts({ ...opts, applyStyle: e.target.checked })} /> ✦ Pre-edit in my style
            </label>
          )}
          {looks.length > 0 && (
            <label className="cu-look">
              ✦ Match a saved look
              <select value={lookId} disabled={!opts.sidecars} onChange={(e) => setLookId(e.target.value)}>
                <option value="">off</option>
                {looks.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
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
