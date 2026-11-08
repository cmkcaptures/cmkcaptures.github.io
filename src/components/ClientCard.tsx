import type { Client, Stage } from '../types'
import { STAGES, needsFollowUp, daysSince, paymentStatus, thumbGradient, initials } from '../types'

interface Props {
  client: Client
  onClick: () => void
  onAdvance: (stage: Stage) => void
}

function priceLabel(price: string): string {
  const n = parseInt(price.replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? '£' + n.toLocaleString('en-GB') : 'No price'
}

export default function ClientCard({ client, onClick, onAdvance }: Props) {
  const flagged = needsFollowUp(client)
  const status = paymentStatus(client)
  const meta = [client.type, client.shootDate].filter(Boolean).join(' · ') || 'No date yet'
  const days = daysSince(client.lastUpdated)
  const index = STAGES.findIndex((s) => s.key === client.stage)
  const next = STAGES[index + 1]

  return (
    <div className={`cc${flagged ? ' flagged' : ''}`}>
      <button className="cc-main" onClick={onClick}>
        <span className="cc-avatar" style={{ background: thumbGradient(client.id) }}>
          {initials(client.name)}
        </span>
        <span className="cc-text">
          <b>{client.name}</b>
          <small>{meta}</small>
        </span>
        <span className={`cc-pay pay-${status}`}>{status === 'paid' ? 'Paid' : status === 'deposit' ? 'Deposit' : 'Unpaid'}</span>
      </button>

      <div className="cc-track" aria-label={`Stage ${index + 1} of ${STAGES.length}`}>
        {STAGES.map((s, i) => (
          <i key={s.key} className={i <= index ? 'on' : ''} />
        ))}
      </div>

      <div className="cc-foot">
        <span className="cc-price">{priceLabel(client.price)}</span>
        {flagged && <span className="cc-flag">Follow up · {days}d</span>}
        {client.galleryUrl && (
          <a className="cc-link" href={client.galleryUrl} target="_blank" rel="noreferrer">
            Gallery ↗
          </a>
        )}
        {next && (
          <button className="cc-next" onClick={() => onAdvance(next.key)} title={`Move to ${next.label}`}>
            {next.label} →
          </button>
        )}
      </div>
    </div>
  )
}
