import { useEffect, useRef, useState } from 'react'
import { portfolio } from './portfolioData'
import { supabase } from '../supabase'
import BookingFlow from './BookingFlow'
import './Portfolio.css'

// Flip to true when pricing is locked in to show Packages to everyone.
const PACKAGES_PUBLIC = false

function isPreview() {
  const host = window.location.hostname
  const local = host === 'localhost' || host === '127.0.0.1'
  return local || new URLSearchParams(window.location.search).has('preview')
}

const PROMISES = [
  { big: '48h', small: 'Gallery delivered' },
  { big: '50%', small: 'Deposit locks your date' },
  { big: 'LDN', small: 'Clubs, events, artists' },
]

/** Fades sections in as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.pf-reveal')
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

export default function Portfolio() {
  const showPackages = PACKAGES_PUBLIC || isPreview()
  const [reviews, setReviews] = useState<{ id: string; name: string; body: string }[]>([])
  const [slide, setSlide] = useState(0)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [review, setReview] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const heroRef = useRef<HTMLElement>(null)
  const photos = portfolio.gallery.filter((g) => g.src)
  useReveal()

  useEffect(() => {
    supabase
      ?.from('reviews')
      .select('id,name,body')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setReviews(data ?? []))
  }, [])

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % photos.length), 5000)
    return () => clearInterval(id)
  }, [photos.length])

  useEffect(() => {
    if (reviews.length < 2) return
    const id = setInterval(() => setReview((r) => (r + 1) % reviews.length), 6000)
    return () => clearInterval(id)
  }, [reviews.length])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (lightbox === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight') setLightbox((i) => (i! + 1) % photos.length)
      if (e.key === 'ArrowLeft') setLightbox((i) => (i! - 1 + photos.length) % photos.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photos.length])

  function toBooking() {
    document.getElementById('inquire')?.scrollIntoView({ behavior: 'smooth' })
  }

  function tilt(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }

  return (
    <div className="pf">
      <div className="pf-aurora" aria-hidden="true" />

      <header className={`pf-nav${scrolled ? ' solid' : ''}`}>
        <a className="pf-wordmark" href="#top">
          <i />
          {portfolio.wordmark}
        </a>
        <nav className="pf-nav-links">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          {showPackages && <a href="#pricing">Pricing</a>}
          {reviews.length > 0 && <a href="#reviews">Reviews</a>}
          <button className="pf-cta" onClick={toBooking}>
            Book a shoot
          </button>
        </nav>
      </header>

      <section className="pf-hero" id="top" ref={heroRef}>
        <div className="pf-hero-bg" aria-hidden="true">
          {photos.map((p, i) => (
            <img key={p.src} src={p.src} alt="" className={i === slide ? 'on' : ''} />
          ))}
        </div>
        <div className="pf-hero-inner">
          <span className="pf-chip">
            <i /> {portfolio.location} · Booking now
          </span>
          <h1>
            {portfolio.tagline.split(' ').map((w, i) => (
              <span key={i} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
                {w}
              </span>
            ))}
          </h1>
          <p>{portfolio.intro}</p>
          <div className="pf-hero-actions">
            <button className="pf-cta big" onClick={toBooking}>
              Book a shoot →
            </button>
            <a className="pf-ghost" href="#work">
              See the work
            </a>
          </div>
        </div>
        <div className="pf-hero-dots">
          {photos.map((p, i) => (
            <button key={p.src} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} aria-label={`Show photo ${i + 1}`} />
          ))}
        </div>
      </section>

      <section className="pf-marquee" aria-label="Worked with">
        <span className="pf-marquee-label">Worked with</span>
        <div className="pf-marquee-track">
          {[...portfolio.workedWith, ...portfolio.workedWith, ...portfolio.workedWith, ...portfolio.workedWith].map((n, i) => (
            <span key={i}>
              {n} <i>✦</i>
            </span>
          ))}
        </div>
      </section>

      <section className="pf-promises pf-reveal">
        {PROMISES.map((p) => (
          <div key={p.big} className="pf-promise" onMouseMove={tilt}>
            <b>{p.big}</b>
            <span>{p.small}</span>
          </div>
        ))}
      </section>

      <section className="pf-section" id="work">
        <div className="pf-head pf-reveal">
          <span className="pf-over">Selected work</span>
          <h2>Nights worth remembering</h2>
        </div>
        <div className="pf-bento">
          {photos.map((item, i) => (
            <button
              key={item.src}
              className={`pf-tile pf-reveal${item.wide ? ' wide' : ''}${i % 5 === 0 ? ' big' : ''}`}
              style={{ transitionDelay: `${(i % 4) * 0.06}s` }}
              onClick={() => setLightbox(i)}
              aria-label={`Open ${item.label} photo`}
            >
              <img src={item.src} alt={`${item.label} photography by ${portfolio.name}`} loading="lazy" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="pf-section pf-about" id="about">
        <div className="pf-about-text pf-reveal">
          <span className="pf-over">About</span>
          <h2>{portfolio.name}</h2>
          <p>{portfolio.intro}</p>
          <a className="pf-ig" href={portfolio.instagram} target="_blank" rel="noopener">
            Follow {portfolio.instagramHandle} ↗
          </a>
        </div>
        <div className="pf-services">
          {portfolio.services.map((s, i) => (
            <div key={s.title} className="pf-service pf-reveal" onMouseMove={tilt} style={{ transitionDelay: `${i * 0.08}s` }}>
              <span className="pf-service-num">0{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {showPackages && (
        <section className="pf-section" id="pricing">
          <div className="pf-head pf-reveal">
            <span className="pf-over">What you get</span>
            <h2>Packages</h2>
          </div>
          <div className="pf-packages">
            {portfolio.packages.map((pkg) => (
              <div className={`pf-pkg pf-reveal${pkg.popular ? ' popular' : ''}`} key={pkg.name} onMouseMove={tilt}>
                {pkg.popular && <span className="pf-pkg-ribbon">Most booked</span>}
                <h3>{pkg.name}</h3>
                <p className="pf-pkg-best">{pkg.best}</p>
                <p className="pf-pkg-price">{pkg.price}</p>
                <ul>
                  {pkg.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button className="pf-cta" onClick={toBooking}>
                  Book this
                </button>
              </div>
            ))}
          </div>
          <p className="pf-note">{portfolio.packagesNote}</p>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="pf-section" id="reviews">
          <div className="pf-head pf-reveal">
            <span className="pf-over">Kind words</span>
            <h2>What clients say</h2>
          </div>
          <div className="pf-quote pf-reveal">
            <blockquote key={reviews[review % reviews.length].id}>
              <p>“{reviews[review % reviews.length].body}”</p>
              <cite>{reviews[review % reviews.length].name}</cite>
            </blockquote>
            {reviews.length > 1 && (
              <div className="pf-quote-dots">
                {reviews.map((r, i) => (
                  <button key={r.id} className={i === review % reviews.length ? 'on' : ''} onClick={() => setReview(i)} aria-label={`Review ${i + 1}`} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="pf-section pf-inquire" id="inquire">
        <div className="pf-head pf-reveal">
          <span className="pf-over">Get in touch</span>
          <h2>Book a shoot</h2>
          <p className="pf-sub">Pick a date, tell me about the night, and I'll get back to you fast.</p>
        </div>
        <div className="pf-booking pf-reveal">
          <BookingFlow />
        </div>
      </section>

      <footer className="pf-footer">
        <span className="pf-wordmark">
          <i />
          {portfolio.wordmark}
        </span>
        <div className="pf-footer-links">
          <a href={portfolio.instagram} target="_blank" rel="noopener">
            {portfolio.instagramHandle}
          </a>
          <a href={`mailto:${portfolio.email}`}>{portfolio.email}</a>
        </div>
      </footer>

      <button className={`pf-float${scrolled ? ' show' : ''}`} onClick={toBooking}>
        Book a shoot
      </button>

      {lightbox !== null && (
        <div className="pf-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo">
          <img key={lightbox} src={photos[lightbox].src} alt={photos[lightbox].label} onClick={(e) => e.stopPropagation()} />
          <button
            className="pf-lb-nav prev"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox((lightbox - 1 + photos.length) % photos.length)
            }}
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            className="pf-lb-nav next"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox((lightbox + 1) % photos.length)
            }}
            aria-label="Next"
          >
            ›
          </button>
          <button className="pf-lb-close" onClick={() => setLightbox(null)} aria-label="Close">
            ×
          </button>
          <span className="pf-lb-count">
            {lightbox + 1} / {photos.length}
          </span>
        </div>
      )}
    </div>
  )
}
