import { useState } from 'react'
import type { Lead } from '../growth'
import type { Booking } from './BookingsInbox'
import BookingsInbox from './BookingsInbox'
import GrowthView from './GrowthView'
import QuoteBuilder from './QuoteBuilder'

type Tab = 'leads' | 'bookings' | 'quotes'

const TABS: { key: Tab; label: string }[] = [
  { key: 'leads', label: 'Leads' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'quotes', label: 'Quotes' },
]

interface Props {
  onLeadBooked: (lead: Lead) => void
  onBookingAdded: (booking: Booking) => void
}

export default function GrowthHub({ onLeadBooked, onBookingAdded }: Props) {
  const [tab, setTab] = useState<Tab>('leads')
  return (
    <div>
      <div className="px-tabs gr-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'leads' && <GrowthView onBooked={onLeadBooked} />}
      {tab === 'bookings' && <BookingsInbox onAdd={onBookingAdded} />}
      {tab === 'quotes' && <QuoteBuilder />}
    </div>
  )
}
