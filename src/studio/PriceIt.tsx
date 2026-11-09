// Pricing brain: free, rule-based suggestion from the job details and your own past prices.
import { useMemo, useState } from 'react'
import type { Client } from '../types'
import { formatMoney, parseMoney } from '../invoiceTypes'
import './PriceIt.css'

const TYPES = {
  club: { label: 'Club night', base: 150, perHour: 45 },
  event: { label: 'Private event', base: 170, perHour: 50 },
  artist: { label: 'Artist / live set', base: 120, perHour: 45 },
  portrait: { label: 'Portrait shoot', base: 90, perHour: 40 },
  brand: { label: 'Brand / content', base: 220, perHour: 65 },
} as const
type TypeKey = keyof typeof TYPES

const SIZES = { small: { label: 'Under 150', x: 1 }, medium: { label: '150–500', x: 1.15 }, large: { label: '500+', x: 1.35 } } as const
type SizeKey = keyof typeof SIZES

export default function PriceIt({ clients }: { clients: Client[] }) {
  const [type, setType] = useState<TypeKey>('club')
  const [hours, setHours] = useState(3)
  const [size, setSize] = useState<SizeKey>('medium')
  const [rush, setRush] = useState(false)
  const [reels, setReels] = useState(false)
  const [weekend, setWeekend] = useState(true)
  const [repeat, setRepeat] = useState(false)

  const past = clients.map((c) => parseMoney(c.price)).filter((n) => n > 0)
  const pastAvg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0

  const result = useMemo(() => {
    const t = TYPES[type]
    const lines: { label: string; amount: number }[] = []
    lines.push({ label: `${t.label} base (first 2h)`, amount: t.base })
    if (hours > 2) lines.push({ label: `${hours - 2} extra hour${hours - 2 === 1 ? '' : 's'}`, amount: (hours - 2) * t.perHour })
    let sum = lines.reduce((a, l) => a + l.amount, 0)
    const sizeUp = sum * (SIZES[size].x - 1)
    if (sizeUp) lines.push({ label: `Crowd ${SIZES[size].label}`, amount: sizeUp })
    if (weekend) lines.push({ label: 'Fri/Sat night', amount: 20 })
    if (rush) lines.push({ label: 'Next-morning delivery', amount: 40 })
    if (reels) lines.push({ label: '3–5 short clips for reels', amount: 80 })
    sum = lines.reduce((a, l) => a + l.amount, 0)
    if (repeat) {
      const off = -Math.round(sum * 0.1)
      lines.push({ label: 'Repeat client (10% off)', amount: off })
      sum += off
    }
    const suggested = Math.round(sum / 5) * 5
    return { lines, suggested, low: Math.round((suggested * 0.85) / 5) * 5, high: Math.round((suggested * 1.15) / 5) * 5 }
  }, [type, hours, size, rush, reels, weekend, repeat])

  const verdict =
    pastAvg > 0
      ? result.suggested > pastAvg * 1.25
        ? `That's above your usual (${formatMoney(pastAvg)}). Worth it for this job, so don't undersell.`
        : result.suggested < pastAvg * 0.8
          ? `That's below your usual (${formatMoney(pastAvg)}). Fine for a small night or a new relationship.`
          : `Right in line with what you normally charge (${formatMoney(pastAvg)}).`
      : 'Add prices to your clients and I can compare against what you usually charge.'

  const quote = `Hey! For ${TYPES[type].label.toLowerCase()} coverage (${hours}h${reels ? ' + reel clips' : ''}${rush ? ', next-morning delivery' : ''}) it's ${formatMoney(result.suggested)}. 50% non-refundable deposit (${formatMoney(result.suggested / 2)}) locks the date, balance on delivery. Gallery within 48h.`

  return (
    <div className="pi">
      <section className="pi-form">
        <h3>The job</h3>
        <div className="pi-chips">
          {(Object.keys(TYPES) as TypeKey[]).map((k) => (
            <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>
              {TYPES[k].label}
            </button>
          ))}
        </div>
        <label className="pi-slider">
          <span>
            Hours <b>{hours}h</b>
          </span>
          <input type="range" min={1} max={8} value={hours} onChange={(e) => setHours(+e.target.value)} />
        </label>
        <h3>Crowd size</h3>
        <div className="pi-chips">
          {(Object.keys(SIZES) as SizeKey[]).map((k) => (
            <button key={k} className={size === k ? 'on' : ''} onClick={() => setSize(k)}>
              {SIZES[k].label}
            </button>
          ))}
        </div>
        <h3>Extras</h3>
        <div className="pi-toggles">
          {[
            ['Fri/Sat night', weekend, setWeekend],
            ['Next-morning delivery', rush, setRush],
            ['Reel clips', reels, setReels],
            ['Repeat client', repeat, setRepeat],
          ].map(([label, on, set]) => (
            <button key={label as string} className={on ? 'on' : ''} onClick={() => (set as (v: boolean) => void)(!(on as boolean))} aria-pressed={on as boolean}>
              <i />
              {label as string}
            </button>
          ))}
        </div>
      </section>

      <section className="pi-result">
        <span className="pi-over">Charge</span>
        <b className="pi-price" key={result.suggested}>
          {formatMoney(result.suggested)}
        </b>
        <span className="pi-range">
          Fair range {formatMoney(result.low)} – {formatMoney(result.high)} · deposit {formatMoney(result.suggested / 2)}
        </span>
        <ul>
          {result.lines.map((l) => (
            <li key={l.label}>
              <span>{l.label}</span>
              <span>
                {l.amount < 0 ? '−' : '+'}
                {formatMoney(Math.abs(l.amount))}
              </span>
            </li>
          ))}
        </ul>
        <p className="pi-verdict">{verdict}</p>
        <button className="btn-brass" onClick={() => navigator.clipboard.writeText(quote)}>
          Copy quote message
        </button>
      </section>
    </div>
  )
}
