import { useMemo, useState } from 'react'
import { portfolio } from './portfolioData'
import { supabase } from '../supabase'
import './BookingFlow.css'

const TIMES = ['Morning', 'Afternoon', 'Evening', 'Late night', 'Not sure yet']
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BookingFlow() {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [step, setStep] = useState(1)
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [details, setDetails] = useState({
    name: '',
    email: '',
    phone: '',
    type: portfolio.shootTypes[0],
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  function setDetail<K extends keyof typeof details>(key: K, value: string) {
    setDetails((d) => ({ ...d, [key]: value }))
  }

  // ---- calendar grid ----
  const monthLabel = cursor.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const canGoPrev =
    cursor.getFullYear() > today.getFullYear() ||
    (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() > today.getMonth())

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  function dayInfo(day: number) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day)
    const key = iso(d)
    const isPast = d < today
    return { key, disabled: isPast }
  }

  const canNext1 = date && time
  const canNext2 = details.name.trim() && details.email.trim()

  function formattedDate() {
    if (!date) return ''
    return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  }

  function confirmBooking() {
    setSubmitting(true)
    Promise.resolve(
      supabase?.from('bookings').insert({
        name: details.name,
        email: details.email,
        phone: details.phone,
        shoot_type: details.type,
        shoot_date: date,
        shoot_time: time,
        message: details.message,
      }),
    )
      .then((res) => {
        if (!res || res.error) throw new Error('failed')
        setConfirmed(true)
      })
      .catch(() => {
        // Never lose a booking — fall back to email with the details.
        const b = `Name: ${details.name}\nEmail: ${details.email}\nPhone: ${details.phone}\nShoot: ${details.type}\nDate: ${formattedDate()} (${time})\n\n${details.message}`
        window.location.href = `mailto:${portfolio.email}?subject=${encodeURIComponent(
          `Booking request — ${details.type}`,
        )}&body=${encodeURIComponent(b)}`
      })
      .finally(() => setSubmitting(false))
  }

  if (confirmed) {
    return (
      <div className="bk-done">
        <div className="bk-done-check">✓</div>
        <h3>Request sent</h3>
        <p>
          Thanks {details.name.split(' ')[0]} — I've got your request for {formattedDate()}.
          I'll check my availability and get back to you. Your date is confirmed once the 50% deposit is paid.
        </p>
      </div>
    )
  }

  return (
    <div className="bk">
      {/* Stepper */}
      <div className="bk-steps">
        {[1, 2, 3].map((s, i) => (
          <div className="bk-step-wrap" key={s}>
            <div className={`bk-step${step === s ? ' active' : ''}${step > s ? ' done' : ''}`}>
              {step > s ? '✓' : s}
            </div>
            {i < 2 && <div className={`bk-step-line${step > s ? ' done' : ''}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 — date & time */}
      {step === 1 && (
        <div className="bk-body">
          <div className="bk-cols">
            <div className="bk-cal-col">
              <span className="bk-label">Date you'd like</span>
              <div className="bk-cal">
                <div className="bk-cal-head">
                  <span className="bk-month">{monthLabel}</span>
                  <div className="bk-cal-nav">
                    <button onClick={() => shiftMonth(-1)} disabled={!canGoPrev} aria-label="Previous month">
                      ‹
                    </button>
                    <button onClick={() => shiftMonth(1)} aria-label="Next month">
                      ›
                    </button>
                  </div>
                </div>
                <div className="bk-cal-grid">
                  {WEEKDAYS.map((w) => (
                    <span className="bk-weekday" key={w}>{w}</span>
                  ))}
                  {cells.map((day, i) => {
                    if (day === null) return <span key={`b${i}`} />
                    const info = dayInfo(day)
                    return (
                      <button
                        key={day}
                        className={`bk-day${date === info.key ? ' selected' : ''}`}
                        disabled={info.disabled}
                        onClick={() => setDate(info.key)}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="bk-times-col">
              <span className="bk-label">Roughly when</span>
              <div className="bk-times">
                {TIMES.map((t) => (
                  <button
                    key={t}
                    className={`bk-time${time === t ? ' selected' : ''}`}
                    onClick={() => setTime(t)}
                    disabled={!date}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="bk-actions">
            <span />
            <button className="pf-btn-brass" disabled={!canNext1} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — details */}
      {step === 2 && (
        <div className="bk-body">
          <div className="bk-form">
            <div className="bk-form-grid">
              <input
                placeholder="Your name"
                value={details.name}
                onChange={(e) => setDetail('name', e.target.value)}
              />
              <input
                placeholder="Your email"
                type="email"
                value={details.email}
                onChange={(e) => setDetail('email', e.target.value)}
              />
            </div>
            <div className="bk-form-grid">
              <input
                placeholder="Phone (optional)"
                value={details.phone}
                onChange={(e) => setDetail('phone', e.target.value)}
              />
              <select value={details.type} onChange={(e) => setDetail('type', e.target.value)}>
                {portfolio.shootTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <textarea
              rows={4}
              placeholder="Where, the vibe, anything I should know…"
              value={details.message}
              onChange={(e) => setDetail('message', e.target.value)}
            />
          </div>
          <div className="bk-actions">
            <button className="pf-btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="pf-btn-brass" disabled={!canNext2} onClick={() => setStep(3)}>
              Next
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — confirm & deposit */}
      {step === 3 && (
        <div className="bk-body">
          <div className="bk-summary">
            <span className="bk-label">Your booking</span>
            <div className="bk-summary-row"><span>Shoot</span><span>{details.type}</span></div>
            <div className="bk-summary-row"><span>Date</span><span>{formattedDate()}</span></div>
            <div className="bk-summary-row"><span>Time</span><span>{time}</span></div>
            <div className="bk-summary-row"><span>Name</span><span>{details.name}</span></div>
          </div>

          <div className="bk-deposit">
            <div className="bk-deposit-head">
              <span className="bk-label">Deposit to secure your date</span>
              <span className="bk-deposit-amount">50%</span>
            </div>
            <div className="bk-pay-methods">
              <span className="bk-pay-chip selected">💳 Card</span>
              <span className="bk-pay-chip">🏦 Bank transfer</span>
            </div>
            <p className="bk-pay-note">
              Secure card payment activates once the site is live — for now your date is held and
              I'll send a deposit link to confirm.
            </p>
          </div>

          <div className="bk-actions">
            <button className="pf-btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="pf-btn-brass" onClick={confirmBooking} disabled={submitting}>
              {submitting ? 'Sending…' : 'Request booking'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
