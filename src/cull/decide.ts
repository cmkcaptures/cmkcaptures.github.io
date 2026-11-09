// Turns per-photo features into Pick / Maybe / Reject, with a reason, for a whole shoot.
import type { Features } from './analyse'
import { hamming } from './analyse'

export type Verdict = 'pick' | 'maybe' | 'reject'

export interface Shot {
  name: string
  takenAt: number
  thumb: string
  features: Features
  score: number
  verdict: Verdict
  reason: string
  group: number
  groupSize: number
  mine?: Verdict // your override
}

export type Taste = Partial<Record<TasteKey, number>>
export const TASTE_KEYS = ['sharp', 'contrast', 'colour', 'bright', 'sharpMid'] as const
type TasteKey = (typeof TASTE_KEYS)[number]

const BURST_GAP_MS = 2500
const BURST_SIMILAR = 16

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1)
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length || 1)) || 1
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  return { mean, sd, pct }
}

/** Standardised value of each taste feature for one shot, relative to the night. */
export function zFeatures(f: Features, norms: Record<TasteKey, { mean: number; sd: number }>): Record<TasteKey, number> {
  const out = {} as Record<TasteKey, number>
  for (const k of TASTE_KEYS) out[k] = (f[k] - norms[k].mean) / norms[k].sd
  return out
}

export function decide(input: Omit<Shot, 'score' | 'verdict' | 'reason' | 'group' | 'groupSize'>[], target: number, taste: Taste): Shot[] {
  const shots = [...input].sort((a, b) => a.takenAt - b.takenAt || a.name.localeCompare(b.name)) as Shot[]
  if (!shots.length) return []
  const norms = Object.fromEntries(TASTE_KEYS.map((k) => [k, stats(shots.map((s) => s.features[k]))])) as Record<TasteKey, ReturnType<typeof stats>>
  const sharp = norms.sharp

  // 1. Score every frame against the rest of the night (low light nights are judged fairly).
  for (const s of shots) {
    const f = s.features
    const z = zFeatures(f, norms)
    let score = 1.0 * z.sharp + 0.25 * z.contrast + 0.15 * z.colour
    score -= 6 * Math.max(0, f.clipHi - 0.06) + 3 * Math.max(0, f.clipLo - 0.45)
    if (f.bright < 22) score -= 1.5
    if (f.bright > 225) score -= 1.5
    for (const k of TASTE_KEYS) score += (taste[k] ?? 0) * z[k]
    s.score = score
    s.verdict = 'maybe'
    s.reason = ''
  }

  // 2. Hard fails.
  for (const s of shots) {
    const f = s.features
    if (f.sharp < sharp.pct(0.12) && f.sharp < sharp.mean * 0.6) (s.verdict = 'reject'), (s.reason = f.sharpMid < sharp.mean * 0.3 ? 'Motion blur' : 'Missed focus')
    else if (f.bright < 14 || f.clipLo > 0.8) (s.verdict = 'reject'), (s.reason = 'Far too dark')
    else if (f.bright > 238 || f.clipHi > 0.4) (s.verdict = 'reject'), (s.reason = 'Blown out')
  }

  // 3. Bursts: frames seconds apart that look alike. Keep the best one (two for long bursts if they differ).
  let group = 0
  let start = shots[0]
  shots[0].group = 0
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i]
    const prev = shots[i - 1]
    const same = s.takenAt - prev.takenAt <= BURST_GAP_MS && hamming(s.features.hash, start.features.hash) <= BURST_SIMILAR
    if (!same) {
      group++
      start = s
    }
    s.group = group
  }
  const groups = new Map<number, Shot[]>()
  shots.forEach((s) => groups.set(s.group, [...(groups.get(s.group) ?? []), s]))
  for (const members of groups.values()) {
    members.forEach((m) => (m.groupSize = members.length))
    const alive = members.filter((m) => m.verdict !== 'reject').sort((a, b) => b.score - a.score)
    if (alive.length < 2) continue
    const keep = [alive[0]]
    const second = alive[1]
    if (members.length >= 4 && hamming(second.features.hash, alive[0].features.hash) > 6 && second.score > alive[0].score - 0.6) keep.push(second)
    alive.forEach((m) => {
      if (!keep.includes(m)) (m.verdict = 'reject'), (m.reason = `Burst: a sharper frame of these ${members.length} was kept`)
    })
  }

  // 4. Rank what's left and hit the keeper target.
  const alive = shots.filter((s) => s.verdict !== 'reject').sort((a, b) => b.score - a.score)
  const picks = Math.min(target, alive.length)
  const maybes = Math.round(alive.length * 0.15)
  alive.forEach((s, i) => {
    if (i < picks) (s.verdict = 'pick'), (s.reason = i < picks * 0.2 ? 'Top of the night' : 'Sharp and well exposed')
    else if (i < picks + maybes) (s.verdict = 'maybe'), (s.reason = 'Borderline. Your call')
    else (s.verdict = 'reject'), (s.reason = 'Weaker than the rest')
  })
  return shots
}

/** Learns from your overrides: which features you value more (or less) than Sandy does. */
export function learnTaste(rows: { z: Record<string, number>; kept: boolean }[]): Taste {
  const kept = rows.filter((r) => r.kept)
  const binned = rows.filter((r) => !r.kept)
  if (kept.length < 3 || binned.length < 3) return {}
  const taste: Taste = {}
  for (const k of TASTE_KEYS) {
    const a = kept.reduce((s, r) => s + (r.z[k] ?? 0), 0) / kept.length
    const b = binned.reduce((s, r) => s + (r.z[k] ?? 0), 0) / binned.length
    taste[k] = Math.max(-0.8, Math.min(0.8, (a - b) * 0.35))
  }
  return taste
}
