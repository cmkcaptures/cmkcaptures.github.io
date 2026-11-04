import type { Client } from '../types'
import { STAGES } from '../types'
import ClientCard from './ClientCard'

interface Props {
  clients: Client[]
  showThumbs: boolean
  onCardClick: (client: Client) => void
}

export default function ClientBoard({ clients, showThumbs, onCardClick }: Props) {
  return (
    <div className="board-scroll">
      <div className="board">
        {STAGES.map((stage) => {
          const stageClients = clients.filter((c) => c.stage === stage.key)
          return (
            <div className="column" key={stage.key}>
              <div className="column-header">
                <span className="column-title">{stage.label}</span>
                <span className="column-count">{stageClients.length}</span>
                <span className="column-rule" />
              </div>
              {stageClients.length === 0 ? (
                <div className="column-empty">Nothing here yet</div>
              ) : (
                <div className="column-cards">
                  {stageClients.map((client) => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      showThumb={showThumbs && stage.key !== 'paid'}
                      onClick={() => onCardClick(client)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
