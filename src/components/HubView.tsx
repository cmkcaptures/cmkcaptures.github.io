import { useState, useEffect } from 'react'
import type { Client } from '../types'
import type { Invoice, BusinessProfile } from '../invoiceTypes'
import { generateInsights, getGreeting } from '../hubEngine'
import BrainFeed from './hub/BrainFeed'
import QuickActions from './hub/QuickActions'
import UpcomingShoots from './hub/UpcomingShoots'
import RevenueWidget from './hub/RevenueWidget'
import ClientInsights from './hub/ClientInsights'
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

function StatusBar({ clients, invoices }: { clients: Client[]; invoices: Invoice[] }) {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const active = clients.filter((c) => c.stage !== 'paid').length
  const booked = clients.filter((c) => c.stage === 'booked').length
  const pendingInv = invoices.filter((i) => i.status !== 'paid').length

  return (
    <div className="hub-status-bar">
      <div className="hub-status-left">
        <span className="hub-status-dot hub-status-dot--live" />
        <span className="hub-status-label">SYSTEM ACTIVE</span>
      </div>
      <div className="hub-status-metrics">
        <span className="hub-status-metric">
          <span className="hub-status-metric-val">{active}</span> ACTIVE
        </span>
        <span className="hub-status-divider" />
        <span className="hub-status-metric">
          <span className="hub-status-metric-val">{booked}</span> BOOKED
        </span>
        <span className="hub-status-divider" />
        <span className="hub-status-metric">
          <span className="hub-status-metric-val">{pendingInv}</span> INVOICES
        </span>
      </div>
      <div className="hub-status-time">
        {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    </div>
  )
}

function SystemHealth({ clients }: { clients: Client[] }) {
  const total = clients.length || 1
  const paid = clients.filter((c) => c.stage === 'paid').length
  const rate = Math.round((paid / total) * 100)

  const pipelineHealth = clients.length === 0 ? 0 : Math.min(100, Math.round(
    (clients.filter((c) => c.stage === 'booked').length / Math.max(1, clients.filter((c) => c.stage !== 'paid').length)) * 100
  ))

  return (
    <div className="hub-widget hub-system">
      <h3 className="hub-widget-title">
        <span className="hub-title-dot" />
        System diagnostics
      </h3>
      <div className="hub-sys-gauges">
        <div className="hub-gauge">
          <svg viewBox="0 0 80 80" className="hub-gauge-svg">
            <circle cx="40" cy="40" r="34" className="hub-gauge-track" />
            <circle cx="40" cy="40" r="34" className="hub-gauge-fill"
              style={{ strokeDasharray: `${rate * 2.136} 213.6` }} />
          </svg>
          <div className="hub-gauge-inner">
            <span className="hub-gauge-val">{rate}%</span>
          </div>
          <span className="hub-gauge-label">Completion</span>
        </div>
        <div className="hub-gauge">
          <svg viewBox="0 0 80 80" className="hub-gauge-svg">
            <circle cx="40" cy="40" r="34" className="hub-gauge-track" />
            <circle cx="40" cy="40" r="34" className="hub-gauge-fill hub-gauge-fill--alt"
              style={{ strokeDasharray: `${pipelineHealth * 2.136} 213.6` }} />
          </svg>
          <div className="hub-gauge-inner">
            <span className="hub-gauge-val">{pipelineHealth}%</span>
          </div>
          <span className="hub-gauge-label">Pipeline</span>
        </div>
        <div className="hub-gauge">
          <svg viewBox="0 0 80 80" className="hub-gauge-svg">
            <circle cx="40" cy="40" r="34" className="hub-gauge-track" />
            <circle cx="40" cy="40" r="34" className="hub-gauge-fill"
              style={{ strokeDasharray: `${Math.min(100, clients.length * 10) * 2.136} 213.6` }} />
          </svg>
          <div className="hub-gauge-inner">
            <span className="hub-gauge-val">{clients.length}</span>
          </div>
          <span className="hub-gauge-label">Total clients</span>
        </div>
      </div>
    </div>
  )
}

function ActivityPulse({ clients }: { clients: Client[] }) {
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const iso = d.toISOString().slice(0, 10)
    const count = clients.filter((c) => c.lastUpdated.slice(0, 10) === iso).length
    return { day: d.toLocaleDateString('en-GB', { weekday: 'short' }), count }
  })
  const max = Math.max(1, ...last7.map((d) => d.count))

  return (
    <div className="hub-widget hub-pulse">
      <h3 className="hub-widget-title">
        <span className="hub-title-dot" />
        Activity — last 7 days
      </h3>
      <div className="hub-pulse-bars">
        {last7.map((d, i) => (
          <div className="hub-pulse-col" key={i}>
            <div className="hub-pulse-bar-track">
              <div
                className="hub-pulse-bar-fill"
                style={{ height: `${(d.count / max) * 100}%` }}
              />
            </div>
            <span className="hub-pulse-day">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
  const insights = generateInsights(clients, invoices, business)

  function handleInsightAction(payload: { view: string; clientId?: string }) {
    if (payload.clientId) {
      const client = clients.find((c) => c.id === payload.clientId)
      if (client) {
        onEditClient(client)
        return
      }
    }
    onNavigate(payload.view)
  }

  return (
    <div className="hub">
      <div className="hub-grid-bg" />
      <StatusBar clients={clients} invoices={invoices} />

      <div className="hub-hero">
        <h1 className="hub-greeting">{getGreeting(business.yourName)}</h1>
        <p className="hub-subtitle">Here's your command centre. Everything at a glance.</p>
      </div>

      <div className="hub-grid-top">
        <div className="hub-col-main">
          <BrainFeed insights={insights} onAction={handleInsightAction} />
        </div>
        <div className="hub-col-side">
          <QuickActions
            onNewClient={onNewClient}
            onNewInvoice={onNewInvoice}
            onNavigate={onNavigate}
          />
          <SystemHealth clients={clients} />
        </div>
      </div>

      <div className="hub-row-3">
        <UpcomingShoots clients={clients} onEditClient={onEditClient} />
        <RevenueWidget clients={clients} invoices={invoices} business={business} />
        <ClientInsights clients={clients} onEditClient={onEditClient} />
      </div>

      <div className="hub-row-2">
        <AvailabilityCalendar clients={clients} />
        <ActivityPulse clients={clients} />
      </div>
    </div>
  )
}
