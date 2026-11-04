import { useState } from 'react'
import { portfolio } from '../portfolio/portfolioData'
import { formatMoney, parseMoney } from '../invoiceTypes'

const ADD_ONS = [
  { name: 'Extra hour', price: 50 },
  { name: 'Same-day preview (5 photos)', price: 30 },
  { name: '3–5 video clips', price: 100 },
  { name: 'Rush next-day delivery', price: 40 },
]

const DEPOSIT_RATE = 0.5

const TERMS = [
  'Your date is confirmed once the deposit is paid. The deposit is non-refundable.',
  'The remaining balance is due on or before delivery of your photos.',
  'Edited photos are delivered within 48 hours of the shoot.',
  'You can use the photos for your own socials and promotion, with credit to @cmkcaptures. Paid advertising needs agreeing first.',
  'CMK Captures keeps the rights to the photos and can use them in its portfolio and marketing.',
]

export default function QuoteBuilder() {
  const [clientName, setClientName] = useState('')
  const [packageName, setPackageName] = useState(portfolio.packages[0].name)
  const [price, setPrice] = useState(String(parseMoney(portfolio.packages[0].price)))
  const [addOns, setAddOns] = useState<string[]>([])
  const [includeTerms, setIncludeTerms] = useState(true)
  const [copied, setCopied] = useState(false)

  const pkg = portfolio.packages.find((p) => p.name === packageName)!
  const chosen = ADD_ONS.filter((a) => addOns.includes(a.name))
  const total = parseMoney(price) + chosen.reduce((sum, a) => sum + a.price, 0)
  const deposit = Math.round(total * DEPOSIT_RATE)

  const quote = [
    `Hi${clientName.trim() ? ` ${clientName.trim().split(/\s+/)[0]}` : ''}, here's your quote from ${portfolio.name}:`,
    '',
    `${pkg.name}: ${formatMoney(parseMoney(price))}`,
    ...pkg.features.map((f) => `• ${f}`),
    ...chosen.map((a) => `+ ${a.name}: ${formatMoney(a.price)}`),
    '',
    `Total: ${formatMoney(total)}`,
    `Deposit to lock in the date: ${formatMoney(deposit)}`,
    '',
    "Let me know and I'll get you booked in.",
    ...(includeTerms ? ['', 'Booking terms:', ...TERMS.map((t) => `• ${t}`)] : []),
  ].join('\n')

  function choosePackage(name: string) {
    setPackageName(name)
    const next = portfolio.packages.find((p) => p.name === name)!
    setPrice(String(parseMoney(next.price)))
  }

  function toggle(name: string) {
    setAddOns((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]))
  }

  function copy() {
    navigator.clipboard.writeText(quote).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="gr-main">
      <section className="gr-card">
        <div className="field">
          <label className="field-label">Client name</label>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Optional" />
        </div>
        <div className="field">
          <label className="field-label">Package</label>
          <select value={packageName} onChange={(e) => choosePackage(e.target.value)}>
            {portfolio.packages.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.price})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Price (£)</label>
          <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <span className="field-label">Add-ons</span>
        <div className="gr-actions">
          {ADD_ONS.map((a) => (
            <button
              key={a.name}
              type="button"
              className={addOns.includes(a.name) ? 'btn-brass' : 'gallery-btn'}
              onClick={() => toggle(a.name)}
              aria-pressed={addOns.includes(a.name)}
            >
              {a.name} +{formatMoney(a.price)}
            </button>
          ))}
        </div>
        <div className="checkbox-row gr-terms-toggle" onClick={() => setIncludeTerms(!includeTerms)}>
          <span className={`checkbox-box${includeTerms ? ' checked' : ''}`} />
          <span className="checkbox-label">Include booking terms</span>
        </div>
      </section>
      <aside className="gr-detail">
        <header>
          <h2>{formatMoney(total)}</h2>
          <span className="gr-star">Deposit {formatMoney(deposit)}</span>
        </header>
        <div className="gr-body">
          <p className="gr-message gr-quote">{quote}</p>
          <button className="btn-brass" onClick={copy}>
            {copied ? 'Copied!' : 'Copy quote'}
          </button>
        </div>
      </aside>
    </div>
  )
}
