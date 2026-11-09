import { useEffect, useState } from 'react'
import type { Client } from './types'
import { needsFollowUp, normalizeClient } from './types'
import type { Invoice, BusinessProfile } from './invoiceTypes'
import { loadClients, saveClients } from './storage'
import { loadInvoices, saveInvoices, loadBusiness, saveBusiness } from './invoiceStorage'
import ClientBoard from './components/ClientBoard'
import ClientModal from './components/ClientModal'
import InvoicesView from './components/InvoicesView'
import { buildInvoice } from './autoInvoice'
import type { AutoKind } from './autoInvoice'
import InvoiceModal from './components/InvoiceModal'
import InvoicePreview from './components/InvoicePreview'
import SettingsModal from './components/SettingsModal'
import BookingsInbox from './components/BookingsInbox'
import GrowthView from './components/GrowthView'
import PostsView from './studio/PostsView'
import ReviewsManager from './components/ReviewsManager'
import QuoteBuilder from './components/QuoteBuilder'
import HomeView from './studio/HomeView'
import Sandy from './studio/Sandy'
import { useSandyBrain } from './studio/sandyBrain'
import SandyPage from './studio/SandyPage'
import LiveShoot from './studio/LiveShoot'
import PriceIt from './studio/PriceIt'
import { askSandy } from './studio/sandyAI'
import type { ChatTurn } from './studio/sandyAI'
import { paymentStatus } from './types'
import type { SandyAnswer } from './studio/Sandy'
import { Section } from './studio/Sections'
import EventsList from './studio/EventsList'
import { generateInsights } from './hubEngine'
import type { Booking } from './components/BookingsInbox'
import type { Lead } from './growth'
import Portfolio from './portfolio/Portfolio'
import ClientGallery from './components/ClientGallery'
import StudioGate from './components/StudioGate'
import { useCloudSync } from './useCloudSync'
import ReviewPage from './components/ReviewPage'
import { listSentGalleries } from './galleryApi'
import './App.css'
import './StudioTheme.css'


type View = 'home' | 'sandy' | 'clients' | 'outreach' | 'posts' | 'money'

function App() {
  const galleryMatch = window.location.pathname.match(/^\/g\/([^/]+)/)
  if (galleryMatch) return <ClientGallery token={galleryMatch[1]} />
  if (window.location.pathname.startsWith('/review')) return <ReviewPage />
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
  const sync = useCloudSync(clients, invoices, business, setClients, setInvoices, setBusiness)

  const [view, setView] = useState<View>('home')

  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [showClientModal, setShowClientModal] = useState(false)

  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null)

  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!sync.ready) return
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
  }, [sync.ready])

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
  function moveClient(client: Client, stage: Client['stage']) {
    const changes: Partial<Client> = { stage, lastUpdated: new Date().toISOString() }
    if (stage === 'paid') Object.assign(changes, { fullyPaid: true, depositPaid: true })
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, ...changes } : c)))
  }
  function handleDeleteClient(id: string) {
    setClients((prev) => prev.filter((c) => c.id !== id))
    setShowClientModal(false)
  }

  // ---- Invoice handlers ----
  function autoInvoice(client: Client, kind: AutoKind) {
    const inv = buildInvoice(client, kind, business)
    setInvoices((prev) => [...prev, inv])
    setBusiness((b) => ({ ...b, nextInvoiceSeq: b.nextInvoiceSeq + 1 }))
    setPreviewInvoice(inv)
  }
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
  const nudges = useSandyBrain(clients)
  const [liveClient, setLiveClient] = useState<Client | null>(null)

  const insights = generateInsights(clients, invoices, business)
  const tips = insights.map((i) => i.message)
  const urgent = insights.some((i) => i.priority === 'urgent')
  const owing = clients.filter((c) => (c.stage === 'shot' || c.stage === 'delivered') && !c.fullyPaid)
  const sandyAnswers: SandyAnswer[] = [
    {
      match: /help|what can/i,
      reply: () => 'Try: "plan my week", "events", "what to post", "next shoot", "who owes", "deposits", "follow ups", or "new client".',
    },
    {
      match: /plan|week|quiet/i,
      reply: () => (nudges.length ? nudges.slice(0, 3).map((n) => n.title).join(' · ') : 'Your week looks sorted.'),
    },
    {
      match: /event|gig|party|club/i,
      reply: () => {
        const ev = nudges.find((n) => n.events?.length)?.events ?? []
        return ev.length ? `Worth a pitch: ${ev.map((e) => e.name).join(', ')}.` : 'Opening Events.'
      },
    },
    {
      match: /post|instagram|insta|ig\b/i,
      reply: () => {
        setView('posts')
        return nudges.find((n) => n.go === 'posts')?.title ?? 'Opening Posts.'
      },
    },
    {
      match: /next|upcoming|shoot/i,
      reply: () => {
        const next = clients.filter((c) => c.stage === 'booked')
        return next.length ? `Next up: ${next.map((c) => `${c.name}${c.shootDate ? ` (${c.shootDate})` : ''}`).slice(0, 3).join(', ')}.` : 'No shoots booked yet.'
      },
    },
    {
      match: /owe|unpaid|money/i,
      reply: () => (owing.length ? `Still to pay: ${owing.map((c) => `${c.name}${c.price ? ` ${c.price}` : ''}`).join(', ')}.` : 'Nobody owes you anything right now.'),
    },
    {
      match: /deposit/i,
      reply: () => {
        const due = clients.filter((c) => c.stage === 'booked' && !c.depositPaid)
        return due.length ? `Deposits due from: ${due.map((c) => c.name).join(', ')}.` : 'All deposits are in.'
      },
    },
    {
      match: /follow|lead/i,
      reply: () => {
        setView('outreach')
        return "Opening Outreach. Your follow-ups are at the top."
      },
    },
    {
      match: /to ?do|today|need/i,
      reply: () => (tips.length ? tips.slice(0, 3).join(' · ') : "You're all caught up."),
    },
    {
      match: /new client|add client/i,
      reply: () => {
        openNewClient()
        return 'Opened a new client for you.'
      },
    },
  ]

  function addClientQuick(name: string, shootDate: string, price: string, type: string) {
    setClients((prev) => [...prev, normalizeClient({ id: crypto.randomUUID(), name, shootDate, price, type, stage: 'inquiry' })])
  }

  function sandyAI(history: ChatTurn[]) {
    const now = new Date()
    const context = {
      today: now.toISOString().slice(0, 10),
      weekday: now.toLocaleDateString('en-GB', { weekday: 'long' }),
      screen: view,
      reply_style: 'This is the small floating chat bubble: answer in 1-2 short sentences.',
      clients: clients.map((c) => ({ name: c.name, stage: c.stage, type: c.type, shoot: c.shootDate, price: c.price, payment: paymentStatus(c) })),
      todo: nudges.map((n) => ({ level: n.level, title: n.title, detail: n.detail, events: n.events?.map((e) => `${e.name} at ${e.venue}, ${e.date}`) })),
    }
    return askSandy(history, context, { addClient: addClientQuick, go: setView })
  }

  const NAV: { key: View; label: string; icon: string; badge?: number }[] = [
    { key: 'home', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
    { key: 'sandy', label: 'Sandy', icon: 'M12 3a8 8 0 0 1 8 8v2a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6v-2a8 8 0 0 1 8-8zM9 11h.01M15 11h.01M9.5 15a3.5 3.5 0 0 0 5 0', badge: nudges.filter((n) => n.level === 'alert').length || undefined },
    { key: 'clients', label: 'Clients', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8', badge: followUpCount || undefined },
    { key: 'outreach', label: 'Outreach', icon: 'M22 2 11 13M22 2l-7 20-4-9-9-4z' },
    { key: 'posts', label: 'Posts', icon: 'M4 4h16v16H4zM4 15l5-5 4 4 3-3 4 4M15 8.5a1.5 1.5 0 1 0 0-.01' },
    { key: 'money', label: 'Money', icon: 'M3 6h18v12H3zM3 10h18M7 15h3' },
  ]

  return (
    <div className="app">
      <div className="st-aurora" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="st-grid" aria-hidden="true" />

      <nav className="st-nav" aria-label="Studio">
        <div className="st-logo">
          <img className="st-logo-mark" src="/favicon.svg" alt="" />
          PhotoFlow
        </div>
        {NAV.map((n) => (
          <button key={n.key} className={`st-nav-link${view === n.key ? ' on' : ''}`} onClick={() => setView(n.key)} aria-current={view === n.key ? 'page' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={n.icon} />
            </svg>
            {n.label}
            {n.badge && <span className="st-nav-badge">{n.badge}</span>}
          </button>
        ))}
        <div className="st-nav-foot">
          <a className="st-nav-link" href="/">
            View site
          </a>
          <button className="st-nav-link" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </nav>

      <main className="st-main">
        {sync.error && (
          <p className="sync-error" role="alert">
            Not syncing: changes are only saved on this device for now. ({sync.error})
          </p>
        )}

        {view === 'home' && (
          <HomeView
            clients={clients}
            tips={tips}
            greetingName={business.yourName.split(/\s+/)[0] || ''}
            onOpenClient={openEditClient}
            onNavigate={setView}
          />
        )}

        {view === 'sandy' && (
          <SandyPage
            clients={clients}
            nudges={nudges}
            answers={sandyAnswers}
            onGo={setView}
            onAddClient={(name, shootDate, price, type) =>
              setClients((prev) => [...prev, normalizeClient({ id: crypto.randomUUID(), name, shootDate, price, type, stage: 'inquiry' })])
            }
          />
        )}

        {view === 'clients' && (
          <Section
            title="Clients"
            subtitle="Everyone you're working with, from first message to paid."
            action={
              <button className="btn-brass" onClick={openNewClient}>
                + New client
              </button>
            }
            tabs={[
              { key: 'board', label: 'Pipeline', content: <ClientBoard clients={clients} onCardClick={openEditClient} onMove={moveClient} onLive={setLiveClient} /> },
              { key: 'bookings', label: 'Website bookings', content: <BookingsInbox onAdd={addClientFromBooking} /> },
              { key: 'reviews', label: 'Reviews', content: <ReviewsManager /> },
            ]}
          />
        )}

        {view === 'outreach' && (
          <Section
            title="Outreach"
            subtitle="Find people, message them, follow up."
            tabs={[
              { key: 'leads', label: 'Leads', content: <GrowthView onBooked={addClientFromLead} /> },
              { key: 'events', label: 'Events', content: <EventsList /> },
            ]}
          />
        )}

        {view === 'posts' && (
          <Section title="Posts" subtitle="What to post next, and when." tabs={[{ key: 'posts', label: 'Posts', content: <PostsView /> }]} />
        )}

        {view === 'money' && (
          <Section
            title="Money"
            subtitle="Quotes and invoices."
            tabs={[
              {
                key: 'invoices',
                label: 'Invoices',
                content: <InvoicesView invoices={invoices} onNew={openNewInvoice} onEdit={openEditInvoice} onPreview={setPreviewInvoice} clients={clients} onAuto={autoInvoice} />,
              },
              { key: 'price', label: 'Price it', content: <PriceIt clients={clients} /> },
              { key: 'quotes', label: 'Quotes', content: <QuoteBuilder /> },
            ]}
          />
        )}
      </main>

      {liveClient && <LiveShoot client={liveClient} onClose={() => setLiveClient(null)} />}
      {view !== 'sandy' && <Sandy tips={tips} urgent={urgent} answers={sandyAnswers} nudges={nudges} onGo={setView} ai={sandyAI} />}

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

      {previewInvoice && <InvoicePreview invoice={previewInvoice} profile={business} onClose={() => setPreviewInvoice(null)} />}

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
