import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../supabase'
import { portfolio } from '../portfolio/portfolioData'
import './Gallery.css'
import './Portal.css'

export default function ReviewPage() {
  const [name, setName] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase || !name.trim() || !body.trim()) return
    setError('')
    const { error: failed } = await supabase.from('reviews').insert({ name: name.trim(), body: body.trim() })
    if (failed) setError('That did not send. Please try again.')
    else setSent(true)
  }

  return (
    <div className="cg gate-public">
      <form className="gate-form review-form" onSubmit={submit}>
        <span className="cg-brand">{portfolio.wordmark}</span>
        {sent ? (
          <p className="cg-msg">Thank you! Your review means a lot.</p>
        ) : (
          <>
            <h1>How was your shoot?</h1>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={80} required />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="A sentence or two about your experience" maxLength={600} rows={5} required />
            <button className="pf-review-submit" type="submit">Send review</button>
            <p className="review-note">Your name and review may appear on the website.</p>
            {error && <p className="gm-error">{error}</p>}
          </>
        )}
      </form>
    </div>
  )
}
