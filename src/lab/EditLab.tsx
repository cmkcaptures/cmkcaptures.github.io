// Edit Lab: match any look. Shows the Lightroom moves (most impactful first), a live preview, and a preset to download.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Look, Pixels, Recipe } from './look'
import { describeLook, loadPixels, makeRecipe, measure, mergeRecipe, mixLooks, presetXmp, render, scaleRecipe, steps } from './look'
import type { SavedLook } from './looksApi'
import { deleteLook, listLooks, saveLook, thumbFrom } from './looksApi'
import { sandyWrite } from '../studio/sandyWrite'
import { readRaw } from '../cull/raw'
import { download } from '../cull/folder'
import './EditLab.css'

const RAW = /\.(arw|cr2|cr3|nef|raf|orf|rw2|dng)$/i

interface Slot {
  name: string
  url: string
  look: Look
  pixels: Pixels | null // null when the reference comes from your saved looks
  raw: boolean
  savedId?: string
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
  const [library, setLibrary] = useState<SavedLook[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [mixId, setMixId] = useState('')
  const [mixAmount, setMixAmount] = useState(30)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [result, setResult] = useState<Slot | null>(null)
  const [checking, setChecking] = useState(false)
  const resultInput = useRef<HTMLInputElement>(null)

  async function checkResult(f: File) {
    setChecking(true)
    setError('')
    try {
      setResult(await toSlot(f))
    } catch (e) {
      setError((e as Error).message)
    }
    setChecking(false)
  }
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    listLooks().then(setLibrary).catch(() => {})
  }, [])

  function useSaved(s: SavedLook) {
    setRef({ name: s.name, url: s.thumb, look: s.look, pixels: null, raw: false, savedId: s.id })
    setMixId('')
  }

  async function keepLook() {
    if (!ref || !naming?.trim()) return
    try {
      const saved = await saveLook(naming.trim(), ref.look, await thumbFrom(ref.url))
      setLibrary((l) => [saved, ...l])
      setRef({ ...ref, name: saved.name, savedId: saved.id })
      setNaming(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function forget(id: string) {
    setLibrary((l) => l.filter((x) => x.id !== id))
    deleteLook(id).catch(() => {})
  }

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

  const mixWith = library.find((l) => l.id === mixId)
  const target = useMemo(() => (ref ? (mixWith ? mixLooks([{ look: ref.look, weight: 100 - mixAmount }, { look: mixWith.look, weight: mixAmount }]) : ref.look) : null), [ref, mixWith, mixAmount])
  const recipe: Recipe | null = useMemo(() => (target && mine ? makeRecipe(mine.look, target) : null), [target, mine])

  async function ask(q = question) {
    if (!q.trim() || !scaled || !mine || !target) return
    setAsking(true)
    setAnswer(null)
    const text = await sandyWrite(
      `I'm matching my photo to a reference look in Lightroom. My photo: ${describeLook(mine.look)}. Reference${mixWith ? ` (mixed ${100 - mixAmount}% ${ref?.name} / ${mixAmount}% ${mixWith.name})` : ''}: ${describeLook(target)}. The recipe worked out: ${list.map((s) => `${s.title} (${s.moves.join(', ')})`).join('; ')}. My question: ${q}. Answer like an experienced nightlife photographer and Lightroom editor: specific sliders, masks or techniques, short and practical.`,
    )
    setAnswer(text ?? "Couldn't reach Sandy right now. Try again in a moment.")
    setAsking(false)
  }
  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, strength / 100) : null), [recipe, strength])
  const list = useMemo(() => (scaled ? steps(scaled) : []), [scaled])

  useEffect(() => {
    if (!mine || !scaled || !canvas.current || !before.current) return
    const { w, h } = mine.pixels!
    for (const c of [canvas.current, before.current]) {
      c.width = w
      c.height = h
    }
    before.current.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(mine.pixels!.data), w, h), 0, 0)
    const id = window.setTimeout(() => canvas.current?.getContext('2d')!.putImageData(render(mine.pixels!, scaled), 0, 0), 0)
    return () => window.clearTimeout(id)
  }, [mine, scaled])

  const correction = useMemo(() => (result && target ? makeRecipe(result.look, target) : null), [result, target])
  const remaining = useMemo(() => (correction ? steps(correction) : []), [correction])
  const corrected = useMemo(() => (correction && scaled ? mergeRecipe(scaled, correction) : null), [correction, scaled])

  function saveCorrected() {
    if (!corrected || !ref) return
    const name = `Match · ${ref.name.replace(/\.[^.]+$/, '')} (corrected)`
    download(new Blob([presetXmp(name, corrected, !!mine?.raw)], { type: 'application/rdf+xml' }), `${name.replace(/[^\w ·%()-]/g, '').replace(/\s+/g, '-')}.xmp`)
  }

  function savePreset() {
    if (!scaled || !ref) return
    const name = `Match · ${ref.name.replace(/\.[^.]+$/, '')}${strength < 100 ? ` ${strength}%` : ''}`
    download(new Blob([presetXmp(name, scaled, !!mine?.raw)], { type: 'application/rdf+xml' }), `${name.replace(/[^\w ·%-]/g, '').replace(/\s+/g, '-')}.xmp`)
  }

  const shown = full ? list : list.slice(0, 4)
  const quickAsks = ['Why does the reference look softer?', 'How do I get the glow on the lights?', 'What masks would make this closer?', 'Is my photo even a good match for this look?']
  const quickShare = list.length ? Math.round((list.slice(0, 4).reduce((a, s) => a + s.impact, 0) / Math.max(0.01, list.reduce((a, s) => a + s.impact, 0))) * 100) : 0

  return (
    <div className="lb">
      <div className="lb-inputs">
        <Drop label="The look you want" hint="e.g. one of Alex's shots (JPG or screenshot)" slot={ref} busy={busy === 'ref'} onFile={(f) => pick('ref', f)} />
        <span className="lb-arrow" aria-hidden="true">
          →
        </span>
        <Drop label="Your photo" hint="Best: your photo exported untouched from Lightroom. RAWs work too." slot={mine} busy={busy === 'mine'} onFile={(f) => pick('mine', f)} />
      </div>
      {error && <p className="gr-error">{error}</p>}

      <section className="lb-lib">
        <div className="lb-lib-head">
          <b>Your looks</b>
          {ref && !ref.savedId && ref.pixels && (naming === null ? (
            <button className="st-ghost" onClick={() => setNaming(ref.name.replace(/\.[^.]+$/, ''))}>
              ★ Save this look
            </button>
          ) : (
            <span className="lb-name">
              <input value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && keepLook()} placeholder="Name it, e.g. Alex night blue" autoFocus />
              <button className="btn-brass" onClick={keepLook} disabled={!naming.trim()}>
                Save
              </button>
            </span>
          ))}
        </div>
        {library.length === 0 ? (
          <p className="lb-lib-empty">Save a reference as a look and reuse it on any photo, mix it with another, or pre-edit a whole shoot with it in Auto-cull.</p>
        ) : (
          <div className="lb-lib-row">
            {library.map((l) => (
              <div key={l.id} className={`lb-look${ref?.savedId === l.id ? ' on' : ''}`}>
                <button onClick={() => useSaved(l)} title={`Use ${l.name}`}>
                  <img src={l.thumb} alt="" />
                  <span>{l.name}</span>
                </button>
                <i role="button" aria-label={`Delete ${l.name}`} onClick={() => forget(l.id)}>
                  ×
                </i>
              </div>
            ))}
          </div>
        )}
      </section>

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
                        c.width = mine.pixels!.w
                        c.height = mine.pixels!.h
                        c.getContext('2d')!.putImageData(render(mine.pixels!, scaled), 0, 0)
                      }
                    }}
                  />
                  <figcaption>Yours, matched</figcaption>
                </figure>
                <figure>
                  <img src={ref.url} alt="" />
                  <figcaption>{mixWith ? `Reference (mixed with ${mixWith.name})` : 'Reference'}</figcaption>
                </figure>
              </div>
            )}
            {ref && library.some((l) => l.id !== ref.savedId) && (
              <div className="lb-mix">
                <span>Mix in</span>
                <select value={mixId} onChange={(e) => setMixId(e.target.value)} aria-label="Look to mix in">
                  <option value="">nothing</option>
                  {library
                    .filter((l) => l.id !== ref.savedId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </select>
                {mixWith && (
                  <label>
                    <b>{100 - mixAmount}%</b> {ref.name} / <b>{mixAmount}%</b> {mixWith.name}
                    <input type="range" min={0} max={100} step={5} value={mixAmount} onChange={(e) => setMixAmount(+e.target.value)} />
                  </label>
                )}
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
            <div className="lb-check">
              <input ref={resultInput} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && checkResult(e.target.files[0]), (e.target.value = ''))} />
              <b>✓ Check my result</b>
              <small>Applied the preset? Export or screenshot what you got in Lightroom and drop it here. Sandy measures what's still off and gives you a corrected preset.</small>
              <button className="st-ghost" onClick={() => resultInput.current?.click()} disabled={checking}>
                {checking ? 'Measuring…' : result ? 'Check another result' : '+ Add my Lightroom result'}
              </button>
              {result && correction && (
                <div className="lb-check-out">
                  <div className="lb-check-thumbs">
                    <figure>
                      <img src={result.url} alt="" />
                      <figcaption>Your result</figcaption>
                    </figure>
                    <figure>
                      <img src={ref.url} alt="" />
                      <figcaption>Target</figcaption>
                    </figure>
                  </div>
                  {remaining.length === 0 ? (
                    <p className="lb-close">You're there. Nothing meaningful left to change.</p>
                  ) : (
                    <>
                      <b className="lb-still">Still to do</b>
                      <ol className="lb-still-list">
                        {remaining.slice(0, 4).map((s) => (
                          <li key={s.title}>
                            <span>{s.title}</span> <em>{s.moves.join(', ')}</em>
                          </li>
                        ))}
                      </ol>
                      <button className="btn-brass" onClick={saveCorrected}>
                        ⬇ Corrected preset
                      </button>
                      <small className="lb-note">Replace the first preset with this one (don't stack them). Repeat the check if it still needs a nudge.</small>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="lb-ask">
              <b>✦ Ask Sandy about this edit</b>
              <div className="lb-ask-chips">
                {quickAsks.map((q) => (
                  <button key={q} onClick={() => (setQuestion(q), ask(q))} disabled={asking}>
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  ask()
                }}
              >
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask anything about getting this look…" />
                <button className="st-ghost" disabled={asking || !question.trim()}>
                  {asking ? '…' : 'Ask'}
                </button>
              </form>
              {asking && <p className="lb-note st-loading">Sandy is looking at both photos…</p>}
              {answer && <p className="lb-answer">{answer}</p>}
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
