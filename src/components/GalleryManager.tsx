import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import type { Gallery, GalleryPhoto } from '../galleryApi'
import {
  cancelEmail,
  refreshGallery,
  scheduleEmail,
  deletePhoto,
  galleryLink,
  getOrCreateGallery,
  listPhotos,
  photoUrl,
  setRelease,
  uploadPhoto,
} from '../galleryApi'
import './Gallery.css'

interface Props {
  clientId: string
  clientName: string
  contact: string
  onLink: (url: string) => void
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function GalleryManager({ clientId, clientName, contact, onLink }: Props) {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('cmkcaptures@gmail.com')
  const [password, setPassword] = useState('')
  const [gallery, setGallery] = useState<Gallery | null>(null)
  const [photos, setPhotos] = useState<GalleryPhoto[]>([])
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [clientEmail, setClientEmail] = useState(contact.includes('@') ? contact.trim() : '')
  const canSend = photos.length > 0 && /^\S+@\S+\.\S+$/.test(clientEmail.trim())

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    getOrCreateGallery(clientId, clientName)
      .then(async (g) => {
        setGallery(g)
        if (g.client_email) setClientEmail(g.client_email)
        setPhotos(await listPhotos(g.id))
        onLink(galleryLink(g.token))
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, clientId])

  if (!supabase) {
    return <p className="gm-note">Photo uploads switch on once Supabase is connected.</p>
  }

  async function signIn(create: boolean) {
    setError('')
    const auth = supabase!.auth
    const { error: e } = create
      ? await auth.signUp({ email, password })
      : await auth.signInWithPassword({ email, password })
    if (e) setError(e.message)
    else if (create) setProgress('Check your email to confirm the account, then sign in.')
  }

  async function addFiles(files: File[]) {
    if (!gallery) return
    const images = files.filter((f) => f.type.startsWith('image/'))
    const queue = [...images]
    let done = 0
    setError('')
    setProgress(`Uploading 0 of ${images.length}`)
    const worker = async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        try {
          const photo = await uploadPhoto(gallery.id, file)
          setPhotos((prev) => [...prev, photo])
        } catch (e) {
          setError(`${file.name}: ${(e as Error).message}`)
        }
        done += 1
        setProgress(`Uploading ${done} of ${images.length}`)
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setProgress('')
  }

  async function remove(photo: GalleryPhoto) {
    try {
      await deletePhoto(photo)
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function changeRelease(value: string) {
    if (!gallery) return
    const release_at = value ? new Date(value).toISOString() : null
    try {
      await setRelease(gallery.id, release_at)
      setGallery({ ...gallery, release_at })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function sendEmail(sendAt: string) {
    if (!gallery) return
    setError('')
    try {
      await scheduleEmail(gallery.id, clientEmail.trim(), sendAt)
      setGallery(await refreshGallery(gallery.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function cancelSend() {
    if (!gallery) return
    try {
      await cancelEmail(gallery.id)
      setGallery(await refreshGallery(gallery.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!session) {
    return (
      <div className="gm">
        <span className="field-label">Sign in to upload photos</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <div className="gallery-actions">
          <button className="gallery-btn accent" onClick={() => signIn(false)}>Sign in</button>
          <button className="gallery-btn" onClick={() => signIn(true)}>Create account</button>
        </div>
        {progress && <p className="gm-note">{progress}</p>}
        {error && <p className="gm-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="gm">
      <label
        className={`gm-drop${dragging ? ' on' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          addFiles([...e.dataTransfer.files])
        }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
        {progress || 'Drop edited photos here, or click to choose'}
      </label>
      {error && <p className="gm-error">{error}</p>}

      <div className="field">
        <label className="field-label">Client can access from (blank = straight away)</label>
        <input
          type="datetime-local"
          value={toLocalInput(gallery?.release_at ?? null)}
          onChange={(e) => changeRelease(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field-label">Client email</label>
        <input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder="client@email.com"
        />
      </div>
      <div className="gallery-actions">
        <button
          className="gallery-btn accent"
          type="button"
          disabled={!canSend}
          onClick={() => sendEmail(new Date().toISOString())}
        >
          Send now
        </button>
        {gallery?.release_at && new Date(gallery.release_at) > new Date() && (
          <button
            className="gallery-btn"
            type="button"
            disabled={!canSend}
            onClick={() => sendEmail(gallery.release_at!)}
          >
            Email on access date
          </button>
        )}
        {gallery?.send_at && !gallery.sent_at && (
          <button className="gallery-btn" type="button" onClick={cancelSend}>
            Cancel email
          </button>
        )}
      </div>
      {gallery?.sent_at && (
        <p className="gm-note">Emailed to {gallery.client_email} on {new Date(gallery.sent_at).toLocaleString('en-GB')}</p>
      )}
      {gallery?.send_at && !gallery.sent_at && !gallery.send_error && (
        <p className="gm-note">Email scheduled for {new Date(gallery.send_at).toLocaleString('en-GB')}</p>
      )}
      {gallery?.send_error && <p className="gm-error">Email failed: {gallery.send_error}</p>}

      {photos.length > 0 && (
        <>
          <span className="field-label">{photos.length} photos</span>
          <div className="gm-grid">
            {photos.map((p) => (
              <div className="gm-thumb" key={p.id}>
                <img src={photoUrl(p.path)} alt={p.filename} loading="lazy" />
                <button onClick={() => remove(p)} aria-label={`Remove ${p.filename}`}>×</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
