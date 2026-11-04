import { useState } from 'react'
import type { Client } from '../../types'

interface Props {
  clients: Client[]
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function AvailabilityCalendar({ clients }: Props) {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())

  const bookedDates = new Set(
    clients
      .filter((c) => c.stage === 'booked' && c.shootDate)
      .map((c) => c.shootDate),
  )

  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const todayISO = now.toISOString().slice(0, 10)
  const cells: { day: number; iso: string }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, iso })
  }

  function prev() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
  }
  function next() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
  }

  return (
    <div className="hub-widget hub-cal">
      <div className="hub-cal-header">
        <h3 className="hub-widget-title">Availability</h3>
        <div className="hub-cal-nav">
          <button className="hub-cal-arrow" onClick={prev}>‹</button>
          <span className="hub-cal-month">{MONTH_NAMES[month]} {year}</span>
          <button className="hub-cal-arrow" onClick={next}>›</button>
        </div>
      </div>
      <div className="hub-cal-grid">
        {DAY_NAMES.map((d) => (
          <span key={d} className="hub-cal-day-name">{d}</span>
        ))}
        {Array.from({ length: startDow }).map((_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {cells.map(({ day, iso }) => (
          <span
            key={day}
            className={
              'hub-cal-cell' +
              (iso === todayISO ? ' hub-cal-today' : '') +
              (bookedDates.has(iso) ? ' hub-cal-booked' : '')
            }
          >
            {day}
            {bookedDates.has(iso) && <span className="hub-cal-dot" />}
          </span>
        ))}
      </div>
    </div>
  )
}
