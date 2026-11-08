import { useState } from 'react'
import type { ReactNode } from 'react'

export function Section({
  title,
  subtitle,
  action,
  tabs,
}: {
  title: string
  subtitle: string
  action?: ReactNode
  tabs: { key: string; label: string; content: ReactNode }[]
}) {
  const [active, setActive] = useState(tabs[0].key)
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  return (
    <div className="st-section">
      <header className="st-top">
        <div>
          <h1>{title}</h1>
          <p className="st-sub">{subtitle}</p>
        </div>
        {action}
      </header>
      {tabs.length > 1 && (
        <div className="st-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === current.key}
              className={t.key === current.key ? 'on' : ''}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="st-section-body" key={current.key}>
        {current.content}
      </div>
    </div>
  )
}
