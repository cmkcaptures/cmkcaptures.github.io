// The client's private link: a live portal for their shoot (progress, payment, gallery, review, rebook).
import { useEffect, useState } from 'react'
import { portfolio } from '../portfolio/portfolioData'
import type { PublicGallery } from '../galleryApi'
import { fetchPublicGallery, photoUrl, toggleFavourite } from '../galleryApi'
import { supabase } from '../supabase'
import './Gallery.css'
import './Portal.css'

interface PortalInfo {
  client: { name: string; type: string; shootDate: string; stage: string; price: string; depositPaid: boolean; fullyPaid: boolean } | null
  payment: string
  photoCount: number
}

const STEPS = [
  { key: 'booked', label: 'Booked', note: 'Your date is locked in.' },
  { key: 'shot', label: 'Shot', note: "Shoot done. I'm editing your photos now." },
  { key: 'delivered', label: 'Gallery ready', note: 'Your photos are below. Download your favourites.' },
  { key: 'paid', label: 'All done', note: 'Thank you! Hope to shoot with you again.' },
]

function money(text: string): number {
  return Number(String(text).replace(/[^0-9.]/g, '')) || 0
}

export default function ClientGallery({ token }: { token: string }) {
  const [gallery, setGallery] = useState<PublicGallery | null>(null)
  const [info, setInfo] = useState<PortalInfo | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [open, setOpen] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchPublicGallery(token)
      .then((g) => {
        setGallery(g)
        setStatus(g ? 'ready' : 'missing')
      })
      .catch(() => setStatus('missing'))
    supabase
      ?.rpc('get_portal', { p_token: token })
      .then(({ data }) => setInfo((data as PortalInfo) ?? null))
  }, [token])

  function heart(path: string) {
    setGallery((g) => g && { ...g, photos: g.photos.map((p) => (p.path === path ? { ...p, favourite: !p.favourite } : p)) })
    toggleFavourite(token, path)
      .then((on) => setGallery((g) => g && { ...g, photos: g.photos.map((p) => (p.path === path ? { ...p, favourite: on } : p)) }))
      .catch(() => {})
  }

  const client = info?.client
  const hasPhotos = !!gallery && !gallery.locked && gallery.photos.length > 0
  let stepIndex = Math.max(0, STEPS.findIndex((s) => s.key === client?.stage))
  if (hasPhotos && stepIndex < 2) stepIndex = 2
  if (client?.fullyPaid) stepIndex = 3
  const step = STEPS[stepIndex]
  const total = money(client?.price ?? '')
  const due = client ? (client.fullyPaid ? 0 : client.depositPaid ? total / 2 : total / 2) : 0
  const dueLabel = client && !client.fullyPaid && total > 0 ? (client.depositPaid ? 'Balance due on delivery' : '50% deposit to lock your date') : ''
  const favCount = gallery?.photos.filter((p) => p.favourite).length ?? 0
  const photos = gallery?.photos ?? []

  return (
    <div className="cg cp">
      <div className="cp-aurora" aria-hidden="true" />
      <header className="cp-head">
        <a className="cp-brand" href="/">
          <i />
          {portfolio.wordmark}
        </a>
        {status === 'ready' && (
          <h1>
            {client?.name ? `Hey ${client.name}` : gallery?.title || 'Your shoot'}
            <small>
              {[client?.type, client?.shootDate].filter(Boolean).join(' · ') || gallery?.title}
            </small>
          </h1>
        )}
      </header>

      {status === 'loading' && <p className="cg-msg">Loading your shoot…</p>}
      {status === 'missing' && <p className="cg-msg">This link isn't available.</p>}

      {status === 'ready' && (
        <main className="cp-main">
          <section className="cp-card cp-progress">
            <div className="cp-steps">
              {STEPS.map((s, i) => (
                <div key={s.key} className={`cp-step${i < stepIndex ? ' done' : ''}${i === stepIndex ? ' now' : ''}`}>
                  <i>{i < stepIndex ? '✓' : i + 1}</i>
                  <span>{s.label}</span>
                </div>
              ))}
              <span className="cp-bar" style={{ width: `calc(${(stepIndex / (STEPS.length - 1)) * 100}% * 0.75)` }} />
            </div>
            <p className="cp-note">{gallery?.locked && gallery.release_at ? `Your photos unlock on ${new Date(gallery.release_at).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}.` : step.note}</p>
          </section>

          {dueLabel && due > 0 && (
            <section className="cp-card cp-pay">
              <div>
                <span className="cp-over">{dueLabel}</span>
                <b>£{due.toLocaleString('en-GB', { maximumFractionDigits: 2 })}</b>
              </div>
              {info?.payment ? (
                <>
                  <p className="cp-pay-how">{info.payment}</p>
                  <button
                    className="cp-btn ghost"
                    onClick={() =>
                      navigator.clipboard.writeText(info.payment).then(() => {
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1600)
                      })
                    }
                  >
                    {copied ? 'Copied!' : 'Copy payment details'}
                  </button>
                </>
              ) : (
                <p className="cp-pay-how">Payment details are on your invoice. Any questions, just message me.</p>
              )}
            </section>
          )}

          {hasPhotos && (
            <section className="cp-gallery">
              <div className="cp-gallery-head">
                <h2>Your photos</h2>
                <p>Tap ♥ on your favourites{favCount ? ` · ${favCount} picked` : ''}. Tap a photo to view it big.</p>
              </div>
              <div className="cg-grid">
                {photos.map((p, i) => (
                  <figure key={p.path} style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
                    <img src={photoUrl(p.path)} alt={p.filename} loading="lazy" onClick={() => setOpen(i)} />
                    <div className="cg-actions">
                      <button className={`cg-heart${p.favourite ? ' on' : ''}`} onClick={() => heart(p.path)} aria-pressed={!!p.favourite} aria-label="Favourite">
                        ♥
                      </button>
                      <a href={photoUrl(p.path, p.filename)}>Download</a>
                    </div>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="cp-cta-row">
            {stepIndex >= 2 && (
              <a className="cp-card cp-cta" href="/review">
                <b>★ Leave a review</b>
                <span>Takes 30 seconds and really helps me out.</span>
              </a>
            )}
            <a className="cp-card cp-cta" href={portfolio.instagram} target="_blank" rel="noopener">
              <b>Tag me {portfolio.instagramHandle}</b>
              <span>Posting a pic? Tag me so I can share it.</span>
            </a>
            <a className="cp-card cp-cta" href="/#inquire">
              <b>Book again →</b>
              <span>Got another night coming up? Lock it in.</span>
            </a>
          </section>
        </main>
      )}

      {open !== null && photos[open] && (
        <div className="pf-lightbox cp-lightbox" onClick={() => setOpen(null)} role="dialog" aria-label="Photo">
          <img src={photoUrl(photos[open].path)} alt="" onClick={(e) => e.stopPropagation()} />
          <button className="pf-lb-nav prev" onClick={(e) => (e.stopPropagation(), setOpen((open - 1 + photos.length) % photos.length))} aria-label="Previous">
            ‹
          </button>
          <button className="pf-lb-nav next" onClick={(e) => (e.stopPropagation(), setOpen((open + 1) % photos.length))} aria-label="Next">
            ›
          </button>
          <button className="pf-lb-close" onClick={() => setOpen(null)} aria-label="Close">
            ×
          </button>
        </div>
      )}
    </div>
  )
}
