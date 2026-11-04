interface Props {
  onNewClient: () => void
  onNewInvoice: () => void
  onNavigate: (view: string) => void
}

export default function QuickActions({ onNewClient, onNewInvoice, onNavigate }: Props) {
  return (
    <div className="hub-widget hub-quick">
      <h3 className="hub-widget-title">Quick actions</h3>
      <div className="hub-quick-grid">
        <button className="hub-quick-btn" onClick={onNewClient}>
          <span className="hub-quick-icon">+</span>
          Add client
        </button>
        <button className="hub-quick-btn" onClick={onNewInvoice}>
          <span className="hub-quick-icon">£</span>
          New invoice
        </button>
        <button className="hub-quick-btn" onClick={() => onNavigate('pipeline')}>
          <span className="hub-quick-icon">◉</span>
          Pipeline
        </button>
        <button className="hub-quick-btn" onClick={() => onNavigate('invoices')}>
          <span className="hub-quick-icon">◎</span>
          Invoices
        </button>
      </div>
    </div>
  )
}
