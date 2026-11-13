// Edit Lab v2: match any look with a model of Lightroom and a solver, calibrated to how Lightroom renders your camera.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Pixels } from './look'
import { loadPixels, mergeRecipe, presetXmp, steps } from './look'
import type { Calibration, Descriptor, FitResult, Params } from './engine'
import { blend, describeText, learnCalibration, matchScore, measureRef, prepare, renderImage, sameShot, scaleParams, scoreFor, toRecipe, blownShare } from './engine'
import type { SavedLook } from './looksApi'
import { deleteLook, listLooks, saveLook, thumbFrom } from './looksApi'
import { clearCalibration, loadCalibration, saveCalibration } from './calibration'
import { readRaw } from '../cull/raw'
import { download } from '../cull/folder'
import { sandyWrite } from '../studio/sandyWrite'
import './EditLab.css'

const RAW = /\.(arw|cr2|cr3|nef|raf|orf|rw2|dng)$/i

interface Shot {
  name: string
  url: string
  pixels: Pixels
  raw: boolean
}

/** A RAW becomes its (rotated) built-in JPEG; images pass through. */
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

async function toShot(file: File, max = 900): Promise<Shot> {
  const { blob, raw } = await toImageBlob(file)
  return { name: file.name, url: URL.createObjectURL(blob), pixels: await loadPixels(blob, max), raw }
}

/** Runs the solver in a background worker. */
function solve(px: Pixels, target: Descriptor, calib: Calibration | null, onProgress: (p: number) => void): Promise<FitResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ progress?: number; done?: FitResult }>) => {
      if (e.data.progress !== undefined) onProgress(e.data.progress)
      if (e.data.done) {
        resolve(e.data.done)
        worker.terminate()
      }
    }
    worker.onerror = (e) => {
      reject(new Error(e.message || 'The matcher crashed.'))
      worker.terminate()
    }
    worker.postMessage({ px, target, calib })
  })
}

function Drop({ label, hint, preview, count, busy, multiple, onFiles }: { label: string; hint: string; preview: string | null; count?: number; busy: boolean; multiple?: boolean; onFiles: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <button
      className={`lb-drop${over ? ' over' : ''}${preview ? ' has' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const f = [...e.dataTransfer.files]
        if (f.length) onFiles(multiple ? f : f.slice(0, 1))
      }}
    >
      <input ref={input} type="file" multiple={multiple} accept="image/*,.arw,.cr2,.cr3,.nef,.raf,.dng" hidden onChange={(e) => (e.target.files?.length && onFiles([...e.target.files]), (e.target.value = ''))} />
      {preview ? <img src={preview} alt="" /> : <span className="lb-drop-empty">{busy ? 'Reading…' : '+'}</span>}
      {count && count > 1 ? <span className="lb-count">{count} photos</span> : null}
      <span className="lb-drop-label">
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </button>
  )
}

export default function EditLab() {
  const [refs, setRefs] = useState<Shot[]>([])
  const [refName, setRefName] = useState('')
  const [savedRef, setSavedRef] = useState<SavedLook | null>(null)
  const [mine, setMine] = useState<Shot | null>(null)
  const [busy, setBusy] = useState<'ref' | 'mine' | null>(null)
  const [error, setError] = useState('')
  const [calib, setCalib] = useState<Calibration | null>(null)
  const [calibOpen, setCalibOpen] = useState(false)
  const [calibRaw, setCalibRaw] = useState<Shot | null>(null)
  const [calibNote, setCalibNote] = useState('')
  const [result, setResult] = useState<FitResult | null>(null)
  const [solving, setSolving] = useState(0)
  const [strength, setStrength] = useState(100)
  const [split, setSplit] = useState(50)
  const [show, setShow] = useState<'compare' | 'ref'>('compare')
  const [full, setFull] = useState(false)
  const [library, setLibrary] = useState<SavedLook[]>([])
  const [naming, setNaming] = useState<string | null>(null)
  const [mixId, setMixId] = useState('')
  const [mixAmount, setMixAmount] = useState(30)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [check, setCheck] = useState<FitResult | null>(null)
  const [checking, setChecking] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const before = useRef<HTMLCanvasElement>(null)
  const sideCanvas = useRef<HTMLCanvasElement>(null)
  const resultInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listLooks()
      .then((l) => setLibrary(l.filter((x) => (x.look as unknown as Descriptor).v === 2)))
      .catch(() => {})
    loadCalibration().then(setCalib).catch(() => {})
  }, [])

  const useCalib = mine?.raw ? calib : null

  // The target look: one or more reference photos (or a saved look), optionally mixed with another saved look.
  const refDesc = useMemo<Descriptor | null>(() => {
    if (savedRef) return savedRef.look as unknown as Descriptor
    if (!refs.length) return null
    return blend(refs.map((r) => ({ d: measureRef(r.pixels), w: 1 })))
  }, [refs, savedRef])
  const mixWith = library.find((l) => l.id === mixId)
  const target = useMemo<Descriptor | null>(() => {
    if (!refDesc) return null
    return mixWith ? blend([{ d: refDesc, w: 100 - mixAmount }, { d: mixWith.look as unknown as Descriptor, w: mixAmount }]) : refDesc
  }, [refDesc, mixWith, mixAmount])

  // Solve whenever the photo or target changes.
  useEffect(() => {
    if (!mine || !target) return
    let live = true
    setResult(null)
    setCheck(null)
    setSolving(0.01)
    solve(mine.pixels, target, useCalib, (p) => live && setSolving(Math.max(0.01, p)))
      .then((r) => live && (setResult(r), setSolving(0)))
      .catch((e: Error) => live && (setError(e.message), setSolving(0)))
    return () => {
      live = false
    }
  }, [mine, target, useCalib])

  const params: Params | null = useMemo(() => (result ? scaleParams(result.params, strength / 100) : null), [result, strength])
  const recipe = useMemo(() => (params ? toRecipe(params) : null), [params])
  const list = useMemo(() => (recipe ? steps(recipe) : []), [recipe])
  const prep = useMemo(() => (mine ? prepare(mine.pixels, 110, useCalib) : null), [mine, useCalib])
  const liveScore = useMemo(() => (prep && params && target ? scoreFor(prep, params, target) : null), [prep, params, target])

  // Draw the preview (same model the preset is built from).
  useEffect(() => {
    if (!mine || !params) return
    const { w, h } = mine.pixels
    const id = window.setTimeout(() => {
      const after = renderImage(mine.pixels, params, useCalib)
      const beforeImg = useCalib ? renderImage(mine.pixels, scaleParams(params, 0), useCalib) : new ImageData(new Uint8ClampedArray(mine.pixels.data), w, h)
      for (const [c, img] of [
        [canvas.current, after],
        [before.current, beforeImg],
        [sideCanvas.current, after],
      ] as const)
        if (c) {
          c.width = w
          c.height = h
          c.getContext('2d')!.putImageData(img, 0, 0)
        }
    }, 0)
    return () => window.clearTimeout(id)
  }, [mine, params, useCalib, show])

  async function pickRefs(files: File[]) {
    setError('')
    setBusy('ref')
    try {
      const shots = []
      for (const f of files.slice(0, 12)) shots.push(await toShot(f, 520))
      setRefs(shots)
      setSavedRef(null)
      setRefName(shots.length > 1 ? `${shots.length} reference photos` : shots[0].name.replace(/\.[^.]+$/, ''))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  async function pickMine(files: File[]) {
    setError('')
    setBusy('mine')
    try {
      setMine(await toShot(files[0]))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(null)
  }

  async function calibrate(files: File[], which: 'raw' | 'lr') {
    setError('')
    setCalibNote('')
    try {
      const shot = await toShot(files[0], 700)
      if (which === 'raw') {
        if (!shot.raw) throw new Error('First drop the RAW file (.ARW).')
        setCalibRaw(shot)
        setCalibNote('Now drop the same photo exported from Lightroom with no edits (JPG).')
        return
      }
      if (!calibRaw) throw new Error('Drop the RAW first.')
      if (!sameShot(calibRaw.pixels, shot.pixels)) throw new Error("Those don't look like the same photo. Use the same shot, uncropped, with no edits.")
      const c = learnCalibration(calibRaw.pixels, shot.pixels, calib)
      await saveCalibration(c)
      setCalib(c)
      setCalibRaw(null)
      setCalibNote(`Calibrated from ${c.pairs} photo${c.pairs === 1 ? '' : 's'}. RAWs are now measured the way Lightroom shows them.`)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function keepLook() {
    if (!refDesc || !naming?.trim()) return
    try {
      const thumb = refs[0] ? await thumbFrom(refs[0].url) : ''
      const saved = await saveLook(naming.trim(), refDesc as never, thumb)
      setLibrary((l) => [saved, ...l])
      setSavedRef(saved)
      setRefName(saved.name)
      setNaming(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function useSaved(s: SavedLook) {
    setSavedRef(s)
    setRefs([])
    setRefName(s.name)
    setMixId('')
  }

  async function checkResult(f: File) {
    if (!target) return
    setChecking(true)
    try {
      const shot = await toShot(f, 700)
      setCheck(await solve(shot.pixels, target, null, () => {}))
    } catch (e) {
      setError((e as Error).message)
    }
    setChecking(false)
  }

  const corrected = useMemo(() => (check && recipe ? mergeRecipe(recipe, toRecipe(check.params)) : null), [check, recipe])
  const remaining = useMemo(() => (check ? steps(toRecipe(check.params)) : []), [check])

  function savePreset(which: 'main' | 'corrected') {
    const r = which === 'main' ? recipe : corrected
    if (!r) return
    const name = `Match · ${refName}${which === 'corrected' ? ' (corrected)' : strength !== 100 ? ` ${strength}%` : ''}`
    download(new Blob([presetXmp(name, r, !!mine?.raw)], { type: 'application/rdf+xml' }), `${name.replace(/[^\w ·%()-]/g, '').replace(/\s+/g, '-')}.xmp`)
  }

  async function ask(q = question) {
    if (!q.trim() || !target || !mine) return
    setAsking(true)
    setAnswer(null)
    const mineDesc = measureRef(mine.pixels)
    const text = await sandyWrite(
      `I'm matching my photo to a reference look in Lightroom. My photo: ${describeText(mineDesc)}. Reference (${refName}${mixWith ? ` mixed with ${mixWith.name}` : ''}): ${describeText(target)}. The solver's settings: ${list.map((s) => `${s.title} (${s.moves.join(', ')})`).join('; ')}. Match score ${liveScore ?? '?'}/100. My question: ${q}. Answer like an experienced nightlife photographer and Lightroom editor: specific sliders, masks or lighting fixes, short and practical. If the gap is about light (flash vs ambient) rather than editing, say so.`,
    )
    setAnswer(text ?? "Couldn't reach Sandy right now. Try again in a moment.")
    setAsking(false)
  }

  const shown = full ? list : list.slice(0, 4)
  const beforeScore = result ? matchScore(result.before) : null
  const refPreview = refs[0]?.url ?? savedRef?.thumb ?? null

  return (
    <div className="lb">
      <div className="lb-inputs">
        <Drop label="The look you want" hint={refs.length ? refName : 'Drop 1–10 of their photos. More photos = their style, not one photo.'} preview={refPreview} count={refs.length} multiple busy={busy === 'ref'} onFiles={pickRefs} />
        <span className="lb-arrow" aria-hidden="true">
          →
        </span>
        <Drop label="Your photo" hint={mine ? `${mine.name}${mine.raw ? (calib ? ' · RAW, calibrated' : ' · RAW (calibrate for best accuracy)') : ''}` : 'A RAW off the card, or an untouched Lightroom export'} preview={mine?.url ?? null} busy={busy === 'mine'} onFiles={pickMine} />
      </div>
      {error && <p className="gr-error">{error}</p>}

      <section className={`lb-calib${calib ? ' ok' : ''}`}>
        <div className="lb-calib-head">
          <span>
            <b>{calib ? '✓ Calibrated to your Lightroom' : '⚠ Not calibrated yet'}</b>
            <small>{calib ? `Learned from ${calib.pairs} photo${calib.pairs === 1 ? '' : 's'}. RAWs are measured the way Lightroom actually shows them.` : "Do this once: it's the single biggest accuracy boost for RAWs."}</small>
          </span>
          <button className="st-ghost" onClick={() => setCalibOpen((o) => !o)}>
            {calibOpen ? 'Close' : calib ? 'Add another' : 'Calibrate'}
          </button>
        </div>
        {calibOpen && (
          <div className="lb-calib-body">
            <p>
              Pick any RAW. In Lightroom, reset it (no edits, no preset, default profile) and export it as a JPG. Drop the <b>RAW</b> first, then the <b>export</b>.
            </p>
            <div className="lb-calib-drops">
              <Drop label="1 · The RAW" hint={calibRaw ? calibRaw.name : '.ARW straight off the card'} preview={calibRaw?.url ?? null} busy={false} onFiles={(f) => calibrate(f, 'raw')} />
              <Drop label="2 · Lightroom export" hint="Same photo, untouched, as JPG" preview={null} busy={false} onFiles={(f) => calibrate(f, 'lr')} />
            </div>
            {calibNote && <p className="lb-calib-note">{calibNote}</p>}
            {calib && (
              <button className="lb-link" onClick={() => (clearCalibration(), setCalib(null))}>
                Reset calibration
              </button>
            )}
          </div>
        )}
      </section>

      <section className="lb-lib">
        <div className="lb-lib-head">
          <b>Your looks</b>
          {refs.length > 0 && !savedRef &&
            (naming === null ? (
              <button className="st-ghost" onClick={() => setNaming(refName)}>
                ★ Save this look
              </button>
            ) : (
              <span className="lb-name">
                <input value={naming} onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && keepLook()} placeholder="e.g. Alex night blue" autoFocus />
                <button className="btn-brass" onClick={keepLook} disabled={!naming.trim()}>
                  Save
                </button>
              </span>
            ))}
        </div>
        {library.length === 0 ? (
          <p className="lb-lib-empty">Save a look (ideally from 5+ of their photos) and reuse it on any photo, mix it, or pre-edit a whole shoot with it in Auto-cull.</p>
        ) : (
          <div className="lb-lib-row">
            {library.map((l) => (
              <div key={l.id} className={`lb-look${savedRef?.id === l.id ? ' on' : ''}`}>
                <button onClick={() => useSaved(l)} title={`Use ${l.name}`}>
                  {l.thumb ? <img src={l.thumb} alt="" /> : <span className="lb-look-blank" />}
                  <span>{l.name}</span>
                </button>
                <i role="button" aria-label={`Delete ${l.name}`} onClick={() => (setLibrary((x) => x.filter((y) => y.id !== l.id)), deleteLook(l.id).catch(() => {}))}>
                  ×
                </i>
              </div>
            ))}
          </div>
        )}
      </section>

      {!target || !mine ? (
        <div className="lb-empty">
          <b>How it works:</b> Sandy builds a model of Lightroom's tools and runs hundreds of trial edits on your photo, keeping the settings that land closest to the reference: tone curve, white balance, all 8 colours, 3-way colour grading, vibrance and vignette. Skin tones count most. You get a match score, a preview and a preset.
        </div>
      ) : solving ? (
        <div className="lb-solving">
          <div className="ap-orb" />
          <b>Matching… {Math.round(solving * 100)}%</b>
          <small>Trying edits on your photo and keeping what gets closer.</small>
          <div className="lb-bar">
            <i style={{ width: `${Math.round(solving * 100)}%` }} />
          </div>
        </div>
      ) : (
        result &&
        params &&
        recipe && (
          <div className="lb-result">
            <section className="lb-stage">
              <div className="lb-score">
                <span>
                  Match <b>{beforeScore}%</b> → <b className="hi">{liveScore}%</b>
                </span>
                <div className="lb-scorebar">
                  <i className="b" style={{ width: `${beforeScore}%` }} />
                  <i className="a" style={{ width: `${liveScore}%` }} />
                </div>
                {mine && blownShare(mine.pixels) > 0.02 && <small>⚠ Part of your subject is blown out (pure white) in the original, usually flash too strong or too close. No edit can bring that detail back, so those bits stay white. Next time: lower the flash power or bounce it.</small>}
                {liveScore !== null && liveScore < 70 && <small>Below 70% usually means the lighting differs (flash vs ambient, colour of the venue lights). Ask Sandy what to change on the shoot.</small>}
              </div>
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
                    <canvas ref={sideCanvas} />
                    <figcaption>Yours, matched</figcaption>
                  </figure>
                  <figure>
                    {refPreview ? <img src={refPreview} alt="" /> : <span className="lb-look-blank" />}
                    <figcaption>{mixWith ? `Reference + ${mixWith.name}` : 'Reference'}</figcaption>
                  </figure>
                </div>
              )}
              {library.some((l) => l.id !== savedRef?.id) && (
                <div className="lb-mix">
                  <span>Mix in</span>
                  <select value={mixId} onChange={(e) => setMixId(e.target.value)} aria-label="Look to mix in">
                    <option value="">nothing</option>
                    {library
                      .filter((l) => l.id !== savedRef?.id)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                  </select>
                  {mixWith && (
                    <label>
                      <b>{100 - mixAmount}%</b> / <b>{mixAmount}%</b>
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
            </section>

            <section className="lb-recipe">
              <header>
                <h3>Your recipe</h3>
                <p>{list.length ? `Biggest wins first. ${Math.min(4, list.length)} steps shown.` : 'Already a match.'}</p>
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
                  {full ? 'Show just the biggest 4' : `Show all ${list.length} steps`}
                </button>
              )}
              <div className="lb-actions">
                <button className="btn-brass" onClick={() => savePreset('main')}>
                  ⬇ Lightroom preset
                </button>
              </div>
              <small className="lb-note">Import: Develop › Presets › + › Import Presets. The preset's Amount slider works like Strength here.{mine.raw ? ' White balance: set it by hand with the first step (RAW Kelvin is absolute).' : ''}</small>

              <div className="lb-check">
                <input ref={resultInput} type="file" accept="image/*" hidden onChange={(e) => (e.target.files?.[0] && checkResult(e.target.files[0]), (e.target.value = ''))} />
                <b>✓ Check my result</b>
                <small>After applying the preset, export or screenshot what Lightroom gives you and drop it here. Sandy measures the gap and builds a corrected preset.</small>
                <button className="st-ghost" onClick={() => resultInput.current?.click()} disabled={checking}>
                  {checking ? 'Measuring…' : check ? 'Check another result' : '+ Add my Lightroom result'}
                </button>
                {check && (
                  <div className="lb-check-out">
                    <p className="lb-still">
                      Your Lightroom result matches <b>{matchScore(check.before)}%</b>. Corrected preset reaches about <b>{matchScore(check.after)}%</b>.
                    </p>
                    {remaining.length > 0 && (
                      <ol className="lb-still-list">
                        {remaining.slice(0, 4).map((s) => (
                          <li key={s.title}>
                            <span>{s.title}</span> <em>{s.moves.join(', ')}</em>
                          </li>
                        ))}
                      </ol>
                    )}
                    <button className="btn-brass" onClick={() => savePreset('corrected')}>
                      ⬇ Corrected preset
                    </button>
                  </div>
                )}
              </div>

              <div className="lb-ask">
                <b>✦ Ask Sandy about this edit</b>
                <div className="lb-ask-chips">
                  {['Why does the reference look softer?', 'How do I get the glow on the lights?', 'What masks would get this closer?', 'What should I change on the shoot to get this look?'].map((q) => (
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
            </section>
          </div>
        )
      )}
    </div>
  )
}
