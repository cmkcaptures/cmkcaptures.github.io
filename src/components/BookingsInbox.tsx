import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { formatDate } from '../invoiceTypes'

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

export default function BookingsInbox({ onAdd }: { onAdd: (booking: Booking) => void }) {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (loading) return <p className="gr-empty">Loading…</p>

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      {bookings.length === 0 && <p className="gr-empty">No bookings yet. They'll appear here when someone books on your site.</p>}
      {bookings.map((b) => (
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
            <div className="gr-actions">
              <button className="btn-brass" onClick={() => addToPipeline(b)}>
                Add to Pipeline
              </button>
              <button className="gallery-btn" onClick={() => setHandled(b)}>
                Mark handled
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}
