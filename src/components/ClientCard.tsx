import type { Client } from '../types'
import { needsFollowUp, daysSince, paymentStatus, thumbGradient, initials } from '../types'

interface Props {
  client: Client
  showThumb: boolean
  onClick: () => void
}

function priceLabel(price: string): string {
  const n = parseInt(price.replace(/[^0-9]/g, ''), 10)
  return '£' + (Number.isFinite(n) ? n : 0).toLocaleString('en-GB')
}

export default function ClientCard({ client, showThumb, onClick }: Props) {
  const flagged = needsFollowUp(client)
  const status = paymentStatus(client)
  const meta = [client.type, client.shootDate].filter(Boolean).join(' · ') || '—'
  const days = daysSince(client.lastUpdated)

  const classes = ['client-card']
  if (flagged) classes.push('flagged')
  if (client.stage === 'paid') classes.push('paid')

  return (
    <button className={classes.join(' ')} onClick={onClick}>
      {showThumb && (
        <div className="card-thumb" style={{ background: thumbGradient(client.id) }}>
          <span className="thumb-initials">{initials(client.name)}</span>
        </div>
      )}
      <div className="card-body">
        {flagged && (
          <div className="flag-pill-row">
            <span className="flag-pill">
              Follow up · {days} {days === 1 ? 'day' : 'days'}
            </span>
          </div>
        )}
        <div className="card-name">{client.name}</div>
        <div className="card-meta">{meta}</div>
        {client.galleryUrl && (
          <span
            className="card-gallery"
            onClick={(e) => {
              e.stopPropagation()
              window.open(client.galleryUrl, '_blank', 'noopener')
            }}
          >
            {client.galleryDeliveredAt ? 'Gallery delivered' : 'Gallery ready'} ↗
          </span>
        )}
        <div className="card-footer">
          <span className="card-price">{priceLabel(client.price)}</span>
          {status === 'paid' && <span className="pay-paid">PAID</span>}
          {status === 'deposit' && (
            <span className="pay-status pay-deposit">
              <span className="pay-dot" />
              DEPOSIT
            </span>
          )}
          {status === 'unpaid' && (
            <span className={`pay-status pay-unpaid${flagged ? ' alert' : ''}`}>
              <span className="pay-dot" />
              UNPAID
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
