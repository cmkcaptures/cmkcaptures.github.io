// Finds the people in a photo (runs in the browser, free, nothing uploaded).
// Google's MediaPipe "selfie multiclass" model labels every pixel: background, hair, body skin, face skin, clothes, other.
// The Edit Lab uses it to match skin to skin and person to person, instead of guessing from colour and position.
import type { Pixels, Seg } from './look'

const VERSION = '0.10.14'
const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite'

type Segmenter = import('@mediapipe/tasks-vision').ImageSegmenter
let loading: Promise<Segmenter | null> | null = null

function load(): Promise<Segmenter | null> {
  if (!loading)
    loading = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
        const files = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`)
        const make = (delegate: 'GPU' | 'CPU') =>
          ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: MODEL, delegate },
            runningMode: 'IMAGE',
            outputConfidenceMasks: true,
            outputCategoryMask: false,
          })
        return await make('GPU').catch(() => make('CPU'))
      } catch {
        return null
      }
    })()
  return loading
}

/** Person + skin maps for a photo, or null if the model can't load (the Edit Lab then falls back to colour rules). */
export async function segment(px: Pixels): Promise<Seg | null> {
  const seg = await load()
  if (!seg) return null
  try {
    const s = Math.min(1, 512 / Math.max(px.w, px.h))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(px.w * s))
    c.height = Math.max(1, Math.round(px.h * s))
    const full = document.createElement('canvas')
    full.width = px.w
    full.height = px.h
    full.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.w, px.h), 0, 0)
    c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height)
    const res = seg.segment(c)
    const masks = res.confidenceMasks
    if (!masks || masks.length < 4) return null
    const w = masks[0].width
    const h = masks[0].height
    const bg = masks[0].getAsFloat32Array()
    const body = masks[2].getAsFloat32Array()
    const face = masks[3].getAsFloat32Array()
    const person = new Float32Array(w * h)
    const skin = new Float32Array(w * h)
    let cover = 0
    for (let i = 0; i < w * h; i++) {
      person[i] = 1 - bg[i]
      skin[i] = Math.min(1, body[i] + face[i])
      cover += person[i]
    }
    for (const m of masks) m.close()
    // Nobody found (or a tiny speck): don't pretend
    if (cover / (w * h) < 0.01) return null
    return { w, h, person, skin }
  } catch {
    return null
  }
}

/** Adds the person map to a photo in place (best effort). */
export async function withPeople(px: Pixels): Promise<Pixels> {
  const s = await segment(px)
  if (s) px.seg = s
  return px
}
