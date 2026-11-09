// Sales assistant: paste any enquiry (DM, email, WhatsApp) and Sandy turns it into a priced reply, a client and a deposit invoice.
import { useState } from 'react'
import type { Client } from '../types'
import { formatMoney } from '../invoiceTypes'
import { clashesOn, quickPrice } from '../pricing'
import { sandyWrite } from './sandyWrite'
import Portal from './Portal'

interface Details {
  name: string
  handle: string
  type: string
  date: string
  hours: string
  venue: string
  notes: string
}

const EMPTY: Details = { name: '', handle: '', type: '', date: '', hours: '', venue: '', notes: '' }

function parseJson(text: string | null): Partial<Details> {
  if (!text) return {}
  const m = text.match(/\{[\s\S]*\}/)
  try {
    const o = JSON.parse(m ? m[0] : text) as Record<string, unknown>
    const s = (k: string) => (o[k] == null ? '' : String(o[k]))
    return { name: s('name'), handle: s('handle'), type: s('type'), date: s('date'), hours: s('hours'), venue: s('venue'), notes: s('notes') }
  } catch {
    return {}
  }
}

export default function EnquiryAssistant({
  clients,
  onApprove,
  onClose,
}: {
  clients: Client[]
  onApprove: (d: { name: string; contact: string; type: string; date: string; price: string; notes: string }, withInvoice: boolean) => void
  onClose: () => void
}) {
  const [raw, setRaw] = useState('')
  const [step, setStep] = useState<'paste' | 'reading' | 'review'>('paste')
  const [d, setD] = useState<Details>(EMPTY)
  const [price, setPrice] = useState('')
  const [reply, setReply] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const clash = clashesOn(d.date, clients)
  const quote = quickPrice(d.type, d.date, Number(d.hours) || null, clients)

  async function read() {
    setStep('reading')
    const today = new Date().toISOString().slice(0, 10)
    const out = await sandyWrite(
      `Pull the booking details out of this enquiry I received. Today is ${today}. Reply with ONLY a JSON object with keys: name (person or promoter/brand), handle (Instagram @ if any), type (e.g. Club night, Birthday, Portrait, Brand, Live set), date (YYYY-MM-DD, resolve words like "next Friday"; empty if unknown), hours (number of hours if stated or implied by times, else empty), venue, notes (anything else useful, short). Enquiry:\n"""${raw.slice(0, 2500)}"""`,
    )
    const p = { ...EMPTY, ...parseJson(out) }
    setD(p)
    setPrice(String(quickPrice(p.type, p.date, Number(p.hours) || null, clients).price))
    setStep('review')
    writeReply(p, String(quickPrice(p.type, p.date, Number(p.hours) || null, clients).price))
  }

  async function writeReply(det = d, p = price) {
    setReply(null)
    setCopied(false)
    const busy = clashesOn(det.date, clients)
    const amount = Number(p) || 0
    const text = await sandyWrite(
      `Write my reply to this enquiry, in the same channel style (casual for a DM, a little more polished for email). Enquiry: """${raw.slice(0, 1500)}""". ${busy.length ? `I'm already booked that date, so say so warmly and offer another date.` : 'I am free that date.'} Price: £${amount} with a 50% non-refundable deposit (£${amount / 2}) to lock the date, balance on delivery, gallery within 48 hours. Ask only for details that are missing (venue, start/finish times). Keep it short and confident. Sign as CMK Captures only if it reads like an email.`,
    )
    setReply(text ?? `Hey ${det.name.split(' ')[0] || 'there'}! ${busy.length ? "I'm booked that night unfortunately, but I'd love to do another date." : "I'm free that night."} It's £${amount} with a 50% deposit (£${amount / 2}) to lock it in, balance on delivery, and your gallery's back within 48 hours. Send me the venue and times and we're sorted.`)
  }

  function approve(withInvoice: boolean) {
    onApprove(
      {
        name: d.name || d.handle || 'New enquiry',
        contact: d.handle,
        type: d.type,
        date: d.date,
        price: price ? `£${price}` : '',
        notes: [d.venue && `Venue: ${d.venue}`, d.hours && `${d.hours}h`, d.notes, `Enquiry: ${raw.slice(0, 500)}`].filter(Boolean).join('\n'),
      },
      withInvoice,
    )
  }

  const field = (k: keyof Details, label: string, type = 'text') => (
    <label className="ea-field">
      <span>{label}</span>
      <input type={type} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  )

  return (
    <Portal>
      <div className="ps-drawer-wrap" onClick={step === 'reading' ? undefined : onClose}>
        <aside className="ps-drawer ea" onClick={(e) => e.stopPropagation()} aria-label="Enquiry assistant">
          <header>
            <h2>✦ New enquiry</h2>
            <button className="st-ghost" onClick={onClose}>
              Close
            </button>
          </header>

          {step === 'paste' && (
            <>
              <p className="ps-hint">Paste the DM, email or WhatsApp message. Sandy pulls out the details, checks your calendar, prices it and writes your reply.</p>
              <textarea className="ev-draft" rows={9} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'e.g. "yo bro we got a birthday at Lightbox next Friday 10pm-3am, how much for pics?"'} autoFocus />
              <button className="btn-brass" disabled={raw.trim().length < 8} onClick={read}>
                ✦ Read it
              </button>
            </>
          )}

          {step === 'reading' && (
            <div className="ap-working">
              <div className="ap-orb" />
              <p>Reading the enquiry…</p>
            </div>
          )}

          {step === 'review' && (
            <>
              <div className="ea-grid">
                {field('name', 'Who')}
                {field('handle', 'Handle / contact')}
                {field('type', 'Type of shoot')}
                {field('date', 'Date', 'date')}
                {field('hours', 'Hours')}
                {field('venue', 'Venue')}
              </div>
              <div className="bk-sandy">
                <span className={`bk-chip ${clash.length ? 'clash' : 'free'}`}>{d.date ? (clash.length ? `Clash: ${clash.join(', ')}` : "✓ You're free") : 'No date yet'}</span>
                <span className="bk-chip price" title={quote.why}>
                  Suggested {formatMoney(quote.price)}
                </span>
              </div>
              <label className="ea-field ea-price">
                <span>Your price (£)</span>
                <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} />
                <em>Deposit {formatMoney((Number(price) || 0) / 2)}</em>
              </label>

              <h3 className="ps-label">Your reply</h3>
              {reply === null ? <p className="st-empty st-loading">Sandy is writing it…</p> : <textarea className="ev-draft" rows={7} value={reply} onChange={(e) => setReply(e.target.value)} />}
              <div className="ps-footer">
                <button className="st-ghost" disabled={!reply} onClick={() => reply && navigator.clipboard.writeText(reply).then(() => setCopied(true))}>
                  {copied ? 'Copied!' : 'Copy reply'}
                </button>
                <button className="st-ghost" disabled={reply === null} onClick={() => writeReply()}>
                  ↻ Rewrite
                </button>
              </div>

              <div className="ea-approve">
                <button className="btn-brass" onClick={() => approve(true)} disabled={!Number(price)}>
                  Approve: add client + deposit invoice
                </button>
                <button className="st-ghost" onClick={() => approve(false)}>
                  Just add as a client
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </Portal>
  )
}
