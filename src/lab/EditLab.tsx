// Edit Lab: match any look. Shows the Lightroom moves (most impactful first), a live preview, and a preset to download.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Look, Pixels, Recipe } from './look'
import { loadPixels, makeRecipe, measure, presetXmp, render, scaleRecipe, steps } from './look'
import { readRaw } from '../cull/raw'
import { download } from '../cull/folder'
import './EditLab.css'

const RAW = /\.(arw|cr2|cr3|nef|raf|orf|rw2|dng)$/i

interface Slot {
  name: string
  url: string
  look: Look
  pixels: Pixels
  raw: boolean
}

/** Turns a RAW into its (correctly rotated) built-in JPEG, or passes images through. */
async function toImageBlob(file: File): Promise<{ blob: Blob; raw: boolean }> {
  if (!RAW.test(file.name)) return { blob: file, raw: false }
  const info = await readRaw(file)
  if (!info.preview) throw new Error(`Couldn't read the preview inside ${file.name}.`)
  if (![6, 8, 3].includes(info.orientation)) return { blob: info.preview, raw: true }
  const bmp = await createImageBitmap(info.preview)
  const turned = info.orientation !== 3
  const c = new OffscreenCanvas(turned ? bmp.height : bmp.width, turned ? bmp.width : bmp.height)
  const ctx = c.getContext('2d')!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(info.orientation === 6 ? Math.PI / 2 : info.orientation === 8 ? -Math.PI / 2 : Math.PI)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  bmp.close()
  return { blob: await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 }), raw: true }
}

async function toSlot(file: File): Promise<Slot> {
  const { blob, raw } = await toImageBlob(file)
  const pixels = await loadPixels(blob, 900)
  return { name: file.name, url: URL.createObjectURL(blob), look: measure(await loadPixels(blob, 480)), pixels, raw }
}

function Drop({ label, hint, slot, busy, onFile }: { label: string; hint: string; slot: Slot | null; busy: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      className={`lb-drop${over ? ' over' : ''}${slot ? ' has' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <input ref={input} type="file" accept="image/*,.arw,.cr2,.cr3,.nef,.raf,.dng" hidden onChange={(e) => (e.target.files?.[0] && onFile(e.target.files[0]), (e.target.value = ''))} />
      {slot ? <img src={slot.url} alt="" /> : <span className="lb-drop-empty">{busy ? 'Reading…' : '+'}</span>}
      <span className="lb-drop-label">
        <b>{label}</b>
        <small>{slot ? `${slot.name}${slot.raw ? ' · RAW' : ''}` : hint}</small>
      </span>
    </button>
  )
}

export default function EditLab() {
  const [ref, setRef] = useState<Slot | null>(null)
  const [mine, setMine] = useState<Slot | null>(null)
  const [busy, setBusy] = useState<'ref' | 'mine' | null>(null)
  const [error, setError] = useState('')
  const [strength, setStrength] = useState(100)
  const [split, setSplit] = useState(50)
  const [show, setShow] = useState<'compare' | 'ref'>('compare')
  const [full, setFull] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const before = useRef<HTMLCanvasElement>(null)

  async function pick(which: 'ref' | 'mine', f: File) {
    setError('')
    setBusy(which)
    try {
      const s = await toSlot(f)
      if (which === 'ref') setRef(s)
      else setMine(s)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  const recipe: Recipe | null = useMemo(() => (ref && mine ? makeRecipe(mine.look, ref.look) : null), [ref, mine])
  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, strength / 100) : null), [recipe, strength])
  const list = useMemo(() => (scaled ? steps(scaled) : []), [scaled])

  useEffect(() => {
    if (!mine || !scaled || !canvas.current || !before.current) return
    const { w, h } = mine.pixels
    for (const c of [canvas.current, before.current]) {
      c.width = w
      c.height = h
    }
    before.current.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(mine.pixels.data), w, h), 0, 0)
    const id = requestAnimationFrame(() => canvas.current?.getContext('2d')!.putImageData(render(mine.pixels, scaled), 0, 0))
    return () => cancelAnimationFrame(id)
  }, [mine, scaled])

  function savePreset() {
    if (!scaled || !ref) return
    const name = `Match · ${ref.name.replace(/\.[^.]+$/, '')}${strength < 100 ? ` ${strength}%` : ''}`
    download(new Blob([presetXmp(name, scaled, !!mine?.raw)], { type: 'application/rdf+xml' }), `${name.replace(/[^\w ·%-]/g, '').replace(/\s+/g, '-')}.xmp`)
  }

  const shown = full ? list : list.slice(0, 4)
  const quickShare = list.length ? Math.round((list.slice(0, 4).reduce((a, s) => a + s.impact, 0) / Math.max(0.01, list.reduce((a, s) => a + s.impact, 0))) * 100) : 0

  return (
    <div className="lb">
      <div className="lb-inputs">
        <Drop label="The look you want" hint="e.g. one of Alex's shots (JPG or screenshot)" slot={ref} busy={busy === 'ref'} onFile={(f) => pick('ref', f)} />
        <span className="lb-arrow" aria-hidden="true">
          →
        </span>
        <Drop label="Your photo" hint="RAW off the card or a half-edited export" slot={mine} busy={busy === 'mine'} onFile={(f) => pick('mine', f)} />
      </div>
      {error && <p className="gr-error">{error}</p>}

      {!recipe && (
        <div className="lb-empty">
          <b>Drop in two photos.</b> Sandy compares them and tells you exactly which Lightroom sliders to move, biggest wins first, then shows you what your photo will look like.
        </div>
      )}

      {recipe && scaled && mine && ref && (
        <div className="lb-result">
          <section className="lb-stage">
            <div className="lb-view-tabs">
              <button className={show === 'compare' ? 'on' : ''} onClick={() => setShow('compare')}>
                Before / after
              </button>
              <button className={show === 'ref' ? 'on' : ''} onClick={() => setShow('ref')}>
                Next to the reference
              </button>
            </div>
            {show === 'compare' ? (
              <div className="lb-compare" style={{ ['--split' as string]: `${split}%` }}>
                <canvas ref={canvas} className="lb-after" />
                <canvas ref={before} className="lb-before" />
                <span className="lb-line" />
                <em className="l">Before</em>
                <em className="r">After</em>
                <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Compare before and after" />
              </div>
            ) : (
              <div className="lb-side">
                <figure>
                  <canvas
                    ref={(c) => {
                      if (c && mine) {
                        c.width = mine.pixels.w
                        c.height = mine.pixels.h
                        c.getContext('2d')!.putImageData(render(mine.pixels, scaled), 0, 0)
                      }
                    }}
                  />
                  <figcaption>Yours, matched</figcaption>
                </figure>
                <figure>
                  <img src={ref.url} alt="" />
                  <figcaption>Reference</figcaption>
                </figure>
              </div>
            )}
            <label className="lb-strength">
              <span>
                Strength <b>{strength}%</b>
              </span>
              <input type="range" min={0} max={150} step={5} value={strength} onChange={(e) => setStrength(+e.target.value)} />
            </label>
            <p className="lb-note">Preview is close, not exact: Lightroom renders RAWs with more detail. Use it to judge direction.</p>
          </section>

          <section className="lb-recipe">
            <header>
              <h3>Your recipe</h3>
              <p>{list.length ? `${Math.min(4, list.length)} steps get you ~${quickShare}% of the way.` : 'These two already look very alike.'}</p>
            </header>
            <ol>
              {shown.map((s, i) => (
                <li key={s.title} style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="lb-step-head">
                    <b>{s.title}</b>
                    <span className="lb-panel">{s.panel}</span>
                  </div>
                  <div className="lb-impact">
                    <i style={{ width: `${Math.round(s.impact * 100)}%` }} />
                  </div>
                  <ul>
                    {s.moves.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                  <small>{s.why}</small>
                </li>
              ))}
            </ol>
            {list.length > 4 && (
              <button className="st-ghost" onClick={() => setFull((f) => !f)}>
                {full ? 'Show just the quick version' : `Show all ${list.length} steps`}
              </button>
            )}
            <div className="lb-actions">
              <button className="btn-brass" onClick={savePreset}>
                ⬇ Lightroom preset
              </button>
            </div>
            <small className="lb-note">
              Import in Lightroom: Develop › Presets › + › Import Presets. Use the preset's Amount slider to dial it in.{mine.raw ? ' White balance is left to you (step above) because RAWs use absolute Kelvin.' : ''}
            </small>
          </section>
        </div>
      )}
    </div>
  )
}
