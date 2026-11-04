import type { Client } from '../../types'

interface Props {
  clients: Client[]
  onEditClient: (client: Client) => void
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.ceil((target - now.getTime()) / (1000 * 60 * 60 * 24))
}

function relativeLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}

export default function UpcomingShoots({ clients, onEditClient }: Props) {
  const upcoming = clients
    .filter((c) => c.stage === 'booked' && c.shootDate)
    .map((c) => ({ client: c, days: daysUntil(c.shootDate) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)

  return (
    <div className="hub-widget">
      <h3 className="hub-widget-title">Upcoming shoots</h3>
      {upcoming.length === 0 ? (
        <p className="hub-empty">No upcoming shoots</p>
      ) : (
        <div className="hub-shoot-list">
          {upcoming.map(({ client: c, days }) => (
            <button key={c.id} className="hub-shoot-row" onClick={() => onEditClient(c)}>
              <div className="hub-shoot-info">
                <span className="hub-shoot-name">{c.name}</span>
                <span className="hub-shoot-type">{c.type || 'Shoot'}</span>
              </div>
              <span className={`hub-shoot-when${days <= 1 ? ' hub-shoot-soon' : ''}`}>
                {relativeLabel(days)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
