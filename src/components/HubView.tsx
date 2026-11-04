import { useState } from 'react'
import type { Client } from '../types'
import { STAGES, initials, paymentStatus } from '../types'
import type { Invoice, BusinessProfile } from '../invoiceTypes'
import { formatMoney, invoiceBalance, parseMoney } from '../invoiceTypes'
import { generateInsights, getGreeting } from '../hubEngine'
import AvailabilityCalendar from './hub/AvailabilityCalendar'
import './HubView.css'

interface Props {
  clients: Client[]
  invoices: Invoice[]
  business: BusinessProfile
  onNavigate: (view: string) => void
  onEditClient: (client: Client) => void
  onNewClient: () => void
  onNewInvoice: () => void
}

const SLOTS = 30
const PAY_LABEL = { unpaid: 'Unpaid', deposit: 'Deposit', paid: 'Paid' }

function daysUntil(date: string): number {
  const target = new Date(date + 'T00:00:00').getTime()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target - now.getTime()) / 86400000)
}

function whenLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

export default function HubView({
  clients,
  invoices,
  business,
  onNavigate,
  onEditClient,
  onNewClient,
  onNewInvoice,
}: Props) {
  const [tab, setTab] = useState<'clients' | 'calendar'>('clients')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = clients.find((c) => c.id === selectedId) ?? clients[0] ?? null

  const insights = generateInsights(clients, invoices, business)
  const moves = selected
    ? insights.filter((i) => i.actionPayload?.clientId === selected.id)
    : insights

  const upNext = clients
    .filter((c) => c.stage === 'booked' && c.shootDate)
    .map((c) => ({ client: c, days: daysUntil(c.shootDate) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)

  const pending = clients
    .filter((c) => !c.fullyPaid && c.stage !== 'inquiry')
    .reduce((sum, c) => sum + parseMoney(c.price), 0)
  const owed = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((sum, i) => sum + invoiceBalance(i), 0)

  const slots = Array.from({ length: Math.max(SLOTS, clients.length) }, (_, i) => clients[i] ?? null)

  return (
    <div className="px">
      <div className="px-tabs">
        <button className={tab === 'clients' ? 'on' : ''} onClick={() => setTab('clients')}>
          Clients
        </button>
        <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>
          Calendar
        </button>
        <span className="px-greeting">{getGreeting(business.yourName)}</span>
      </div>

      <div className="px-main">
        <section className="px-party">
          <h2 className="px-pill-title">Up next</h2>
          {upNext.length === 0 && <p className="px-empty">No shoots booked yet</p>}
          {upNext.map(({ client: c, days }) => (
            <button className="px-party-row" key={c.id} onClick={() => setSelectedId(c.id)}>
              <span className="px-level">{whenLabel(days)}</span>
              <span className="px-party-name">{c.name}</span>
              <span className="px-party-type">{c.type || 'Shoot'}</span>
            </button>
          ))}
        </section>

        <section className="px-box">
          {tab === 'clients' ? (
            <>
              <div className="px-box-title">
                All clients <b>{clients.length}</b>
              </div>
              <div className="px-grid">
                {slots.map((c, i) =>
                  c ? (
                    <button
                      key={c.id}
                      className={`px-slot filled${selected?.id === c.id ? ' selected' : ''}`}
                      onClick={() => setSelectedId(c.id)}
                      onDoubleClick={() => onEditClient(c)}
                      title={c.name}
                    >
                      {initials(c.name)}
                      <i className={`px-dot px-${c.stage}`} />
                    </button>
                  ) : (
                    <button
                      key={`empty-${i}`}
                      className="px-slot"
                      onClick={onNewClient}
                      aria-label="Add a client"
                    />
                  ),
                )}
              </div>
            </>
          ) : (
            <AvailabilityCalendar clients={clients} />
          )}
        </section>

        <aside className="px-detail">
          <header className="px-detail-head">
            <h2>{selected ? selected.name : 'Your studio'}</h2>
            {selected?.price && <span className="px-level">{selected.price}</span>}
          </header>
          <div className="px-detail-body">
            {selected ? (
              <>
                <div className="px-tags">
                  <span className={`px-tag px-${selected.stage}`}>
                    {STAGES.find((s) => s.key === selected.stage)?.label}
                  </span>
                  <span className="px-tag px-pay">{PAY_LABEL[paymentStatus(selected)]}</span>
                </div>
                <dl className="px-rows">
                  <dt>Shoot</dt>
                  <dd>{selected.type || '—'}</dd>
                  <dt>Date</dt>
                  <dd>{selected.shootDate || '—'}</dd>
                  <dt>Contact</dt>
                  <dd>{selected.contact || '—'}</dd>
                </dl>
              </>
            ) : (
              <dl className="px-rows">
                <dt>Pending</dt>
                <dd>{formatMoney(pending)}</dd>
                <dt>Invoices owed</dt>
                <dd>{formatMoney(owed)}</dd>
              </dl>
            )}
            <h3>{selected ? 'To do' : 'Next moves'}</h3>
            {moves.length === 0 && <p className="px-empty">All clear</p>}
            <ul className="px-moves">
              {moves.slice(0, 5).map((m) => (
                <li key={m.id} className={`px-move-${m.priority}`}>
                  {m.message}
                </li>
              ))}
            </ul>
            {selected && (
              <button className="px-open" onClick={() => onEditClient(selected)}>
                Open client
              </button>
            )}
          </div>
        </aside>
      </div>

      <footer className="px-bar">
        <span className="px-money">Pending {formatMoney(pending)}</span>
        <button onClick={onNewClient}>+ New client</button>
        <button onClick={onNewInvoice}>+ New invoice</button>
        <button onClick={() => onNavigate('pipeline')}>Pipeline</button>
        <button onClick={() => onNavigate('invoices')}>Invoices</button>
      </footer>
    </div>
  )
}
