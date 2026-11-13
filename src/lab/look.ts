// Edit Lab engine: measures a photo's "look", works out the Lightroom moves that turn one look into another,
// and renders an on-device preview of the result. Everything runs in the browser.

export const BANDS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'] as const
export type Band = (typeof BANDS)[number]
const BAND_HUE: Record<Band, number> = { Red: 0, Orange: 30, Yellow: 60, Green: 120, Aqua: 180, Blue: 225, Purple: 270, Magenta: 315 }

export interface Look {
  q: number[] // luminance at 1,5,10,25,50,75,90,95,99 percentiles (0-255)
  yb: number // warm (+) / cool (-) cast in the midtones
  mg: number // magenta (+) / green (-) cast in the midtones
  tones: { shadows: [number, number, number]; highlights: [number, number, number] } // average colour (rgb 0-1) minus grey
  sat: number // mean saturation 0-1
  bands: Record<Band, { share: number; sat: number; lum: number; hue: number }>
  vignette: number // edge brightness / centre brightness
  clarity: number // local contrast
  grain: number // fine noise in flat areas
}

export const Q = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]

export interface Pixels {
  w: number
  h: number
  data: Uint8ClampedArray
}

export async function loadPixels(blob: Blob, max = 640): Promise<Pixels> {
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * s))
  const h = Math.max(1, Math.round(bmp.height * s))
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return { w, h, data: ctx.getImageData(0, 0, w, h).data }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

function bandOf(h: number): Band {
  let best: Band = 'Red'
  let bd = 999
  for (const b of BANDS) {
    const d = Math.min(Math.abs(h - BAND_HUE[b]), 360 - Math.abs(h - BAND_HUE[b]))
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

export function measure(px: Pixels): Look {
  const { w, h, data } = px
  const n = w * h
  const lum = new Float32Array(n)
  const hist = new Uint32Array(256)
  let yb = 0
  let mg = 0
  let midN = 0
  let satSum = 0
  const tone = { shadows: [0, 0, 0, 0], highlights: [0, 0, 0, 0] }
  const bandAcc: Record<string, { n: number; sat: number; lum: number; hx: number; hy: number }> = {}
  for (const b of BANDS) bandAcc[b] = { n: 0, sat: 0, lum: 0, hx: 0, hy: 0 }

  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    lum[i] = l * 255
    hist[Math.min(255, Math.round(l * 255))]++
    const [hu, s, ll] = rgbToHsl(r, g, b)
    satSum += s
    if (l > 0.25 && l < 0.75) {
      yb += (r + g) / 2 - b
      mg += (r + b) / 2 - g
      midN++
    }
    const t = l < 0.3 ? tone.shadows : l > 0.7 ? tone.highlights : null
    if (t) {
      t[0] += r - l
      t[1] += g - l
      t[2] += b - l
      t[3]++
    }
    if (s > 0.15 && ll > 0.08 && ll < 0.92) {
      const a = bandAcc[bandOf(hu)]
      a.n++
      a.sat += s
      a.lum += ll
      a.hx += Math.cos((hu * Math.PI) / 180)
      a.hy += Math.sin((hu * Math.PI) / 180)
    }
  }

  const q: number[] = []
  let acc = 0
  let qi = 0
  for (let v = 0; v < 256 && qi < Q.length; v++) {
    acc += hist[v]
    while (qi < Q.length && acc >= Q[qi] * n) {
      q.push(v)
      qi++
    }
  }
  while (q.length < Q.length) q.push(255)

  // Vignette: border ring vs centre
  let edge = 0
  let edgeN = 0
  let centre = 0
  let centreN = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2)
      const dy = (y - h / 2) / (h / 2)
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d > 0.95) {
        edge += lum[y * w + x]
        edgeN++
      } else if (d < 0.45) {
        centre += lum[y * w + x]
        centreN++
      }
    }

  // Local contrast (clarity) and fine noise (grain)
  let local = 0
  let noise = 0
  let flatN = 0
  for (let y = 2; y < h - 2; y += 2)
    for (let x = 2; x < w - 2; x += 2) {
      const i = y * w + x
      const blur = (lum[i - 2] + lum[i + 2] + lum[i - 2 * w] + lum[i + 2 * w]) / 4
      local += Math.abs(lum[i] - blur)
      const lap = Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w])
      const grad = Math.abs(lum[i + 2] - lum[i - 2]) + Math.abs(lum[i + 2 * w] - lum[i - 2 * w])
      if (grad < 12) {
        noise += lap
        flatN++
      }
    }

  const bands = {} as Look['bands']
  for (const b of BANDS) {
    const a = bandAcc[b]
    bands[b] = a.n
      ? { share: a.n / n, sat: a.sat / a.n, lum: a.lum / a.n, hue: ((Math.atan2(a.hy, a.hx) * 180) / Math.PI + 360) % 360 }
      : { share: 0, sat: 0, lum: 0, hue: BAND_HUE[b] }
  }
  const avg = (t: number[]) => (t[3] ? ([t[0] / t[3], t[1] / t[3], t[2] / t[3]] as [number, number, number]) : ([0, 0, 0] as [number, number, number]))
  return {
    q,
    yb: midN ? yb / midN : 0,
    mg: midN ? mg / midN : 0,
    tones: { shadows: avg(tone.shadows), highlights: avg(tone.highlights) },
    sat: satSum / n,
    bands,
    vignette: centreN && edgeN ? edge / edgeN / Math.max(1, centre / centreN) : 1,
    clarity: local / Math.max(1, (w * h) / 4),
    grain: flatN ? noise / flatN : 0,
  }
}

/** Blend several looks (for mixing references). */
export function mixLooks(parts: { look: Look; weight: number }[]): Look {
  const total = parts.reduce((a, p) => a + p.weight, 0) || 1
  const m = (f: (l: Look) => number) => parts.reduce((a, p) => a + f(p.look) * p.weight, 0) / total
  const bands = {} as Look['bands']
  for (const b of BANDS) bands[b] = { share: m((l) => l.bands[b].share), sat: m((l) => l.bands[b].sat), lum: m((l) => l.bands[b].lum), hue: m((l) => l.bands[b].hue) }
  return {
    q: Q.map((_, i) => m((l) => l.q[i])),
    yb: m((l) => l.yb),
    mg: m((l) => l.mg),
    tones: {
      shadows: [0, 1, 2].map((i) => m((l) => l.tones.shadows[i])) as [number, number, number],
      highlights: [0, 1, 2].map((i) => m((l) => l.tones.highlights[i])) as [number, number, number],
    },
    sat: m((l) => l.sat),
    bands,
    vignette: m((l) => l.vignette),
    clarity: m((l) => l.clarity),
    grain: m((l) => l.grain),
  }
}

// ---------------- Recipe ----------------

export interface Recipe {
  exposure: number
  temp: number // Kelvin-ish shift (+ warmer)
  tint: number // + magenta
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  curve: [number, number][] // tone curve points after exposure
  vibrance: number
  hsl: Record<Band, { hue: number; sat: number; lum: number }>
  grade: { shadows: { hue: number; sat: number }; highlights: { hue: number; sat: number } }
  vignette: number
  clarity: number
  grain: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const r5 = (v: number) => Math.round(v / 5) * 5

function tintToGrade(delta: [number, number, number]): { hue: number; sat: number } {
  const mag = Math.hypot(...delta)
  if (mag < 0.008) return { hue: 0, sat: 0 }
  const [hu] = rgbToHsl(...(delta.map((d) => clamp(0.5 + d * 4, 0, 1)) as [number, number, number]))
  return { hue: Math.round(hu), sat: Math.round(clamp(mag * 350, 0, 60)) }
}

export function makeRecipe(from: Look, to: Look): Recipe {
  const exposure = clamp(Math.log2(Math.max(4, to.q[4]) / Math.max(4, from.q[4])), -2.5, 2.5)
  const k = 2 ** exposure
  const after = from.q.map((v) => Math.min(255, v * k))
  const spread = (l: number[]) => Math.max(4, l[5] - l[3])
  const contrast = clamp((spread(to.q) / spread(after) - 1) * 120, -100, 100)
  const delta = (i: number) => to.q[i] - after[i]
  const hsl = {} as Recipe['hsl']
  for (const b of BANDS) {
    const f = from.bands[b]
    const t = to.bands[b]
    if (f.share < 0.01 || t.share < 0.01) {
      hsl[b] = { hue: 0, sat: f.share >= 0.01 && t.share < 0.004 ? -40 : 0, lum: 0 }
      continue
    }
    let dh = t.hue - f.hue
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
    hsl[b] = { hue: Math.round(clamp(dh * 1.5, -40, 40)), sat: Math.round(clamp((t.sat / Math.max(0.08, f.sat) - 1) * 70, -70, 60)), lum: Math.round(clamp((t.lum - f.lum) * 160, -60, 60)) }
  }
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]) as [number, number, number]
  return {
    exposure: Math.round(exposure * 100) / 100,
    temp: Math.round(clamp((to.yb - from.yb) * 9000, -2500, 2500) / 50) * 50,
    tint: Math.round(clamp((to.mg - from.mg) * 250, -60, 60)),
    contrast: r5(contrast),
    highlights: r5(clamp((delta(7) - delta(5)) * 0.8, -70, 70)),
    shadows: r5(clamp((delta(2) - delta(3)) * 1.1 + delta(2) * 0.6, -70, 70)),
    whites: r5(clamp(delta(8) * 0.7, -60, 60)),
    blacks: r5(clamp(delta(0) * 1.2, -70, 70)),
    curve: [[0, Math.round(clamp(to.q[0] - after[0] * 0.5, 0, 60))], ...[1, 3, 4, 5, 7].map((i) => [Math.round(after[i]), Math.round(to.q[i])] as [number, number]), [255, Math.round(clamp(255 - (after[8] - to.q[8]), 200, 255))]],
    vibrance: r5(clamp((to.sat / Math.max(0.05, from.sat) - 1) * 60, -60, 60)),
    hsl,
    grade: { shadows: tintToGrade(sub(to.tones.shadows, from.tones.shadows)), highlights: tintToGrade(sub(to.tones.highlights, from.tones.highlights)) },
    vignette: r5(clamp((to.vignette - from.vignette) * 100, -50, 30)),
    clarity: r5(clamp((to.clarity / Math.max(0.5, from.clarity) - 1) * 50, -50, 50)),
    grain: r5(clamp((to.grain - from.grain) * 4, 0, 50)),
  }
}

export function scaleRecipe(r: Recipe, s: number): Recipe {
  const m = (v: number) => Math.round(v * s * 100) / 100
  const hsl = {} as Recipe['hsl']
  for (const b of BANDS) hsl[b] = { hue: Math.round(r.hsl[b].hue * s), sat: Math.round(r.hsl[b].sat * s), lum: Math.round(r.hsl[b].lum * s) }
  return {
    ...r,
    exposure: m(r.exposure),
    temp: Math.round(r.temp * s),
    tint: Math.round(r.tint * s),
    contrast: Math.round(r.contrast * s),
    highlights: Math.round(r.highlights * s),
    shadows: Math.round(r.shadows * s),
    whites: Math.round(r.whites * s),
    blacks: Math.round(r.blacks * s),
    curve: r.curve.map(([x, y]) => [x, Math.round(x + (y - x) * s)]),
    vibrance: Math.round(r.vibrance * s),
    hsl,
    grade: { shadows: { ...r.grade.shadows, sat: Math.round(r.grade.shadows.sat * s) }, highlights: { ...r.grade.highlights, sat: Math.round(r.grade.highlights.sat * s) } },
    vignette: Math.round(r.vignette * s),
    clarity: Math.round(r.clarity * s),
    grain: Math.round(r.grain * s),
  }
}

// ---------------- Steps (the "most efficient" order) ----------------

export interface Step {
  panel: string
  title: string
  moves: string[]
  why: string
  impact: number // 0-1, used for ordering and the impact bar
}

const sgn = (v: number, unit = '') => `${v > 0 ? '+' : ''}${v}${unit}`
const hueName = (h: number) => (h < 15 || h >= 345 ? 'red' : h < 45 ? 'orange' : h < 70 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'magenta')

export function steps(r: Recipe): Step[] {
  const out: Step[] = []
  if (Math.abs(r.temp) >= 150 || Math.abs(r.tint) >= 5)
    out.push({
      panel: 'Basic › White balance',
      title: r.temp < 0 ? 'Cool it down' : 'Warm it up',
      moves: [Math.abs(r.temp) >= 150 ? `Temp ${sgn(r.temp)}K` : '', Math.abs(r.tint) >= 5 ? `Tint ${sgn(r.tint)}` : ''].filter(Boolean),
      why: `The reference sits ${r.temp < 0 ? 'cooler (bluer)' : 'warmer (more orange)'}${Math.abs(r.tint) >= 5 ? ` and a touch more ${r.tint > 0 ? 'magenta' : 'green'}` : ''}. Fix this first: every other colour decision depends on it.`,
      impact: Math.min(1, Math.abs(r.temp) / 1500 + Math.abs(r.tint) / 60),
    })
  if (Math.abs(r.exposure) >= 0.1)
    out.push({ panel: 'Basic › Light', title: r.exposure > 0 ? 'Brighten overall' : 'Darken overall', moves: [`Exposure ${sgn(r.exposure)}`], why: `The reference's midtones are ${r.exposure > 0 ? 'brighter' : 'darker'} than yours.`, impact: Math.min(1, Math.abs(r.exposure) / 1.2) })
  const light = [
    Math.abs(r.contrast) >= 8 ? `Contrast ${sgn(r.contrast)}` : '',
    Math.abs(r.highlights) >= 8 ? `Highlights ${sgn(r.highlights)}` : '',
    Math.abs(r.shadows) >= 8 ? `Shadows ${sgn(r.shadows)}` : '',
    Math.abs(r.whites) >= 8 ? `Whites ${sgn(r.whites)}` : '',
    Math.abs(r.blacks) >= 8 ? `Blacks ${sgn(r.blacks)}` : '',
  ].filter(Boolean)
  if (light.length)
    out.push({
      panel: 'Basic › Light',
      title: 'Shape the light',
      moves: light,
      why: `${r.blacks < -8 ? 'Deeper blacks' : r.blacks > 8 ? 'Lifted, softer blacks' : 'Similar blacks'}${r.shadows > 8 ? ', more detail in the shadows' : r.shadows < -8 ? ', darker shadows' : ''}${r.highlights < -8 ? ', calmer highlights' : ''}. This is most of the "feel".`,
      impact: Math.min(1, (Math.abs(r.contrast) + Math.abs(r.shadows) + Math.abs(r.blacks) + Math.abs(r.highlights)) / 160),
    })
  const lift = r.curve[0][1]
  if (lift >= 6)
    out.push({ panel: 'Tone curve', title: 'Fade the blacks', moves: [`Drag the bottom-left point up to ${lift}`], why: 'The reference has a matte, faded black (nothing is pure black). That gives the film-style softness.', impact: Math.min(1, lift / 30) })
  const hslMoves: string[] = []
  let hslImpact = 0
  for (const b of BANDS) {
    const v = r.hsl[b]
    const bits = [Math.abs(v.hue) >= 6 ? `Hue ${sgn(v.hue)}` : '', Math.abs(v.sat) >= 10 ? `Sat ${sgn(v.sat)}` : '', Math.abs(v.lum) >= 8 ? `Lum ${sgn(v.lum)}` : ''].filter(Boolean)
    if (bits.length) {
      hslMoves.push(`${b}: ${bits.join(', ')}`)
      hslImpact += Math.abs(v.sat) / 100 + Math.abs(v.lum) / 100 + Math.abs(v.hue) / 60
    }
  }
  if (Math.abs(r.vibrance) >= 8) hslMoves.unshift(`Vibrance ${sgn(r.vibrance)}`)
  if (hslMoves.length)
    out.push({ panel: 'HSL / Color', title: 'Match the colours', moves: hslMoves.slice(0, 6), why: 'Brings each colour (skin, venue lights, LEDs) to how the reference renders them.', impact: Math.min(1, hslImpact / 3 + Math.abs(r.vibrance) / 100) })
  const g = r.grade
  if (g.shadows.sat >= 5 || g.highlights.sat >= 5)
    out.push({
      panel: 'Color grading',
      title: 'Tint the shadows and highlights',
      moves: [g.shadows.sat >= 5 ? `Shadows: hue ${g.shadows.hue}, sat ${g.shadows.sat}` : '', g.highlights.sat >= 5 ? `Highlights: hue ${g.highlights.hue}, sat ${g.highlights.sat}` : ''].filter(Boolean),
      why: `The reference pushes ${g.shadows.sat >= 5 ? `${hueName(g.shadows.hue)} into the shadows` : ''}${g.shadows.sat >= 5 && g.highlights.sat >= 5 ? ' and ' : ''}${g.highlights.sat >= 5 ? `${hueName(g.highlights.hue)} into the highlights` : ''}. That's the signature colour of the look.`,
      impact: Math.min(1, (g.shadows.sat + g.highlights.sat) / 50),
    })
  const fx = [Math.abs(r.clarity) >= 8 ? `Clarity ${sgn(r.clarity)}` : '', Math.abs(r.vignette) >= 8 ? `Vignette ${sgn(r.vignette)}` : '', r.grain >= 10 ? `Grain ${r.grain}` : ''].filter(Boolean)
  if (fx.length) out.push({ panel: 'Effects', title: 'Finishing touches', moves: fx, why: 'Texture and edges. Small, but they sell the style.', impact: Math.min(1, (Math.abs(r.clarity) + Math.abs(r.vignette) + r.grain) / 150) })
  return out.sort((a, b) => b.impact - a.impact)
}

// ---------------- Preview render ----------------

/** Applies the recipe to the pixels (an approximation of what Lightroom will do). */
export function render(src: Pixels, r: Recipe): ImageData {
  const { w, h, data } = src
  const out = new ImageData(w, h)
  const k = 2 ** r.exposure
  // White balance as channel gains
  const wt = r.temp / 9000
  const wg = r.tint / 250
  const gain = [1 + wt * 0.9 + wg * 0.3, 1 - wg * 0.6, 1 - wt * 0.9 + wg * 0.3]
  // Luminance LUT from contrast/tone sliders + curve
  const pts = [...r.curve].sort((a, b) => a[0] - b[0])
  const curve = (v: number) => {
    for (let i = 1; i < pts.length; i++)
      if (v <= pts[i][0]) {
        const [x0, y0] = pts[i - 1]
        const [x1, y1] = pts[i]
        return y0 + ((v - x0) / Math.max(1, x1 - x0)) * (y1 - y0)
      }
    return pts[pts.length - 1][1]
  }
  const lut = new Float32Array(256)
  for (let v = 0; v < 256; v++) lut[v] = clamp(curve(v), 0, 255)
  const vib = 1 + r.vibrance / 150
  const shadowTint = gradeRgb(r.grade.shadows)
  const highTint = gradeRgb(r.grade.highlights)
  const vig = r.vignette / 100
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let R = (data[i] / 255) * gain[0] * k
      let G = (data[i + 1] / 255) * gain[1] * k
      let B = (data[i + 2] / 255) * gain[2] * k
      const L = clamp(0.299 * R + 0.587 * G + 0.114 * B, 0.0001, 1)
      const L2 = lut[Math.round(L * 255)] / 255
      const s = L2 / L
      R *= s
      G *= s
      B *= s
      // per-band hue/saturation/luminance
      const [hu, sa, ll] = rgbToHsl(clamp(R, 0, 1), clamp(G, 0, 1), clamp(B, 0, 1))
      const band = r.hsl[bandOf(hu)]
      const ns = clamp(sa * vib * (1 + band.sat / 100), 0, 1)
      const nl = clamp(ll + (band.lum / 100) * 0.25 * ns, 0, 1)
      ;[R, G, B] = hslToRgb((hu + band.hue + 360) % 360, ns, nl)
      // colour grading
      const wS = clamp((0.45 - nl) / 0.45, 0, 1)
      const wH = clamp((nl - 0.55) / 0.45, 0, 1)
      R += shadowTint[0] * wS + highTint[0] * wH
      G += shadowTint[1] * wS + highTint[1] * wH
      B += shadowTint[2] * wS + highTint[2] * wH
      // vignette
      const dx = (x - w / 2) / (w / 2)
      const dy = (y - h / 2) / (h / 2)
      const v = 1 + vig * 0.6 * Math.max(0, Math.hypot(dx, dy) - 0.4)
      let gr = 0
      if (r.grain > 0) gr = (Math.random() - 0.5) * (r.grain / 100) * 0.18
      out.data[i] = clamp((R * v + gr) * 255, 0, 255)
      out.data[i + 1] = clamp((G * v + gr) * 255, 0, 255)
      out.data[i + 2] = clamp((B * v + gr) * 255, 0, 255)
      out.data[i + 3] = 255
    }
  return out
}

function gradeRgb(g: { hue: number; sat: number }): [number, number, number] {
  if (!g.sat) return [0, 0, 0]
  const [r, gg, b] = hslToRgb(g.hue, 1, 0.5)
  const a = (g.sat / 100) * 0.18
  return [(r - 0.5) * a, (gg - 0.5) * a, (b - 0.5) * a]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const hh = h / 360
  return [f(hh + 1 / 3), f(hh), f(hh - 1 / 3)]
}

// ---------------- Lightroom preset ----------------

export function presetXmp(name: string, r: Recipe, raw: boolean): string {
  const uuid = crypto.randomUUID().replace(/-/g, '').toUpperCase()
  const hsl = BANDS.map((b) => `    crs:HueAdjustment${b}="${r.hsl[b].hue}"\n    crs:SaturationAdjustment${b}="${r.hsl[b].sat}"\n    crs:LuminanceAdjustment${b}="${r.hsl[b].lum}"`).join('\n')
  // RAW white balance is absolute in Lightroom, so for RAWs the recipe tells you the Temp/Tint move instead of baking it in.
  const wb = raw ? `    crs:WhiteBalance="As Shot"` : `    crs:IncrementalTemperature="${Math.round(r.temp / 60)}"\n    crs:IncrementalTint="${r.tint}"`
  const curve = r.curve.map(([x, y]) => `      <rdf:li>${x}, ${y}</rdf:li>`).join('\n')
  return `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="PhotoFlow Edit Lab">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    crs:PresetType="Normal"
    crs:Cluster="PhotoFlow"
    crs:UUID="${uuid}"
    crs:SupportsAmount2="True"
    crs:SupportsAmount="True"
    crs:SupportsColor="True"
    crs:SupportsMonochrome="True"
    crs:SupportsHighDynamicRange="True"
    crs:SupportsNormalDynamicRange="True"
    crs:SupportsSceneReferred="True"
    crs:SupportsOutputReferred="True"
    crs:Version="15.0"
    crs:ProcessVersion="15.4"
${wb}
    crs:Exposure2012="${r.exposure > 0 ? '+' : ''}${r.exposure.toFixed(2)}"
    crs:Contrast2012="${r.contrast}"
    crs:Highlights2012="${r.highlights}"
    crs:Shadows2012="${r.shadows}"
    crs:Whites2012="${r.whites}"
    crs:Blacks2012="${r.blacks}"
    crs:Clarity2012="${r.clarity}"
    crs:Vibrance="${r.vibrance}"
${hsl}
    crs:ColorGradeShadowHue="${r.grade.shadows.hue}"
    crs:ColorGradeShadowSat="${r.grade.shadows.sat}"
    crs:ColorGradeHighlightHue="${r.grade.highlights.hue}"
    crs:ColorGradeHighlightSat="${r.grade.highlights.sat}"
    crs:ColorGradeBlending="50"
    crs:PostCropVignetteAmount="${r.vignette}"
    crs:PostCropVignetteMidpoint="50"
    crs:PostCropVignetteFeather="60"
    crs:PostCropVignetteStyle="1"
    crs:GrainAmount="${r.grain}"
    crs:GrainSize="25"
    crs:GrainFrequency="50"
    crs:ToneCurveName2012="Custom"
    crs:HasSettings="True">
   <crs:Name>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${name.replace(/[<&"]/g, '')}</rdf:li>
    </rdf:Alt>
   </crs:Name>
   <crs:Group>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">PhotoFlow</rdf:li>
    </rdf:Alt>
   </crs:Group>
   <crs:ToneCurvePV2012>
    <rdf:Seq>
${curve}
    </rdf:Seq>
   </crs:ToneCurvePV2012>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`
}

/** The recipe as Lightroom settings for a photo's own sidecar (used when pre-editing a whole shoot). */
export function recipeCrs(r: Recipe): { attrs: string; inner: string } {
  const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`)
  const attrs = [
    `crs:Version="15.0"`,
    `crs:ProcessVersion="15.4"`,
    `crs:HasSettings="True"`,
    `crs:WhiteBalance="As Shot"`,
    `crs:Exposure2012="${r.exposure > 0 ? '+' : ''}${r.exposure.toFixed(2)}"`,
    `crs:Contrast2012="${sign(r.contrast)}"`,
    `crs:Highlights2012="${sign(r.highlights)}"`,
    `crs:Shadows2012="${sign(r.shadows)}"`,
    `crs:Whites2012="${sign(r.whites)}"`,
    `crs:Blacks2012="${sign(r.blacks)}"`,
    `crs:Clarity2012="${sign(r.clarity)}"`,
    `crs:Vibrance="${sign(r.vibrance)}"`,
    ...BANDS.flatMap((b) => [`crs:HueAdjustment${b}="${sign(r.hsl[b].hue)}"`, `crs:SaturationAdjustment${b}="${sign(r.hsl[b].sat)}"`, `crs:LuminanceAdjustment${b}="${sign(r.hsl[b].lum)}"`]),
    `crs:ColorGradeShadowHue="${r.grade.shadows.hue}"`,
    `crs:ColorGradeShadowSat="${r.grade.shadows.sat}"`,
    `crs:ColorGradeHighlightHue="${r.grade.highlights.hue}"`,
    `crs:ColorGradeHighlightSat="${r.grade.highlights.sat}"`,
    `crs:ColorGradeBlending="50"`,
    `crs:PostCropVignetteAmount="${sign(r.vignette)}"`,
    `crs:PostCropVignetteMidpoint="50"`,
    `crs:PostCropVignetteFeather="60"`,
    `crs:PostCropVignetteStyle="1"`,
    `crs:GrainAmount="${r.grain}"`,
    `crs:ToneCurveName2012="Custom"`,
  ].join('\n    ')
  const inner = `   <crs:ToneCurvePV2012>\n    <rdf:Seq>\n${r.curve.map(([x, y]) => `     <rdf:li>${x}, ${y}</rdf:li>`).join('\n')}\n    </rdf:Seq>\n   </crs:ToneCurvePV2012>`
  return { attrs, inner }
}

/** A short text summary of a look, for Sandy. */
export function describeLook(l: Look): string {
  const top = BANDS.filter((b) => l.bands[b].share > 0.03)
    .sort((a, b) => l.bands[b].share - l.bands[a].share)
    .slice(0, 3)
  return `median brightness ${Math.round(l.q[4])}/255, blacks at ${Math.round(l.q[0])}, whites at ${Math.round(l.q[8])}, ${l.yb > 0.02 ? 'warm' : l.yb < -0.02 ? 'cool' : 'neutral'} cast, saturation ${Math.round(l.sat * 100)}%, main colours ${top.join(', ') || 'muted'}, ${l.vignette < 0.8 ? 'strong vignette' : l.vignette < 0.95 ? 'light vignette' : 'no vignette'}, ${l.grain > 6 ? 'visible grain' : 'clean'}`
}
