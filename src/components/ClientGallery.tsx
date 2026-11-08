import { useEffect, useState } from 'react'
import { portfolio } from '../portfolio/portfolioData'
import type { PublicGallery } from '../galleryApi'
import { fetchPublicGallery, photoUrl, toggleFavourite } from '../galleryApi'
import './Gallery.css'

export default function ClientGallery({ token }: { token: string }) {
  const [gallery, setGallery] = useState<PublicGallery | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')

  useEffect(() => {
    fetchPublicGallery(token)
      .then((g) => {
        setGallery(g)
        setStatus(g ? 'ready' : 'missing')
      })
      .catch(() => setStatus('missing'))
  }, [token])

  function heart(path: string) {
    setGallery((g) => g && { ...g, photos: g.photos.map((p) => (p.path === path ? { ...p, favourite: !p.favourite } : p)) })
    toggleFavourite(token, path).then((on) =>
      setGallery((g) => g && { ...g, photos: g.photos.map((p) => (p.path === path ? { ...p, favourite: on } : p)) }),
    ).catch(() => {})
  }

  const favCount = gallery?.photos.filter((p) => p.favourite).length ?? 0

  return (
    <div className="cg">
      <header className="cg-head">
        <span className="cg-brand">{portfolio.wordmark}</span>
        {gallery && <h1>{gallery.title}</h1>}
      </header>
      {status === 'loading' && <p className="cg-msg">Loading your gallery…</p>}
      {status === 'missing' && <p className="cg-msg">This gallery link isn't available.</p>}
      {gallery?.locked && gallery.release_at && (
        <p className="cg-msg">
          Your photos will be ready on{' '}
          {new Date(gallery.release_at).toLocaleString('en-GB', {
            dateStyle: 'long',
            timeStyle: 'short',
          })}
          .
        </p>
      )}
      {gallery && !gallery.locked && gallery.photos.length > 0 && (
        <p className="cg-fav-hint">Tap ♥ on your favourites{favCount ? ` · ${favCount} picked` : ''}</p>
      )}
      {gallery && !gallery.locked && (
        <div className="cg-grid">
          {gallery.photos.map((p) => (
            <figure key={p.path}>
              <img src={photoUrl(p.path)} alt={p.filename} loading="lazy" />
              <div className="cg-actions">
                <button className={`cg-heart${p.favourite ? ' on' : ''}`} onClick={() => heart(p.path)} aria-pressed={!!p.favourite} aria-label="Favourite">♥</button>
                <a href={photoUrl(p.path, p.filename)}>Download</a>
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  )
}
