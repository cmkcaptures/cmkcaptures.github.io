import { portfolio, GALLERY_GRADIENTS } from './portfolioData'
import BookingFlow from './BookingFlow'
import './Portfolio.css'

// Flip to true when pricing is locked in to show Packages to everyone.
const PACKAGES_PUBLIC = false

function isPreview() {
  const host = window.location.hostname
  const local = host === 'localhost' || host === '127.0.0.1'
  const hasFlag = new URLSearchParams(window.location.search).has('preview')
  return local || hasFlag
}

export default function Portfolio() {
  const showPackages = PACKAGES_PUBLIC || isPreview()

  function scrollToInquire() {
    document.getElementById('inquire')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="pf">
      {/* Nav */}
      <header className="pf-nav">
        <span className="pf-wordmark">{portfolio.wordmark}</span>
        <nav className="pf-nav-links">
          <a href="#work">Work</a>
          <a href="#about">About</a>
          {showPackages && <a href="#pricing">Pricing</a>}
          <button className="pf-nav-cta" onClick={scrollToInquire}>
            Book a shoot
          </button>
        </nav>
      </header>

      {/* Hero */}
      <section className="pf-hero">
        <div className="pf-hero-inner">
          <span className="pf-overline">{portfolio.location} · Photographer</span>
          <h1 className="pf-hero-title">{portfolio.tagline}</h1>
          <p className="pf-hero-sub">{portfolio.intro}</p>
          <div className="pf-hero-actions">
            <button className="pf-btn-brass" onClick={scrollToInquire}>
              Book a shoot
            </button>
            <a className="pf-btn-ghost" href="#work">
              See the work
            </a>
          </div>
        </div>
      </section>

      {/* Worked with */}
      <section className="pf-credibility">
        <span className="pf-cred-label">Worked with</span>
        <div className="pf-cred-names">
          {portfolio.workedWith.map((name) => (
            <span className="pf-cred-name" key={name}>{name}</span>
          ))}
        </div>
      </section>

      {/* Work gallery */}
      <section className="pf-section" id="work">
        <div className="pf-section-head">
          <span className="pf-overline">Selected work</span>
          <h2 className="pf-section-title">The gallery</h2>
        </div>
        <div className="pf-gallery">
          {portfolio.gallery.map((item, i) => (
            <figure key={i} className="pf-tile">
              {item.src ? (
                <img
                  className="pf-tile-img"
                  src={item.src}
                  alt={`${item.label} photography by ${portfolio.name}`}
                  loading="lazy"
                />
              ) : (
                <span
                  className="pf-tile-label"
                  style={{ backgroundImage: GALLERY_GRADIENTS[item.variant] }}
                >
                  {item.label}
                </span>
              )}
            </figure>
          ))}
        </div>
      </section>

      {/* About + services */}
      <section className="pf-section pf-about" id="about">
        <div className="pf-about-text">
          <span className="pf-overline">About</span>
          <h2 className="pf-section-title">{portfolio.name}</h2>
          <p>{portfolio.intro}</p>
        </div>
        <div className="pf-services">
          {portfolio.services.map((s) => (
            <div className="pf-service" key={s.title}>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Packages (preview-gated) */}
      {showPackages && (
        <section className="pf-section pf-packages" id="pricing">
          <div className="pf-section-head">
            <span className="pf-overline">What you get</span>
            <h2 className="pf-section-title">Packages</h2>
          </div>
          <div className="pf-packages-grid">
            {portfolio.packages.map((pkg) => (
              <div className={`pf-pkg${pkg.popular ? ' popular' : ''}`} key={pkg.name}>
                {pkg.popular && <span className="pf-pkg-ribbon">Most booked</span>}
                <h3 className="pf-pkg-name">{pkg.name}</h3>
                <p className="pf-pkg-best">{pkg.best}</p>
                <p className="pf-pkg-price">{pkg.price}</p>
                <ul className="pf-pkg-features">
                  {pkg.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <button className="pf-btn-brass pf-pkg-cta" onClick={scrollToInquire}>
                  Book this
                </button>
              </div>
            ))}
          </div>
          <p className="pf-packages-note">{portfolio.packagesNote}</p>
        </section>
      )}

      {/* Booking */}
      <section className="pf-section pf-inquire" id="inquire">
        <div className="pf-section-head">
          <span className="pf-overline">Get in touch</span>
          <h2 className="pf-section-title">Book a shoot</h2>
          <p className="pf-inquire-sub">
            Pick a date and time, tell me a little, and lock it in.
          </p>
        </div>
        <BookingFlow />
      </section>

      {/* Footer */}
      <footer className="pf-footer">
        <span className="pf-wordmark">{portfolio.wordmark}</span>
        <div className="pf-footer-links">
          <a href={portfolio.instagram} target="_blank" rel="noopener">
            {portfolio.instagramHandle}
          </a>
          <a href={`mailto:${portfolio.email}`}>{portfolio.email}</a>
        </div>
      </footer>
    </div>
  )
}
