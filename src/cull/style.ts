// Auto-edit: learns your Lightroom look from the .xmp sidecars of shoots you've already edited,
// then writes that look (with exposure matched to each new shot's brightness) into new sidecars.
import { supabase } from '../supabase'

export interface StyleProfile {
  samples: number
  base: Record<string, number> // median of every "look" slider you use
  temperature: number
  tint: number
  expo: { a: number; b: number } // exposure = a + b * (target brightness gap)
  targetBright: number // how bright your finished shots tend to come out (estimated)
  curves: Record<string, string> // tone curve blocks copied from your most typical edit
  profile: string
  updatedAt: string
  data?: StyleSample[] // every edit learned so far, so new shoots add to the old ones
}

export interface StyleSample {
  settings: Record<string, string>
  curves: Record<string, string>
  bright: number // preview brightness (0-255) before editing
}

// Sliders that make up "the look" (exposure, white balance and crops are handled separately).
const LOOK = /^(Contrast2012|Highlights2012|Shadows2012|Whites2012|Blacks2012|Texture|Clarity2012|Dehaze|Vibrance|Saturation|Sharpness|SharpenRadius|SharpenDetail|SharpenEdgeMasking|LuminanceSmoothing|ColorNoiseReduction|(Hue|Saturation|Luminance)Adjustment\w+|SplitToning\w+|ColorGrade\w+|Parametric\w+|GrainAmount|GrainSize|GrainFrequency|PostCropVignette\w+)$/

export function parseXmp(text: string): { settings: Record<string, string>; curves: Record<string, string> } {
  const settings: Record<string, string> = {}
  for (const m of text.matchAll(/crs:(\w+)="([^"]*)"/g)) settings[m[1]] = m[2]
  const curves: Record<string, string> = {}
  for (const m of text.matchAll(/<crs:(ToneCurvePV2012\w*)>([\s\S]*?)<\/crs:\1>/g)) curves[m[1]] = m[2].trim()
  return { settings, curves }
}

function isEdited(s: Record<string, string>): boolean {
  return ['Exposure2012', 'Contrast2012', 'Highlights2012', 'Shadows2012', 'Blacks2012', 'Vibrance'].some((k) => s[k] && Number(s[k]) !== 0)
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

export function learnStyle(all: StyleSample[]): StyleProfile | null {
  const samples = all.filter((s) => isEdited(s.settings))
  if (samples.length < 3) return null
  const keys = new Set(samples.flatMap((s) => Object.keys(s.settings).filter((k) => LOOK.test(k))))
  const base: Record<string, number> = {}
  for (const k of keys) {
    const vals = samples.map((s) => Number(s.settings[k])).filter((n) => Number.isFinite(n))
    if (vals.length) base[k] = Math.round(median(vals) * 100) / 100
  }
  // Exposure vs. how dark the untouched shot was: least-squares fit of exposure = a + b * log2(128 / brightness).
  const xs = samples.map((s) => Math.log2(128 / Math.max(8, s.bright)))
  const ys = samples.map((s) => Number(s.settings.Exposure2012 ?? 0))
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length
  const my = ys.reduce((a, b) => a + b, 0) / ys.length
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0)
  let b = sxx > 0.01 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0.6
  b = Math.max(0, Math.min(1.2, b))
  const a = my - b * mx
  // Curves: take them from the edit closest to your typical look.
  const dist = (s: StyleSample) => Object.entries(base).reduce((d, [k, v]) => d + Math.abs((Number(s.settings[k]) || 0) - v), 0)
  const typical = [...samples].sort((p, q) => dist(p) - dist(q))[0]
  const temps = samples.map((s) => Number(s.settings.Temperature)).filter((n) => n > 0)
  const tints = samples.map((s) => Number(s.settings.Tint)).filter((n) => Number.isFinite(n))
  return {
    samples: samples.length,
    base,
    temperature: Math.round(median(temps) || 5500),
    tint: Math.round(median(tints) || 0),
    expo: { a: Math.round(a * 100) / 100, b: Math.round(b * 100) / 100 },
    targetBright: 128,
    curves: typical.curves,
    profile: typical.settings.CameraProfile ?? 'Adobe Standard',
    updatedAt: new Date().toISOString(),
  }
}

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`)

/** The crs attributes + curve blocks for one new shot, in your style. */
export function styleFor(p: StyleProfile, bright: number): { attrs: string; inner: string; exposure: number } {
  const exposure = Math.max(-2, Math.min(2.5, Math.round((p.expo.a + p.expo.b * Math.log2(128 / Math.max(8, bright))) * 100) / 100))
  const attrs = [
    `crs:Version="15.0"`,
    `crs:ProcessVersion="15.4"`,
    `crs:HasSettings="True"`,
    `crs:WhiteBalance="Custom"`,
    `crs:Temperature="${p.temperature}"`,
    `crs:Tint="${sign(p.tint)}"`,
    `crs:Exposure2012="${sign(exposure)}"`,
    `crs:CameraProfile="${p.profile}"`,
    ...Object.entries(p.base).map(([k, v]) => `crs:${k}="${/Adjustment|Contrast|Highlights|Shadows|Whites|Blacks|Vibrance|Saturation|Clarity|Texture|Dehaze|Parametric|ColorGrade.*Lum|Tint/.test(k) ? sign(v) : v}"`),
  ].join('\n    ')
  const inner = Object.entries(p.curves)
    .map(([k, v]) => `   <crs:${k}>\n    ${v}\n   </crs:${k}>`)
    .join('\n')
  return { attrs, inner, exposure }
}

export async function loadStyle(): Promise<StyleProfile | null> {
  const { data } = (await supabase?.from('edit_style').select('profile').eq('id', 1).maybeSingle()) ?? {}
  return (data?.profile as StyleProfile) ?? null
}

export async function saveStyle(p: StyleProfile): Promise<void> {
  const { error } = (await supabase?.from('edit_style').upsert({ id: 1, profile: p })) ?? {}
  if (error) throw error
}
