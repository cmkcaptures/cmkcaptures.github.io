import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

interface Review {
  id: string
  name: string
  body: string
  approved: boolean
}

const REVIEW_LINK = 'https://cmkcaptures.github.io/review'

export default function ReviewsManager() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      ?.from('reviews')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setReviews(data as Review[])
      })
  }, [])

  async function setApproved(review: Review, approved: boolean) {
    if (!supabase) return
    const { error: failed } = await supabase.from('reviews').update({ approved }).eq('id', review.id)
    if (failed) setError(failed.message)
    else setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, approved } : r)))
  }

  async function remove(id: string) {
    if (!supabase) return
    const { error: failed } = await supabase.from('reviews').delete().eq('id', id)
    if (failed) setError(failed.message)
    else setReviews((prev) => prev.filter((r) => r.id !== id))
  }

  function copy() {
    navigator.clipboard.writeText(REVIEW_LINK).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <div className="gr-card">
        <p className="gr-card-meta">Send clients this link after a shoot: {REVIEW_LINK}</p>
        <button className="btn-brass" onClick={copy}>{copied ? 'Copied!' : 'Copy review link'}</button>
      </div>
      {reviews.length === 0 && <p className="gr-empty">No reviews yet.</p>}
      {reviews.map((r) => (
        <article className="gr-card" key={r.id}>
          <header>
            <h3>{r.name}</h3>
            <span className={`gr-badge${r.approved ? ' due' : ''}`}>{r.approved ? 'On your site' : 'Waiting'}</span>
          </header>
          <p className="gr-message">{r.body}</p>
          <div className="gr-actions">
            <button className={r.approved ? 'gallery-btn' : 'btn-brass'} onClick={() => setApproved(r, !r.approved)}>
              {r.approved ? 'Hide from site' : 'Approve'}
            </button>
            <button className="gallery-btn" onClick={() => remove(r.id)}>Delete</button>
          </div>
        </article>
      ))}
    </div>
  )
}
