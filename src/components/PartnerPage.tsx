// A promoter's private page: every night you've shot for them, galleries, payment status, and a one-tap rebook.
import { useEffect, useState } from 'react'
import { portfolio } from '../portfolio/portfolioData'
import { photoUrl } from '../galleryApi'
import { supabase } from '../supabase'
import './Gallery.css'
import './Portal.css'

interface Night {
  title: string
  date: string
  stage: string
  paid: boolean
  deposit: boolean
  price: string
  gallery: string | null
  released: boolean
  cover: string | null
  photos: number
}

export default function PartnerPage({ token }: { token: string }) {
  const [data, setData] = useState<{ name: string; nights: Night[] } | null | undefined>(undefined)

  useEffect(() => {
    supabase
      ?.rpc('get_partner', { p_token: token })
      .then(({ data }) => setData((data as { name: string; nights: Night[] }) ?? null))
  }, [token])

  const nights = data?.nights ?? []
  const photos = nights.reduce((a, n) => a + (n.photos || 0), 0)
  const owing = nights.filter((n) => !n.paid && Number(String(n.price).replace(/[^0-9.]/g, '')) > 0)

  return (
    <div className="cg cp">
      <div className="cp-aurora" aria-hidden="true" />
      <header className="cp-head">
        <a className="cp-brand" href="/">
          <i />
          {portfolio.wordmark}
        </a>
        {data && (
          <h1>
            {data.name} × CMK
            <small>Your partner page: every night we've done together.</small>
          </h1>
        )}
      </header>

      {data === undefined && <p className="cg-msg">Loading…</p>}
      {data === null && <p className="cg-msg">This link isn't available.</p>}

      {data && (
        <main className="cp-main">
          <section className="cp-card pt-stats">
            <div>
              <b>{nights.length}</b>
              <span>nights shot</span>
            </div>
            <div>
              <b>{photos}</b>
              <span>photos delivered</span>
            </div>
            <div>
              <b>{owing.length}</b>
              <span>{owing.length === 1 ? 'invoice open' : 'invoices open'}</span>
            </div>
          </section>

          <section className="pt-grid">
            {nights.map((n, i) => (
              <article key={i} className="cp-card pt-night" style={{ animationDelay: `${i * 0.06}s` }}>
                <div className="pt-cover">{n.cover ? <img src={photoUrl(n.cover)} alt="" loading="lazy" /> : <span>{n.title}</span>}</div>
                <div className="pt-body">
                  <b>{n.title}</b>
                  <small>{n.date || 'Date tbc'}</small>
                  <div className="pt-tags">
                    <em className={n.paid ? 'ok' : n.deposit ? 'mid' : 'due'}>{n.paid ? 'Paid' : n.deposit ? 'Deposit paid' : n.price ? 'Payment due' : 'Booked'}</em>
                    {n.photos > 0 && <em>{n.photos} photos</em>}
                  </div>
                  {n.gallery && n.released && n.photos > 0 ? (
                    <a className="cp-btn" href={`/g/${n.gallery}`}>
                      Open gallery →
                    </a>
                  ) : (
                    <span className="pt-wait">{n.stage === 'booked' ? 'Coming up' : 'Gallery on its way'}</span>
                  )}
                </div>
              </article>
            ))}
            {!nights.length && <p className="cg-msg">Nothing here yet.</p>}
          </section>

          <section className="cp-cta-row">
            <a className="cp-card cp-cta pt-book" href="/#inquire">
              <b>Book me for your next night →</b>
              <span>Partners get first pick of dates. Same 48-hour gallery turnaround.</span>
            </a>
            <a className="cp-card cp-cta" href={portfolio.instagram} target="_blank" rel="noopener">
              <b>Tag {portfolio.instagramHandle}</b>
              <span>When you post the photos, tag me so I can share it too.</span>
            </a>
          </section>
        </main>
      )}
    </div>
  )
}
