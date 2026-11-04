import type { Client } from '../../types'
import { STAGES } from '../../types'

interface Props {
  clients: Client[]
  onEditClient: (client: Client) => void
}

export default function ClientInsights({ clients, onEditClient }: Props) {
  const active = clients.filter((c) => c.stage !== 'paid')
  const owes = clients.filter(
    (c) => (c.stage === 'delivered' || c.stage === 'shot') && !c.fullyPaid && c.price,
  )

  const stageCounts = STAGES.map((s) => ({
    label: s.label,
    count: clients.filter((c) => c.stage === s.key).length,
  }))

  return (
    <div className="hub-widget">
      <h3 className="hub-widget-title">Clients</h3>
      <div className="hub-client-big">{active.length}</div>
      <p className="hub-revenue-label">active clients</p>

      <div className="hub-stage-row">
        {stageCounts.map((s) => (
          <div className="hub-stage-chip" key={s.label}>
            <span className="hub-stage-count">{s.count}</span>
            <span className="hub-stage-label">{s.label}</span>
          </div>
        ))}
      </div>

      {owes.length > 0 && (
        <div className="hub-owes">
          <p className="hub-owes-title">Awaiting payment</p>
          {owes.map((c) => (
            <button key={c.id} className="hub-owes-row" onClick={() => onEditClient(c)}>
              <span>{c.name}</span>
              <span className="hub-owes-price">{c.price}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
