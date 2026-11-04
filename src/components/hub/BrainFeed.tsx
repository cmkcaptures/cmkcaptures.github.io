import type { Insight } from '../../hubEngine'

interface Props {
  insights: Insight[]
  onAction?: (payload: { view: string; clientId?: string }) => void
}

export default function BrainFeed({ insights, onAction }: Props) {
  const hasUrgent = insights.some((i) => i.priority === 'urgent')

  if (insights.length === 0) {
    return (
      <div className="hub-widget hub-brain">
        <h3 className="hub-widget-title">
          <span className="hub-title-dot" />
          Intelligence feed
        </h3>
        <div className="hub-brain-empty">
          All systems clear. No action required.
        </div>
      </div>
    )
  }

  return (
    <div className={`hub-widget hub-brain${hasUrgent ? ' hub-brain--alert' : ''}`}>
      <h3 className="hub-widget-title">
        <span className="hub-title-dot" />
        Intelligence feed
        <span className="hub-brain-count">{insights.length}</span>
      </h3>
      <div className="hub-brain-list">
        {insights.map((insight) => (
          <div key={insight.id} className={`hub-insight hub-insight--${insight.priority}`}>
            <span className="hub-insight-icon">{insight.icon}</span>
            <div className="hub-insight-body">
              <p className="hub-insight-msg">{insight.message}</p>
              {insight.detail && <p className="hub-insight-detail">{insight.detail}</p>}
            </div>
            {insight.actionLabel && insight.actionPayload && onAction && (
              <button
                className="hub-insight-action"
                onClick={() => onAction(insight.actionPayload!)}
              >
                {insight.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
