// Edit Lab v2 engine.
// 1. A model of Lightroom's main tools (white balance, exposure, tone curve, overlapping HSL bands,
//    3-way colour grading, vibrance/saturation, vignette), working in CIELAB.
// 2. A "look" descriptor measured in Lab: tone distribution, colour by tone zone, colour by hue band, skin.
// 3. A solver that searches the tool settings so your photo's look lands on the reference's look.
import type { Pixels, Recipe, Band } from './look'
import { BANDS, cleanCurve, curveLut } from './look'

// ---------------- colour maths ----------------

const toLin = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  toLin[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLin = (v: number) => {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return c * 255
}
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
const fInv = (t: number) => (t > 0.206893 ? t * t * t : (t - 16 / 116) / 7.787)

function linToLab(r: number, g: number, b: number): [number, number, number] {
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const fx = fLab(x)
  const fy = fLab(y)
  const fz = fLab(z)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labToLin(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116
  const x = fInv(fy + a / 500) * 0.95047
  const y = fInv(fy)
  const z = fInv(fy - b / 200) * 1.08883
  return [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z]
}

function inGamut(L: number, a: number, b: number): boolean {
  const [r, g, bl] = labToLin(L, a, b)
  return r > -0.002 && g > -0.002 && bl > -0.002 && r < 1.002 && g < 1.002 && bl < 1.002
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const smooth = (v: number, a: number, b: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

// Lightroom-style overlapping hue bands (degrees of Lab hue, roughly where each colour sits).
const BAND_CENTER: Record<Band, number> = { Red: 25, Orange: 55, Yellow: 85, Green: 140, Aqua: 200, Blue: 265, Purple: 305, Magenta: 340 }
const CENTERS = BANDS.map((b) => BAND_CENTER[b])

/** Weight of each band for a hue (soft, overlapping, sums to <= 1). */
function bandWeights(h: number, out: Float32Array) {
  let sum = 0
  for (let k = 0; k < 8; k++) {
    let d = Math.abs(h - CENTERS[k])
    if (d > 180) d = 360 - d
    const prev = CENTERS[(k + 7) % 8]
    const next = CENTERS[(k + 1) % 8]
    let span = Math.abs((d === 0 ? next : h > CENTERS[k] ? next : prev) - CENTERS[k])
    if (span > 180) span = 360 - span
    const w = d >= span ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / span)
    out[k] = w
    sum += w
  }
  if (sum > 1) for (let k = 0; k < 8; k++) out[k] /= sum
}

// ---------------- the photo, prepared once ----------------

export interface Prepared {
  w: number
  h: number
  lin: Float32Array // linear rgb
  ex: Float32Array // x position -1..1 (for vignette)
  ey: Float32Array
  dC: Float32Array // mid-size detail (what Clarity works on)
  dT: Float32Array // fine detail (what Texture works on)
  pm?: Float32Array // person map (0..1), when people were found
  sk?: Float32Array // skin map (0..1)
}

/** Separable box blur (fast). */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return Float32Array.from(src)
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    let acc = 0
    let cnt = 0
    for (let x = -r; x < w; x++) {
      const add = x + r
      if (add < w) {
        acc += src[y * w + add]
        cnt++
      }
      const rem = x - r - 1
      if (rem >= 0) {
        acc -= src[y * w + rem]
        cnt--
      }
      if (x >= 0) tmp[y * w + x] = acc / cnt
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    let cnt = 0
    for (let y = -r; y < h; y++) {
      const add = y + r
      if (add < h) {
        acc += tmp[add * w + x]
        cnt++
      }
      const rem = y - r - 1
      if (rem >= 0) {
        acc -= tmp[rem * w + x]
        cnt--
      }
      if (y >= 0) out[y * w + x] = acc / cnt
    }
  }
  return out
}

const clarityRadius = (w: number, h: number) => Math.max(2, Math.round(Math.max(w, h) * 0.04))

/** Detail layers from a lightness map: mid-size (clarity) and fine (texture). */
function details(L: Float32Array, w: number, h: number): { dC: Float32Array; dT: Float32Array } {
  const bC = boxBlur(L, w, h, clarityRadius(w, h))
  const bT = boxBlur(L, w, h, 1)
  const dC = new Float32Array(L.length)
  const dT = new Float32Array(L.length)
  for (let i = 0; i < L.length; i++) {
    dC[i] = L[i] - bC[i]
    dT[i] = L[i] - bT[i]
  }
  return { dC, dT }
}

const linToL = (r: number, g: number, b: number) => 116 * fLab(0.2126 * r + 0.7152 * g + 0.0722 * b) - 16

export function prepare(px: Pixels, maxSide = 160, calib?: Calibration | null): Prepared {
  const s = Math.min(1, maxSide / Math.max(px.w, px.h))
  const w = Math.max(1, Math.round(px.w * s))
  const h = Math.max(1, Math.round(px.h * s))
  const lin = new Float32Array(w * h * 3)
  const ex = new Float32Array(w * h)
  const ey = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(px.w - 1, Math.floor(x / s))
      const sy = Math.min(px.h - 1, Math.floor(y / s))
      const i = (sy * px.w + sx) * 4
      const o = y * w + x
      let r = px.data[i]
      let g = px.data[i + 1]
      let b = px.data[i + 2]
      if (calib) {
        r = calib.r[r]
        g = calib.g[g]
        b = calib.b[b]
      }
      lin[o * 3] = toLin[r | 0]
      lin[o * 3 + 1] = toLin[g | 0]
      lin[o * 3 + 2] = toLin[b | 0]
      ex[o] = (x - w / 2) / (w / 2)
      ey[o] = (y - h / 2) / (h / 2)
    }
  const Ls = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) Ls[i] = linToL(lin[i * 3], lin[i * 3 + 1], lin[i * 3 + 2])
  const { dC, dT } = details(Ls, w, h)
  let pm: Float32Array | undefined
  let sk: Float32Array | undefined
  if (px.seg) {
    const g = px.seg
    pm = new Float32Array(w * h)
    sk = new Float32Array(w * h)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const j = Math.min(g.h - 1, Math.floor((y / h) * g.h)) * g.w + Math.min(g.w - 1, Math.floor((x / w) * g.w))
        pm[y * w + x] = g.person[j]
        sk[y * w + x] = g.skin[j]
      }
  }
  return { w, h, lin, ex, ey, dC, dT, pm, sk }
}

// ---------------- the Lightroom model ----------------

export interface Params {
  temp: number // + warmer (Lightroom-ish Kelvin delta)
  tint: number // + magenta
  exposure: number // stops
  curve: [number, number][] // 0-255 points
  saturation: number // -100..100
  vibrance: number // -100..100
  hsl: Record<Band, { hue: number; sat: number; lum: number }>
  grade: Record<'shadows' | 'midtones' | 'highlights', { hue: number; sat: number }>
  vignette: number // -100..100
  clarity: number // -100..100 (negative = softer)
  texture: number // -100..100 (negative = smoother skin)
}

export function blankParams(): Params {
  const hsl = {} as Params['hsl']
  for (const b of BANDS) hsl[b] = { hue: 0, sat: 0, lum: 0 }
  return {
    temp: 0,
    tint: 0,
    exposure: 0,
    curve: [
      [0, 0],
      [255, 255],
    ],
    saturation: 0,
    vibrance: 0,
    hsl,
    grade: { shadows: { hue: 0, sat: 0 }, midtones: { hue: 0, sat: 0 }, highlights: { hue: 0, sat: 0 } },
    vignette: 0,
    clarity: 0,
    texture: 0,
  }
}

const GRADE_K = 22 // Lab units at sat 100
const HSL_HUE = 0.3 // degrees per Lightroom hue unit
const HSL_LUM = 0.16 // Lab L per Lightroom lum unit (at full chroma)

/** Runs the model on one pixel (linear rgb in), returns Lab. */
function apply(p: Params, lut: Float32Array, wbR: number, wbG: number, wbB: number, k: number, r: number, g: number, b: number, ex: number, ey: number, bw: Float32Array, dc = 0, dt = 0): [number, number, number] {
  // Blown-out pixels (already pure white in the photo) carry no colour or detail: keep them white, never paint them.
  const blown = smooth(Math.min(r, g, b), 0.86, 0.97)
  // How colourful this pixel is in the untouched photo (before any white balance)
  const sA = 0.4124 * r + 0.3576 * g + 0.1805 * b
  const sY = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const sZ = 0.0193 * r + 0.1192 * g + 0.9505 * b
  const C0 = sY > 1e-5 ? 100 * Math.hypot(sA / 0.95047 / sY - 1, sZ / 1.08883 / sY - 1) * Math.cbrt(sY) * 0.55 : 0
  r *= wbR * k
  g *= wbG * k
  b *= wbB * k
  // Highlight roll-off (like Lightroom): bright tones compress smoothly towards white instead of
  // all clipping to one flat value, so folds, fabric and skin detail survive exposure/warmth pushes.
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const KNEE = 0.55
  if (Y > KNEE) {
    const Yc = KNEE + (1 - KNEE) * (1 - Math.exp(-(Y - KNEE) / (1 - KNEE)))
    r *= Yc / Y
    g *= Yc / Y
    b *= Yc / Y
  }
  const top = Math.max(r, g, b)
  if (top > 1) {
    r /= top
    g /= top
    b /= top
  }
  let [L, A, B] = linToLab(r, g, b)
  // Tone curve on lightness (gamma-encoded domain), chroma follows a little so lifted shadows don't go grey.
  const L0 = L
  L = lut[clamp(Math.round(L * 2.55), 0, 255)] / 2.55
  const cf = L0 > 1 ? Math.sqrt(clamp(L / L0, 0.4, 2.5)) : 1
  A *= cf
  B *= cf
  let C = Math.hypot(A, B)
  let H = (Math.atan2(B, A) * 180) / Math.PI
  if (H < 0) H += 360
  // Clarity (mid-size contrast) and Texture (fine detail): negative values give the soft, creamy look
  if (p.clarity || p.texture) L += (p.clarity / 100) * dc * 0.9 * smooth(L, 8, 28) * (1 - smooth(L, 82, 97)) + (p.texture / 100) * dt * 1.1
  // Saturation + vibrance (vibrance favours low-chroma colours and protects skin)
  C *= 1 + p.saturation / 100
  const skinish = H > 20 && H < 75 ? 0.5 : 1
  C *= 1 + (p.vibrance / 100) * (1 - clamp(C / 70, 0, 1)) * skinish
  // HSL with overlapping bands; fades out on near-greys and near-blacks so noise isn't recoloured
  bandWeights(H, bw)
  const colourful = smooth(C, 3, 14) * smooth(L, 4, 14)
  let dh = 0
  let ds = 0
  let dl = 0
  for (let q = 0; q < 8; q++) {
    const w = bw[q]
    if (!w) continue
    const v = p.hsl[BANDS[q]]
    dh += w * v.hue
    ds += w * v.sat
    dl += w * v.lum
  }
  H += dh * HSL_HUE * colourful
  C *= 1 + (ds / 100) * colourful
  L += dl * HSL_LUM * clamp(C / 30, 0, 1) * colourful
  const hr = (H * Math.PI) / 180
  A = C * Math.cos(hr)
  B = C * Math.sin(hr)
  // 3-way colour grading (Lightroom blends by luminance)
  const t = clamp(L / 100, 0, 1)
  const ws = smooth(0.5 - t, 0, 0.5) * smooth(L, 2, 10)
  const wh = smooth(t - 0.5, 0, 0.5)
  const wm = 1 - ws - wh
  for (const [zone, wt] of [
    ['shadows', ws],
    ['midtones', wm],
    ['highlights', wh],
  ] as const) {
    const gz = p.grade[zone]
    if (!gz.sat || wt <= 0) continue
    const gr = (gz.hue * Math.PI) / 180
    A += Math.cos(gr) * (gz.sat / 100) * GRADE_K * wt
    B += Math.sin(gr) * (gz.sat / 100) * GRADE_K * wt
  }
  // Vignette
  if (p.vignette) {
    const d = Math.hypot(ex, ey)
    L *= 1 + (p.vignette / 100) * 0.55 * smooth(d, 0.45, 1.25)
  }
  L = clamp(L, 0, 100)
  if (blown > 0) {
    A *= 1 - blown
    B *= 1 - blown
    L += (Math.max(L, 97) - L) * blown
  }
  // No edit may more than roughly double a colour's strength (stops stacked boosts frying skin)
  // Whites and pale tones may only warm slightly (creamy), never turn into a colour
  const cap = Math.max(C0 * 1.4, C0 + 5 + 13 * (1 - smooth(L, 55, 88)))
  const Cn = Math.hypot(A, B)
  if (Cn > cap) {
    A *= cap / Cn
    B *= cap / Cn
  }
  // Gamut compression: pull colour back towards neutral (same lightness + hue) instead of clipping channels
  if ((Cn > 20 || L < 6 || L > 94) && !inGamut(L, A, B)) {
    let lo = 0
    let hi = 1
    for (let s = 0; s < 7; s++) {
      const m = (lo + hi) / 2
      if (inGamut(L, A * m, B * m)) lo = m
      else hi = m
    }
    A *= lo
    B *= lo
  }
  return [L, A, B]
}

function wbGains(p: Params): [number, number, number] {
  const t = p.temp / 1000
  const ti = p.tint / 50
  return [2 ** (t * 0.22 + ti * 0.05), 2 ** (-ti * 0.16), 2 ** (-t * 0.3 + ti * 0.05)]
}

/** Renders the model to Lab arrays (for measuring) — used by the solver. */
function renderLab(src: Prepared, p: Params): Float32Array {
  const n = src.w * src.h
  const out = new Float32Array(n * 3)
  const lut = curveLut(p.curve)
  const [wr, wg, wb] = wbGains(p)
  const k = 2 ** p.exposure
  const bw = new Float32Array(8)
  for (let i = 0; i < n; i++) {
    const [L, A, B] = apply(p, lut, wr, wg, wb, k, src.lin[i * 3], src.lin[i * 3 + 1], src.lin[i * 3 + 2], src.ex[i], src.ey[i], bw, src.dC[i], src.dT[i])
    out[i * 3] = L
    out[i * 3 + 1] = A
    out[i * 3 + 2] = B
  }
  return out
}

/** Share of the subject area (centre of frame) that is blown out to pure white in the original. */
export function blownShare(px: Pixels): number {
  const { w, h, data } = px
  let n = 0
  let hit = 0
  for (let y = Math.floor(h * 0.15); y < h * 0.85; y += 2)
    for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 2) {
      const i = (y * w + x) * 4
      n++
      if (Math.min(data[i], data[i + 1], data[i + 2]) > 246) hit++
    }
  return n ? hit / n : 0
}

/** Full-size preview of the model. */
export function renderImage(px: Pixels, p: Params, calib?: Calibration | null): ImageData {
  const { w, h, data } = px
  const img = new ImageData(w, h)
  const lut = curveLut(p.curve)
  const [wr, wg, wb] = wbGains(p)
  const k = 2 ** p.exposure
  const bw = new Float32Array(8)
  const Ls = new Float32Array(w * h)
  for (let j = 0; j < w * h; j++) {
    const c = calib
    const rr = c ? c.r[data[j * 4]] : data[j * 4]
    const gg = c ? c.g[data[j * 4 + 1]] : data[j * 4 + 1]
    const bb = c ? c.b[data[j * 4 + 2]] : data[j * 4 + 2]
    Ls[j] = linToL(toLin[rr | 0], toLin[gg | 0], toLin[bb | 0])
  }
  const det = p.clarity || p.texture ? details(Ls, w, h) : null
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]
      if (calib) {
        r = calib.r[r]
        g = calib.g[g]
        b = calib.b[b]
      }
      const o = y * w + x
      const [L, A, B] = apply(p, lut, wr, wg, wb, k, toLin[r | 0], toLin[g | 0], toLin[b | 0], (x - w / 2) / (w / 2), (y - h / 2) / (h / 2), bw, det ? det.dC[o] : 0, det ? det.dT[o] : 0)
      const [R, G, Bl] = labToLin(L, A, B)
      img.data[i] = fromLin(R)
      img.data[i + 1] = fromLin(G)
      img.data[i + 2] = fromLin(Bl)
      img.data[i + 3] = 255
    }
  return img
}

// ---------------- the look descriptor ----------------

const LQ = [0.01, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.94, 0.97, 0.99]
const ZONES = [0, 15, 32, 55, 78, 101]

export interface Descriptor {
  v: 2
  L: number[] // lightness quantiles
  zones: { a: number; b: number; c: number; w: number }[] // colour by tone zone
  bands: { c: number; L: number; h: number; w: number }[] // colour by hue band
  skin: { L: number; a: number; b: number; w: number }
  chroma: number[] // chroma quantiles
  clarity?: number // average mid-size local contrast (lower = softer)
  texture?: number // average fine detail (lower = smoother)
  vignette: number
}

export function describe(lab: Float32Array, n: number, ex?: Float32Array, ey?: Float32Array, w?: number, h?: number, pm?: Float32Array, sk?: Float32Array): Descriptor {
  // Histograms instead of sorting: much faster, same quantiles to 0.25 L / 0.5 C.
  const hL = new Uint32Array(401)
  const hC = new Uint32Array(301)
  const zone = Array.from({ length: 5 }, () => ({ a: 0, b: 0, c: 0, w: 0 }))
  const band = Array.from({ length: 8 }, () => ({ c: 0, L: 0, hx: 0, hy: 0, w: 0 }))
  const skin = { L: 0, a: 0, b: 0, w: 0 }
  const bw = new Float32Array(8)
  let edge = 0
  let edgeN = 0
  let centre = 0
  let centreN = 0
  for (let i = 0; i < n; i++) {
    const L = lab[i * 3]
    const a = lab[i * 3 + 1]
    const b = lab[i * 3 + 2]
    const C = Math.hypot(a, b)
    // Subject first: the middle of the frame (where people usually are) counts more than the edges.
    // With a person map, the actual people count most; otherwise fall back to "middle of the frame".
    const sw = pm ? 1 + 2.5 * pm[i] : ex && ey ? 1 + 1.5 * (1 - smooth(Math.hypot(ex[i], ey[i] * 0.8), 0.3, 0.85)) : 1
    hL[clamp(Math.round(L * 4), 0, 400)]++
    hC[clamp(Math.round(C * 2), 0, 300)]++
    let z = 0
    while (z < 4 && L >= ZONES[z + 1]) z++
    zone[z].a += a * sw
    zone[z].b += b * sw
    zone[z].c += C * sw
    zone[z].w += sw
    let H = (Math.atan2(b, a) * 180) / Math.PI
    if (H < 0) H += 360
    if (C > 8 && L > 6) {
      bandWeights(H, bw)
      for (let k = 0; k < 8; k++)
        if (bw[k]) {
          const w = bw[k] * sw
          band[k].c += C * w
          band[k].L += L * w
          band[k].hx += Math.cos((H * Math.PI) / 180) * w
          band[k].hy += Math.sin((H * Math.PI) / 180) * w
          band[k].w += w
        }
    }
    // Skin: warm hues, moderate chroma, mid lightness
    // Skin: from the skin map when we have one (fixed from the original photo), else warm hues, moderate chroma, mid lightness
    if (sk ? sk[i] > 0.5 && L > 4 : H > 18 && H < 75 && C > 5 && C < 60 && L > 6 && L < 90) {
      skin.L += L * sw
      skin.a += a * sw
      skin.b += b * sw
      skin.w += sw
    }
    if (ex && ey) {
      const d = Math.hypot(ex[i], ey[i])
      if (d > 0.9) {
        edge += L
        edgeN++
      } else if (d < 0.45) {
        centre += L
        centreN++
      }
    }
  }
  const hq = (hist: Uint32Array, p: number, scale: number) => {
    const target = p * n
    let acc = 0
    for (let v = 0; v < hist.length; v++) {
      acc += hist[v]
      if (acc >= target) return v / scale
    }
    return (hist.length - 1) / scale
  }
  return {
    v: 2,
    L: LQ.map((p) => hq(hL, p, 4)),
    zones: zone.map((z) => (z.w ? { a: z.a / z.w, b: z.b / z.w, c: z.c / z.w, w: z.w / n } : { a: 0, b: 0, c: 0, w: 0 })),
    bands: band.map((x, k) => (x.w ? { c: x.c / x.w, L: x.L / x.w, h: ((Math.atan2(x.hy, x.hx) * 180) / Math.PI + 360) % 360, w: x.w / n } : { c: 0, L: 0, h: CENTERS[k], w: 0 })),
    skin: skin.w ? { L: skin.L / skin.w, a: skin.a / skin.w, b: skin.b / skin.w, w: skin.w / n } : { L: 0, a: 0, b: 0, w: 0 },
    chroma: [0.25, 0.5, 0.75, 0.9, 0.97].map((p) => hq(hC, p, 2)),
    vignette: centreN && edgeN ? edge / edgeN / Math.max(1, centre / centreN) : 1,
    ...(w && h ? detailStats(lab, w, h) : {}),
  }
}

/** How soft or crisp the photo is (people-weighted midtones). */
function detailStats(lab: Float32Array, w: number, h: number): { clarity: number; texture: number } {
  const L = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) L[i] = lab[i * 3]
  const { dC, dT } = details(L, w, h)
  let c = 0
  let t = 0
  let n = 0
  for (let i = 0; i < w * h; i++) {
    if (L[i] < 12 || L[i] > 92) continue
    c += Math.abs(dC[i])
    t += Math.abs(dT[i])
    n++
  }
  return n ? { clarity: c / n, texture: t / n } : { clarity: 0, texture: 0 }
}

/** Measures a finished photo (the reference). */
export function measureRef(px: Pixels): Descriptor {
  // Same working size as the solver, so softness is measured on the same scale.
  const prep = prepare(px, 110)
  return describe(renderLab(prep, blankParams()), prep.w * prep.h, prep.ex, prep.ey, prep.w, prep.h, prep.pm, prep.sk)
}

/** Averages several references into one style (weights optional). */
export function blend(list: { d: Descriptor; w: number }[]): Descriptor {
  const tot = list.reduce((a, x) => a + x.w, 0) || 1
  const m = (f: (d: Descriptor) => number) => list.reduce((a, x) => a + f(x.d) * x.w, 0) / tot
  const mw = (f: (d: Descriptor) => number, wf: (d: Descriptor) => number) => {
    const ww = list.reduce((a, x) => a + wf(x.d) * x.w, 0)
    return ww ? list.reduce((a, x) => a + f(x.d) * wf(x.d) * x.w, 0) / ww : 0
  }
  return {
    v: 2,
    L: LQ.map((_, i) => m((d) => d.L[i])),
    zones: [0, 1, 2, 3, 4].map((z) => ({ a: mw((d) => d.zones[z].a, (d) => d.zones[z].w), b: mw((d) => d.zones[z].b, (d) => d.zones[z].w), c: mw((d) => d.zones[z].c, (d) => d.zones[z].w), w: m((d) => d.zones[z].w) })),
    bands: [0, 1, 2, 3, 4, 5, 6, 7].map((k) => ({
      c: mw((d) => d.bands[k].c, (d) => d.bands[k].w),
      L: mw((d) => d.bands[k].L, (d) => d.bands[k].w),
      h: (() => {
        const hx = list.reduce((a, x) => a + Math.cos((x.d.bands[k].h * Math.PI) / 180) * x.d.bands[k].w * x.w, 0)
        const hy = list.reduce((a, x) => a + Math.sin((x.d.bands[k].h * Math.PI) / 180) * x.d.bands[k].w * x.w, 0)
        return hx || hy ? ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360 : CENTERS[k]
      })(),
      w: m((d) => d.bands[k].w),
    })),
    skin: { L: mw((d) => d.skin.L, (d) => d.skin.w), a: mw((d) => d.skin.a, (d) => d.skin.w), b: mw((d) => d.skin.b, (d) => d.skin.w), w: m((d) => d.skin.w) },
    chroma: [0, 1, 2, 3, 4].map((i) => m((d) => d.chroma[i])),
    vignette: m((d) => d.vignette),
    clarity: list.every((x) => x.d.clarity !== undefined) ? m((d) => d.clarity ?? 0) : undefined,
    texture: list.every((x) => x.d.texture !== undefined) ? m((d) => d.texture ?? 0) : undefined,
  }
}

// ---------------- how close two looks are ----------------

export function distance(x: Descriptor, t: Descriptor): number {
  let e = 0
  // Tone: the shape of the whole histogram
  for (let i = 0; i < LQ.length; i++) e += ((x.L[i] - x.L[8] - (t.L[i] - t.L[8])) / 6) ** 2
  e += ((x.L[8] - t.L[8]) / 16) ** 2
  // Colour cast by tone zone
  for (let z = 0; z < 5; z++) {
    const w = Math.min(1, (x.zones[z].w + t.zones[z].w) * 4)
    if (!w) continue
    const zw = z < 2 ? 0.45 : 1 // dark zones are mostly background lights; count them less
    e += zw * w * (((x.zones[z].a - t.zones[z].a) / 3) ** 2 + ((x.zones[z].b - t.zones[z].b) / 3) ** 2 + ((x.zones[z].c - t.zones[z].c) / 5) ** 2)
  }
  // Colours, band by band (only where both photos actually have that colour)
  for (let k = 0; k < 8; k++) {
    const a = x.bands[k]
    const b = t.bands[k]
    if (a.w < 0.004 || b.w < 0.004) continue
    const w = Math.min(1, Math.min(a.w, b.w) * 20) * (Math.min(a.w, b.w) / Math.max(a.w, b.w)) ** 0.5
    let dh = Math.abs(a.h - b.h)
    if (dh > 180) dh = 360 - dh
    // Band lightness is compared relative to each photo's own midtone (so bright clothes or walls don't relight people)
    e += w * (((a.c - b.c) / 6) ** 2 + ((a.L - x.L[8] - (b.L - t.L[8])) / 14) ** 2 + (dh / 10) ** 2)
  }
  // Skin matters most in people photos
  if (x.skin.w > 0.01 && t.skin.w > 0.01) {
    const hue = (s: { a: number; b: number }) => (Math.atan2(s.b, s.a) * 180) / Math.PI
    let dh = Math.abs(hue(x.skin) - hue(t.skin))
    if (dh > 180) dh = 360 - dh
    const rich = (s: { L: number; a: number; b: number }) => Math.hypot(s.a, s.b) / Math.max(10, s.L)
    e += 8 * ((dh / 4) ** 2 + (Math.log((rich(x.skin) + 0.05) / (rich(t.skin) + 0.05)) / 0.12) ** 2)
  }
  for (let i = 0; i < 5; i++) e += ((x.chroma[i] - t.chroma[i]) / 6) ** 2
  e += ((x.vignette - t.vignette) / 0.08) ** 2
  // Softness: how crisp mid-size and fine detail are (compared as ratios)
  if (x.clarity !== undefined && t.clarity !== undefined) e += 1.5 * (Math.log((x.clarity + 0.3) / (t.clarity + 0.3)) / 0.12) ** 2
  if (x.texture !== undefined && t.texture !== undefined) e += (Math.log((x.texture + 0.2) / (t.texture + 0.2)) / 0.12) ** 2
  return e
}

/** 0-100 "how close" score for display. */
export const matchScore = (d: number) => Math.round(100 * Math.exp(-d / 150))

// ---------------- the solver ----------------

function cloneP(p: Params): Params {
  return JSON.parse(JSON.stringify(p)) as Params
}

function quantMap(src: number[], tgt: number[]): [number, number][] {
  const idx = [1, 3, 5, 8, 11, 13, 15]
  const pts: [number, number][] = [[0, clamp(tgt[0] * 2.55 - src[0] * 2.55 * 0.6, 0, 45)]]
  for (const i of idx) pts.push([Math.round(clamp(src[i] * 2.55, 1, 254)), Math.round(clamp(tgt[i] * 2.55, 0, 255))])
  pts.push([255, clamp(255 - (src[16] - tgt[16]) * 2.55, 215, 255)])
  return cleanCurve(pts)
}

export interface FitResult {
  params: Params
  before: number
  after: number
}

/** "Keep it natural": every slider costs a little, so only clear evidence pushes one far (stops it chasing scene content). */
function penalty(p: Params): number {
  // Exposure costs too, and pulling the top of the curve down (blow out, then hide it) costs a lot: it flattens highlights
  let e = (p.exposure / 1.1) ** 2 + ((255 - p.curve[p.curve.length - 1][1]) / 30) ** 2 + (p.temp / 1100) ** 2 + (p.tint / 18) ** 2 + (p.saturation / 45) ** 2 + (p.vibrance / 50) ** 2 + (p.vignette / 50) ** 2
  for (const b of BANDS) {
    const v = p.hsl[b]
    // Skin lives in the red/orange/yellow bands: shifting their hue or pumping their saturation makes people look wrong
    const skinBand = b === 'Red' || b === 'Orange' || b === 'Yellow'
    e += 0.35 * ((v.hue / (skinBand ? 15 : 35)) ** 2 + (v.sat / (skinBand ? 35 : 50)) ** 2 + (v.lum / 40) ** 2)
  }
  for (const z of ['shadows', 'midtones', 'highlights'] as const) e += (p.grade[z].sat / 35) ** 2
  // Curve: bends far from a straight line cost more
  for (const [x, y] of p.curve) e += 0.15 * ((y - x) / 60) ** 2
  // Steep stretches of curve magnify noise and grain (night shots are noisy): keep every section gentle
  for (let i = 1; i < p.curve.length; i++) {
    const [x0, y0] = p.curve[i - 1]
    const [x1, y1] = p.curve[i]
    const slope = (y1 - y0) / Math.max(1, x1 - x0)
    if (slope > 1.35) e += ((slope - 1.35) / 0.15) ** 2
  }
  e += (p.clarity / 70) ** 2 + (p.texture / 70) ** 2
  return e * 4
}

/** Finds the Lightroom settings that take `src` closest to `target`. */
export function fit(src: Prepared, target: Descriptor, onProgress?: (p: number) => void, passCount = 3): FitResult {
  const n = src.w * src.h
  // Skin is decided once, from the untouched photo: an edit can't turn a bandage, shirt or wall into "skin".
  let skinMap = src.sk
  if (!skinMap) {
    const base = renderLab(src, blankParams())
    skinMap = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const L = base[i * 3]
      const C = Math.hypot(base[i * 3 + 1], base[i * 3 + 2])
      let H = (Math.atan2(base[i * 3 + 2], base[i * 3 + 1]) * 180) / Math.PI
      if (H < 0) H += 360
      skinMap[i] = H > 18 && H < 75 && C > 5 && C < 60 && L > 6 && L < 90 ? 1 : 0
    }
  }
  const measureP = (p: Params) => describe(renderLab(src, p), n, src.ex, src.ey, src.w, src.h, src.pm, skinMap)
  const look = (p: Params) => distance(measureP(p), target)
  // Skin guard: whatever the reference looks like, a person's skin lightness stays where it is in their own photo.
  const own = measureP(blankParams())
  const ownSkin = own.skin
  const skinGuard = (p: Params) => {
    if (ownSkin.w < 0.01) return 0
    const d = measureP(p)
    const s = d.skin
    // Skin may brighten or darken only as much as the whole photo does (an honest exposure fix), never on its own.
    const scene = (d.L[6] + d.L[8] + d.L[10]) / 3 - (own.L[6] + own.L[8] + own.L[10]) / 3
    return s.w > 0.005 ? 12 * ((s.L - ownSkin.L - scene) / 3) ** 2 : 0
  }
  const loss = (p: Params) => look(p) + penalty(p) + skinGuard(p)
  // Hard limit: how far (in L) skin moved beyond the whole photo's own change.
  const skinDrift = (p: Params) => {
    if (ownSkin.w < 0.01) return 0
    const d = measureP(p)
    if (d.skin.w < 0.005) return 0
    const scene = (d.L[6] + d.L[8] + d.L[10]) / 3 - (own.L[6] + own.L[8] + own.L[10]) / 3
    return Math.abs(d.skin.L - ownSkin.L - scene)
  }
  const SKIN_LIMIT = 8
  // Hard limit 2: an edit may not blow out (push past white) more of the photo than was already blown.
  const blownBy = (p: Params) => {
    const [wr, wg, wb] = wbGains(p)
    const k = 2 ** p.exposure
    let hit = 0
    for (let i = 0; i < n; i++) {
      const Y = (0.2126 * src.lin[i * 3] * wr + 0.7152 * src.lin[i * 3 + 1] * wg + 0.0722 * src.lin[i * 3 + 2] * wb) * k
      if (Y > 1.15) hit++
    }
    return hit / n
  }
  const BLOWN_LIMIT = blownBy(blankParams()) + 0.02
  const okBlown = (p: Params) => blownBy(p) <= BLOWN_LIMIT
  let p = blankParams()
  const before = look(p)

  // 1. Exposure from the midtones, then the tone curve from the full histogram.
  const d0 = measureP(p)
  const lin = (L: number) => fInv((L + 16) / 116)
  // Keep most of the photo's own brightness: only move a third of the way to the reference's midtone.
  p.exposure = clamp(Math.log2(Math.max(0.002, lin(target.L[8])) / Math.max(0.002, lin(d0.L[8]))) * 0.35, -1.5, 1.5)
  const d1 = measureP(p)
  // Tone curve matches the reference's contrast shape around this photo's own midpoint.
  const shift = (d1.L[8] - target.L[8]) * 0.7
  // Start only part of the way along the reference's curve; the solver refines from there under the skin guard.
  p.curve = quantMap(d1.L, target.L.map((v, i) => clamp(d1.L[i] + (v + shift - d1.L[i]) * 0.4, 0, 100)))

  // 2. White balance from the midtones, then colour grading from what's left in each tone zone.
  const midCast = (d: Descriptor) => [(d.zones[2].a + d.zones[3].a) / 2, (d.zones[2].b + d.zones[3].b) / 2]
  for (let pass = 0; pass < 2; pass++) {
    const d = measureP(p)
    const [ca, cb] = midCast(d)
    const [ta, tb] = midCast(target)
    p.temp = clamp(p.temp + (tb - cb) * 160, -1800, 1800)
    p.tint = clamp(p.tint + (ta - ca) * 3, -25, 25)
  }
  const d2 = measureP(p)
  const zoneRes = (zs: number[]) => {
    let a = 0
    let b = 0
    let w = 0
    for (const z of zs) {
      const ww = Math.min(d2.zones[z].w, target.zones[z].w)
      a += (target.zones[z].a - d2.zones[z].a) * ww
      b += (target.zones[z].b - d2.zones[z].b) * ww
      w += ww
    }
    return w ? [a / w, b / w] : [0, 0]
  }
  for (const [zone, zs] of [
    ['shadows', [0, 1]],
    ['highlights', [3, 4]],
  ] as const) {
    const [a, b] = zoneRes([...zs])
    const mag = Math.hypot(a, b)
    if (mag > 1) p.grade[zone] = { hue: Math.round(((Math.atan2(b, a) * 180) / Math.PI + 360) % 360), sat: Math.round(clamp((mag / GRADE_K) * 100 * 1.6, 0, 70)) }
  }

  // 3. Overall saturation from the chroma distribution, then each colour band.
  const d3 = measureP(p)
  p.saturation = clamp((target.chroma[1] / Math.max(2, d3.chroma[1]) - 1) * 100 * 0.6, -30, 30)
  const d4 = measureP(p)
  for (let k = 0; k < 8; k++) {
    const a = d4.bands[k]
    const b = target.bands[k]
    if (a.w < 0.004 || b.w < 0.004) continue
    let dh = b.h - a.h
    if (dh > 180) dh -= 360
    if (dh < -180) dh += 360
    p.hsl[BANDS[k]] = {
      hue: Math.round(clamp(dh / HSL_HUE, -30, 30)),
      sat: Math.round(clamp((b.c / Math.max(3, a.c) - 1) * 100, -70, 70)),
      lum: Math.round(clamp((b.L - a.L) / HSL_LUM / Math.max(0.3, clamp(a.c / 30, 0, 1)), -60, 60)),
    }
  }
  p.vignette = clamp((target.vignette - d4.vignette) / 0.0055, -60, 30)
  if (d4.clarity !== undefined && target.clarity !== undefined) p.clarity = clamp((target.clarity / Math.max(0.2, d4.clarity) - 1) * 90, -70, 15)
  if (d4.texture !== undefined && target.texture !== undefined) p.texture = clamp((target.texture / Math.max(0.15, d4.texture) - 1) * 90, -70, 15)
  // Pull the starting edit back towards neutral until it respects the skin limit.
  for (let guard = 0; guard < 14 && skinDrift(p) > SKIN_LIMIT; guard++) {
    p.curve = p.curve.map(([x, y]) => [x, Math.round(x + (y - x) * 0.75)])
    p.exposure *= 0.8
    for (const b of BANDS) p.hsl[b] = { ...p.hsl[b], lum: Math.round(p.hsl[b].lum * 0.7) }
    p.clarity *= 0.85
  }
  for (let guard = 0; guard < 20 && !okBlown(p); guard++) p.exposure -= 0.1
  onProgress?.(0.3)

  // 4. Joint refinement: coordinate search over every control, keeping whatever lowers the error.
  type Knob = { get: (p: Params) => number; set: (p: Params, v: number) => void; step: number; lo: number; hi: number }
  const knobs: Knob[] = [
    { get: (q) => q.exposure, set: (q, v) => (q.exposure = v), step: 0.15, lo: -1.5, hi: 1.5 },
    { get: (q) => q.temp, set: (q, v) => (q.temp = v), step: 250, lo: -2000, hi: 2000 },
    { get: (q) => q.tint, set: (q, v) => (q.tint = v), step: 6, lo: -40, hi: 40 },
    { get: (q) => q.saturation, set: (q, v) => (q.saturation = v), step: 8, lo: -70, hi: 70 },
    { get: (q) => q.vibrance, set: (q, v) => (q.vibrance = v), step: 10, lo: -60, hi: 60 },
    { get: (q) => q.vignette, set: (q, v) => (q.vignette = v), step: 10, lo: -70, hi: 40 },
    { get: (q) => q.clarity, set: (q, v) => (q.clarity = v), step: 10, lo: -80, hi: 15 },
    { get: (q) => q.texture, set: (q, v) => (q.texture = v), step: 10, lo: -80, hi: 15 },
  ]
  for (const z of ['shadows', 'midtones', 'highlights'] as const) {
    knobs.push({ get: (q) => q.grade[z].sat, set: (q, v) => (q.grade[z].sat = v), step: 8, lo: 0, hi: 70 })
    knobs.push({ get: (q) => q.grade[z].hue, set: (q, v) => (q.grade[z].hue = ((v % 360) + 360) % 360), step: 25, lo: -720, hi: 720 })
  }
  for (const b of BANDS) {
    knobs.push({ get: (q) => q.hsl[b].sat, set: (q, v) => (q.hsl[b].sat = v), step: 12, lo: -80, hi: 80 })
    knobs.push({ get: (q) => q.hsl[b].lum, set: (q, v) => (q.hsl[b].lum = v), step: 12, lo: -70, hi: 70 })
    knobs.push({ get: (q) => q.hsl[b].hue, set: (q, v) => (q.hsl[b].hue = v), step: 12, lo: -40, hi: 40 })
  }
  // Curve points (y values) are knobs too.
  for (let i = 1; i < p.curve.length; i++) knobs.push({ get: (q) => q.curve[i]?.[1] ?? 0, set: (q, v) => q.curve[i] && (q.curve[i] = [q.curve[i][0], v]), step: 8, lo: 0, hi: 255 })

  let best = loss(p)
  const passes = passCount
  for (let pass = 0; pass < passes; pass++) {
    const scale = 1 / (pass + 1)
    for (const kn of knobs) {
      const cur = kn.get(p)
      for (const dir of [1, -1]) {
        const trial = cloneP(p)
        kn.set(trial, clamp(cur + dir * kn.step * scale, kn.lo, kn.hi))
        trial.curve = cleanCurve(trial.curve)
        const l = loss(trial)
        if (l < best - 1e-6 && (ownSkin.w < 0.01 || skinDrift(trial) <= Math.max(SKIN_LIMIT, skinDrift(p))) && (okBlown(trial) || !okBlown(p))) {
          best = l
          p = trial
          break
        }
      }
    }
    onProgress?.(0.3 + (0.7 * (pass + 1)) / passes)
  }
  p.curve = cleanCurve(p.curve)
  // Tidy numbers to what you'd type into Lightroom
  p.exposure = Math.round(p.exposure * 100) / 100
  p.temp = Math.round(p.temp / 50) * 50
  p.tint = Math.round(p.tint)
  p.saturation = Math.round(p.saturation)
  p.vibrance = Math.round(p.vibrance)
  p.vignette = Math.round(p.vignette)
  p.clarity = Math.round(p.clarity)
  p.texture = Math.round(p.texture)
  for (const b of BANDS) p.hsl[b] = { hue: Math.round(p.hsl[b].hue), sat: Math.round(p.hsl[b].sat), lum: Math.round(p.hsl[b].lum) }
  for (const z of ['shadows', 'midtones', 'highlights'] as const) p.grade[z] = { hue: Math.round(p.grade[z].hue), sat: Math.round(p.grade[z].sat) }
  return { params: p, before, after: look(p) }
}

/** Blend between no edit and the full edit (the Strength slider / preset Amount). */
export function scaleParams(p: Params, s: number): Params {
  const q = cloneP(p)
  const m = (v: number) => v * s
  q.temp = Math.round(m(p.temp))
  q.tint = Math.round(m(p.tint))
  q.exposure = Math.round(m(p.exposure) * 100) / 100
  q.curve = p.curve.map(([x, y]) => [x, Math.round(x + (y - x) * s)])
  q.saturation = Math.round(m(p.saturation))
  q.vibrance = Math.round(m(p.vibrance))
  for (const b of BANDS) q.hsl[b] = { hue: Math.round(m(p.hsl[b].hue)), sat: Math.round(m(p.hsl[b].sat)), lum: Math.round(m(p.hsl[b].lum)) }
  for (const z of ['shadows', 'midtones', 'highlights'] as const) q.grade[z] = { hue: p.grade[z].hue, sat: Math.round(m(p.grade[z].sat)) }
  q.vignette = Math.round(m(p.vignette))
  q.clarity = Math.round(m(p.clarity))
  q.texture = Math.round(m(p.texture))
  return q
}

/** Measures how close a given set of settings gets (for the live score as Strength changes). */
export function scoreFor(src: Prepared, p: Params, target: Descriptor): number {
  return matchScore(distance(describe(renderLab(src, p), src.w * src.h, src.ex, src.ey, src.w, src.h), target))
}

/** Same settings in the older Recipe shape, so steps, presets and sidecars keep working. */
export function toRecipe(p: Params): Recipe {
  return {
    exposure: p.exposure,
    temp: p.temp,
    tint: p.tint,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    curve: p.curve,
    vibrance: p.vibrance,
    saturation: p.saturation,
    hsl: p.hsl,
    grade: p.grade,
    vignette: p.vignette,
    clarity: p.clarity,
    texture: p.texture,
    grain: 0,
  }
}

// ---------------- calibration: how Lightroom renders your camera ----------------

export interface Calibration {
  r: number[]
  g: number[]
  b: number[]
  pairs: number
}

/** Learns per-channel curves that turn the camera's built-in JPEG into what Lightroom shows for the same RAW. */
export function learnCalibration(cameraJpeg: Pixels, lightroom: Pixels, prev?: Calibration | null): Calibration {
  const w = Math.min(cameraJpeg.w, lightroom.w)
  const h = Math.min(cameraJpeg.h, lightroom.h)
  const sum = [new Float64Array(256), new Float64Array(256), new Float64Array(256)]
  const cnt = [new Float64Array(256), new Float64Array(256), new Float64Array(256)]
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (Math.floor((y * cameraJpeg.h) / h) * cameraJpeg.w + Math.floor((x * cameraJpeg.w) / w)) * 4
      const j = (Math.floor((y * lightroom.h) / h) * lightroom.w + Math.floor((x * lightroom.w) / w)) * 4
      for (let c = 0; c < 3; c++) {
        sum[c][cameraJpeg.data[i + c]] += lightroom.data[j + c]
        cnt[c][cameraJpeg.data[i + c]]++
      }
    }
  const curve = (c: number, old?: number[]) => {
    const out: number[] = []
    let last = 0
    for (let v = 0; v < 256; v++) {
      let val = cnt[c][v] > 3 ? sum[c][v] / cnt[c][v] : NaN
      if (Number.isNaN(val)) {
        // fill gaps from neighbours
        let lo = v - 1
        let hi = v + 1
        while (lo >= 0 && cnt[c][lo] <= 3) lo--
        while (hi < 256 && cnt[c][hi] <= 3) hi++
        const a = lo >= 0 ? sum[c][lo] / cnt[c][lo] : 0
        const b = hi < 256 ? sum[c][hi] / cnt[c][hi] : 255
        val = lo >= 0 && hi < 256 ? a + ((b - a) * (v - lo)) / (hi - lo) : lo >= 0 ? a : b
      }
      if (old) val = (val + old[v] * (prev?.pairs ?? 0)) / ((prev?.pairs ?? 0) + 1)
      last = Math.max(last, val)
      out.push(Math.round(last))
    }
    return out
  }
  return { r: curve(0, prev?.r), g: curve(1, prev?.g), b: curve(2, prev?.b), pairs: (prev?.pairs ?? 0) + 1 }
}

/** Short text summary of a look, for Sandy. */
export function describeText(d: Descriptor): string {
  const cast = (z: { a: number; b: number }) => {
    if (Math.hypot(z.a, z.b) < 2) return 'neutral'
    const warm = z.b > 2 ? 'warm' : z.b < -2 ? 'cool/blue' : ''
    const mg = z.a > 2 ? ' magenta' : z.a < -2 ? ' green' : ''
    return `${warm}${mg}`.trim()
  }
  const top = d.bands
    .map((b, k) => ({ k, w: b.w }))
    .sort((x, y) => y.w - x.w)
    .slice(0, 3)
    .filter((x) => x.w > 0.02)
    .map((x) => BANDS[x.k])
  const skin = d.skin.w > 0.01 ? `; skin L${d.skin.L.toFixed(0)} a${d.skin.a.toFixed(0)} b${d.skin.b.toFixed(0)}` : ''
  const vig = d.vignette < 0.8 ? 'strong vignette' : d.vignette < 0.95 ? 'light vignette' : 'no vignette'
  return `blacks at L${d.L[0].toFixed(0)}, median L${d.L[8].toFixed(0)}, whites at L${d.L[16].toFixed(0)}; shadows ${cast(d.zones[1])}, highlights ${cast(d.zones[4])}; colourfulness ${d.chroma[1].toFixed(0)}; main colours ${top.join(', ') || 'muted'}${skin}; ${vig}`
}

/** Checks two images are the same photo (for calibration), by comparing a tiny greyscale version. */
export function sameShot(a: Pixels, b: Pixels): boolean {
  const g = (p: Pixels) => {
    const out: number[] = []
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const i = (Math.floor(((y + 0.5) * p.h) / 8) * p.w + Math.floor(((x + 0.5) * p.w) / 8)) * 4
        out.push(p.data[i] + p.data[i + 1] + p.data[i + 2])
      }
    const m = out.reduce((s, v) => s + v, 0) / out.length
    return out.map((v) => v > m)
  }
  const ga = g(a)
  const gb = g(b)
  return ga.filter((v, i) => v === gb[i]).length >= 50 && Math.abs(a.w / a.h - b.w / b.h) < 0.05
}
