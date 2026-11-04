import { useEffect, useState } from 'react'
import type { Client } from './types'
import { needsFollowUp, normalizeClient } from './types'
import type { Invoice, BusinessProfile } from './invoiceTypes'
import { loadClients, saveClients } from './storage'
import { loadInvoices, saveInvoices, loadBusiness, saveBusiness } from './invoiceStorage'
import ClientBoard from './components/ClientBoard'
import ClientModal from './components/ClientModal'
import InvoicesView from './components/InvoicesView'
import InvoiceModal from './components/InvoiceModal'
import InvoicePreview from './components/InvoicePreview'
import SettingsModal from './components/SettingsModal'
import ContentView from './components/ContentView'
import HubView from './components/HubView'
import GrowthHub from './components/GrowthHub'
import type { Booking } from './components/BookingsInbox'
import type { Lead } from './growth'
import Portfolio from './portfolio/Portfolio'
import ClientGallery from './components/ClientGallery'
import StudioGate from './components/StudioGate'
import { listSentGalleries } from './galleryApi'
import './App.css'
import './StudioTheme.css'

const SHOW_THUMBS = true

type View = 'hub' | 'pipeline' | 'invoices' | 'content' | 'growth'

function App() {
  const galleryMatch = window.location.pathname.match(/^\/g\/([^/]+)/)
  if (galleryMatch) return <ClientGallery token={galleryMatch[1]} />
  // Public portfolio lives at "/"; the private CRM lives at "/studio".
  if (!window.location.pathname.startsWith('/studio')) {
    return <Portfolio />
  }
  return (
    <StudioGate>
      <StudioApp />
    </StudioGate>
  )
}

function StudioApp() {
  const [clients, setClients] = useState<Client[]>(() => loadClients())
  const [invoices, setInvoices] = useState<Invoice[]>(() => loadInvoices())
  const [business, setBusiness] = useState<BusinessProfile>(() => loadBusiness())

  const [view, setView] = useState<View>('hub')

  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [showClientModal, setShowClientModal] = useState(false)

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)

  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    listSentGalleries()
      .then((sent) => {
        const sentAt = new Map(sent.map((g) => [g.client_id, g.sent_at]))
        setClients((prev) =>
          prev.map((c) => {
            const at = sentAt.get(c.id)
            if (!at || c.galleryDeliveredAt) return c
            return {
              ...c,
              stage: c.stage === 'paid' ? c.stage : 'delivered',
              galleryDeliveredAt: at.slice(0, 10),
              lastUpdated: new Date().toISOString(),
            }
          }),
        )
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    saveClients(clients)
  }, [clients])
  useEffect(() => {
    saveInvoices(invoices)
  }, [invoices])
  useEffect(() => {
    saveBusiness(business)
  }, [business])

  // ---- Client handlers ----
  function openNewClient() {
    setEditingClient(null)
    setShowClientModal(true)
  }
  function openEditClient(client: Client) {
    setEditingClient(client)
    setShowClientModal(true)
  }
  function handleSaveClient(client: Client) {
    setClients((prev) => {
      const exists = prev.some((c) => c.id === client.id)
      return exists ? prev.map((c) => (c.id === client.id ? client : c)) : [...prev, client]
    })
    setShowClientModal(false)
  }
  function handleDeleteClient(id: string) {
    setClients((prev) => prev.filter((c) => c.id !== id))
    setShowClientModal(false)
  }

  // ---- Invoice handlers ----
  function openNewInvoice() {
    setEditingInvoice(null)
    setShowInvoiceModal(true)
  }
  function openEditInvoice(inv: Invoice) {
    setEditingInvoice(inv)
    setShowInvoiceModal(true)
  }
  function handleSaveInvoice(inv: Invoice, consumedNumber: boolean) {
    setInvoices((prev) => {
      const exists = prev.some((i) => i.id === inv.id)
      return exists ? prev.map((i) => (i.id === inv.id ? inv : i)) : [...prev, inv]
    })
    if (consumedNumber) {
      setBusiness((b) => ({ ...b, nextInvoiceSeq: b.nextInvoiceSeq + 1 }))
    }
    setShowInvoiceModal(false)
  }
  function handleDeleteInvoice(id: string) {
    setInvoices((prev) => prev.filter((i) => i.id !== id))
    setShowInvoiceModal(false)
  }

  function addClientFromBooking(booking: Booking) {
    const now = new Date().toISOString()
    setClients((prev) => [
      ...prev,
      normalizeClient({
        id: crypto.randomUUID(),
        name: booking.name,
        contact: booking.email,
        type: booking.shoot_type,
        stage: 'inquiry',
        shootDate: booking.shoot_date,
        notes: [booking.shoot_time && `Time: ${booking.shoot_time}`, booking.phone && `Phone: ${booking.phone}`, booking.message]
          .filter(Boolean)
          .join('\n'),
        createdAt: now,
        lastUpdated: now,
      }),
    ])
  }

  function addClientFromLead(lead: Lead) {
    const now = new Date().toISOString()
    setClients((prev) => [
      ...prev,
      normalizeClient({
        id: crypto.randomUUID(),
        name: lead.name,
        contact: lead.handle,
        type: lead.kind === 'artist' || lead.kind === 'model' ? 'Portrait' : 'Event',
        stage: 'booked',
        shootDate: lead.event_date,
        notes: lead.notes,
        createdAt: now,
        lastUpdated: now,
      }),
    ])
  }

  const followUpCount = clients.filter(needsFollowUp).length

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="wordmark">PhotoFlow</span>
          <span className="brand-tick" />
          <nav className="view-nav">
            <button
              className={`nav-link${view === 'hub' ? ' active' : ''}`}
              onClick={() => setView('hub')}
            >
              Hub
            </button>
            <button
              className={`nav-link${view === 'pipeline' ? ' active' : ''}`}
              onClick={() => setView('pipeline')}
            >
              Pipeline
            </button>
            <button
              className={`nav-link${view === 'invoices' ? ' active' : ''}`}
              onClick={() => setView('invoices')}
            >
              Invoices
            </button>
            <button
              className={`nav-link${view === 'content' ? ' active' : ''}`}
              onClick={() => setView('content')}
            >
              Content
            </button>
            <button
              className={`nav-link${view === 'growth' ? ' active' : ''}`}
              onClick={() => setView('growth')}
            >
              Growth
            </button>
          </nav>
        </div>
        <div className="header-actions">
          {view === 'hub' && (
            <button className="btn-brass" onClick={openNewClient}>
              + New client
            </button>
          )}
          {view === 'pipeline' && followUpCount > 0 && (
            <span className="followup-pill">
              <span className="dot" />
              {followUpCount} {followUpCount === 1 ? 'needs' : 'need'} a follow-up
            </span>
          )}
          <a className="icon-btn" href="/" title="View public site">
            View site
          </a>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Business details">
            Settings
          </button>
          {view === 'pipeline' && (
            <button className="btn-brass" onClick={openNewClient}>
              + New client
            </button>
          )}
          {view === 'invoices' && (
            <button className="btn-brass" onClick={openNewInvoice}>
              + New invoice
            </button>
          )}
        </div>
      </header>

      {view === 'hub' && (
        <HubView
          clients={clients}
          invoices={invoices}
          business={business}
          onNavigate={(v) => setView(v as View)}
          onEditClient={openEditClient}
          onNewClient={openNewClient}
          onNewInvoice={openNewInvoice}
        />
      )}
      {view === 'pipeline' && (
        <ClientBoard clients={clients} showThumbs={SHOW_THUMBS} onCardClick={openEditClient} />
      )}
      {view === 'invoices' && (
        <InvoicesView
          invoices={invoices}
          onNew={openNewInvoice}
          onEdit={openEditInvoice}
          onPreview={setPreviewInvoice}
        />
      )}
      {view === 'content' && <ContentView />}
      {view === 'growth' && (
        <GrowthHub
          clients={clients}
          onOpenClient={openEditClient}
          onLeadBooked={addClientFromLead}
          onBookingAdded={addClientFromBooking}
        />
      )}

      {showClientModal && (
        <ClientModal
          client={editingClient}
          signature={business.businessName || business.yourName || ''}
          onSave={handleSaveClient}
          onDelete={handleDeleteClient}
          onClose={() => setShowClientModal(false)}
        />
      )}

      {showInvoiceModal && (
        <InvoiceModal
          invoice={editingInvoice}
          clients={clients}
          profile={business}
          onSave={handleSaveInvoice}
          onDelete={handleDeleteInvoice}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}

      {previewInvoice && (
        <InvoicePreview
          invoice={previewInvoice}
          profile={business}
          onClose={() => setPreviewInvoice(null)}
        />
      )}

      {showSettings && (
        <SettingsModal
          profile={business}
          onSave={(p) => {
            setBusiness(p)
            setShowSettings(false)
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default App
