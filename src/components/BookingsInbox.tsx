import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatDate, formatMoney, parseMoney } from '../invoiceTypes'
import type { Client } from '../types'
import { parseShootDate } from '../studio/time'
import { sandyWrite } from '../studio/sandyWrite'

export interface Booking {
  id: string
  name: string
  email: string
  phone: string
  shoot_type: string
  shoot_date: string
  shoot_time: string
  message: string
  handled: boolean
  created_at: string
}

/** Rough price for a website enquiry, in line with the Price it tool. */
function guessPrice(b: Booking, clients: Client[]): { price: number; why: string } {
  const t = b.shoot_type.toLowerCase()
  const [base, perHour, label] = /portrait/.test(t) ? [90, 40, 'portrait'] : /brand|content/.test(t) ? [220, 65, 'brand'] : /concert|live|artist/.test(t) ? [120, 45, 'live set'] : [150, 45, 'event/club']
  const hours = /portrait/.test(t) ? 1.5 : 3
  let price = base + Math.max(0, hours - 2) * perHour
  const day = b.shoot_date ? new Date(`${b.shoot_date}T00:00:00`).getDay() : -1
  if (day === 5 || day === 6) price += 20
  if (/late|night/i.test(b.shoot_time)) price += 15
  price = Math.round(price / 5) * 5
  const past = clients.map((c) => parseMoney(c.price)).filter((n) => n > 0)
  const avg = past.length ? past.reduce((a, n) => a + n, 0) / past.length : 0
  return { price, why: `${label}, ~${hours}h${day === 5 || day === 6 ? ', weekend' : ''}${avg ? `; you usually charge ${formatMoney(avg)}` : ''}` }
}

function clashes(b: Booking, clients: Client[], all: Booking[]): string[] {
  if (!b.shoot_date) return []
  const out: string[] = []
  for (const c of clients) {
    const d = parseShootDate(c.shootDate)
    if (d && c.stage !== 'inquiry' && d.toDateString() === new Date(`${b.shoot_date}T00:00:00`).toDateString()) out.push(`${c.name} (${c.stage})`)
  }
  for (const o of all) if (o.id !== b.id && !o.handled && o.shoot_date === b.shoot_date) out.push(`${o.name} (another enquiry)`)
  return out
}

export default function BookingsInbox({ onAdd, clients = [] }: { onAdd: (booking: Booking) => void; clients?: Client[] }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string | null>>({})
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setBookings(data as Booking[])
        setLoading(false)
      })
  }, [])

  async function setHandled(booking: Booking) {
    if (!supabase) return
    setError('')
    const { error: failed } = await supabase.from('bookings').update({ handled: true }).eq('id', booking.id)
    if (failed) {
      setError(failed.message)
      return false
    }
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, handled: true } : b)))
    return true
  }

  async function addToPipeline(booking: Booking) {
    if (await setHandled(booking)) onAdd(booking)
  }

  async function draft(b: Booking) {
    setDrafts((d) => ({ ...d, [b.id]: null }))
    const { price } = guessPrice(b, clients)
    const busy = clashes(b, clients, bookings)
    const first = b.name.split(' ')[0]
    const text = await sandyWrite(
      `Write a friendly email reply from me (CMK Captures) to ${first}, who booked through my website: ${b.shoot_type || 'a shoot'} on ${b.shoot_date ? formatDate(b.shoot_date) : 'a date to confirm'}${b.shoot_time ? `, ${b.shoot_time}` : ''}. Their message: "${b.message.slice(0, 300)}". ${
        busy.length ? `I'm already booked that date, so apologise and offer to help find another date or refer them.` : `I'm free that date.`
      } Quote ${formatMoney(price)} with a 50% non-refundable deposit (${formatMoney(price / 2)}) to lock the date, balance on delivery, gallery within 48 hours. Ask for the venue, start/finish times and anything specific they want captured. Sign off as CMK Captures. 5-8 short sentences, no subject line.`,
    )
    setDrafts((d) => ({
      ...d,
      [b.id]:
        text ??
        `Hi ${first},\n\nThanks for booking! ${busy.length ? "Unfortunately I'm already booked that date, but I'd love to help with another one." : "I'm free that date."} For ${b.shoot_type || 'the shoot'} it's ${formatMoney(price)}, with a 50% non-refundable deposit (${formatMoney(price / 2)}) to lock it in and the balance on delivery. Your gallery comes back within 48 hours.\n\nCould you send the venue and start/finish times?\n\nCMK Captures`,
    }))
  }

  if (loading) return <p className="gr-empty">Loading…</p>

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      {bookings.length === 0 && <p className="gr-empty">No bookings yet. They'll appear here when someone books on your site.</p>}
      {bookings.map((b) => {
        const busy = clashes(b, clients, bookings)
        const quote = guessPrice(b, clients)
        const d = drafts[b.id]
        return (
          <article className={`gr-card${b.handled ? ' done' : ''}`} key={b.id}>
            <header>
              <h3>{b.name}</h3>
              <span className="gr-badge">{b.handled ? 'Handled' : 'New'}</span>
            </header>
            <p className="gr-card-meta">
              {b.shoot_type || 'Shoot'}
              {b.shoot_date ? ` · ${formatDate(b.shoot_date)}` : ''}
              {b.shoot_time ? ` at ${b.shoot_time}` : ''}
            </p>
            <p className="gr-card-meta">
              <a href={`mailto:${b.email}`}>{b.email}</a>
              {b.phone ? ` · ${b.phone}` : ''}
            </p>
            {b.message && <p className="gr-message">{b.message}</p>}

            {!b.handled && (
              <div className="bk-sandy">
                <span className={`bk-chip ${busy.length ? 'clash' : 'free'}`}>{b.shoot_date ? (busy.length ? `Clash: ${busy.join(', ')}` : '✓ You\'re free that date') : 'No date given'}</span>
                <span className="bk-chip price" title={quote.why}>
                  Suggest {formatMoney(quote.price)} · deposit {formatMoney(quote.price / 2)}
                </span>
              </div>
            )}

            {b.id in drafts && (
              <div className="bk-draft">
                {d === null ? (
                  <p className="st-empty st-loading">Sandy is writing your reply…</p>
                ) : (
                  <>
                    <textarea className="ev-draft" rows={8} value={d} onChange={(e) => setDrafts((all) => ({ ...all, [b.id]: e.target.value }))} />
                    <div className="gr-actions">
                      <a className="btn-brass" href={`mailto:${b.email}?subject=${encodeURIComponent(`Your ${b.shoot_type || 'shoot'} with CMK Captures`)}&body=${encodeURIComponent(d)}`}>
                        Open in email
                      </a>
                      <button
                        className="gallery-btn"
                        onClick={() =>
                          navigator.clipboard.writeText(d).then(() => {
                            setCopied(b.id)
                            setTimeout(() => setCopied(''), 1500)
                          })
                        }
                      >
                        {copied === b.id ? 'Copied!' : 'Copy'}
                      </button>
                      <button className="gallery-btn" onClick={() => draft(b)}>
                        ↻ Rewrite
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {!b.handled && (
              <div className="gr-actions">
                {!(b.id in drafts) && (
                  <button className="btn-brass" onClick={() => draft(b)}>
                    ✦ Sandy, draft my reply
                  </button>
                )}
                <button className={b.id in drafts ? 'btn-brass' : 'gallery-btn'} onClick={() => addToPipeline(b)}>
                  Add to Pipeline
                </button>
                <button className="gallery-btn" onClick={() => setHandled(b)}>
                  Mark handled
                </button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
