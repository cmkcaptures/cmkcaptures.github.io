// Auto-posts: pick a gallery, Sandy chooses the best frames, writes captions and schedules them on free days.
import { useEffect, useState } from 'react'
import type { GalleryOption, Post, PostPhoto } from './postsApi'
import { createPost, galleryPhotos, listGalleries, scorePhoto, updatePost } from './postsApi'
import { buildHashtags, generateCaptions } from '../captions'
import { addDaysISO, todayISO } from '../invoiceTypes'
import { sandyWrite } from './sandyWrite'

interface Props {
  posts: Post[]
  onDone: (created: Post[]) => void
  onClose: () => void
}

type Step = 'pick' | 'working' | 'review'

export default function AutoPost({ posts, onDone, onClose }: Props) {
  const [galleries, setGalleries] = useState<GalleryOption[] | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [status, setStatus] = useState('')
  const [made, setMade] = useState<Post[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    listGalleries()
      .then(setGalleries)
      .catch((e: Error) => setError(e.message))
  }, [])

  function freeDays(count: number): string[] {
    const taken = new Set(posts.filter((p) => p.post_on).map((p) => p.post_on))
    const out: string[] = []
    for (let i = 1; out.length < count && i < 30; i++) {
      const day = addDaysISO(todayISO(), i)
      if (!taken.has(day)) out.push(day)
    }
    return out
  }

  async function run(g: GalleryOption) {
    setStep('working')
    setError('')
    try {
      setStatus('Looking through the gallery…')
      const photos = await galleryPhotos(g.id)
      if (!photos.length) throw new Error('That gallery is empty.')
      const scored: { p: PostPhoto; s: number }[] = []
      for (const [i, p] of photos.entries()) {
        setStatus(`Scoring photo ${i + 1} of ${photos.length}…`)
        const base = await scorePhoto(p.url)
        scored.push({ p, s: base + (p.favourite ? 0.6 : 0) + (p.starred ? 0.8 : 0) })
      }
      scored.sort((a, b) => b.s - a.s)
      const top = scored.map((x) => ({ url: x.p.url }))
      const plan: PostPhoto[][] = [top.slice(0, Math.min(6, top.length))]
      if (top.length > 6) plan.push([top[6]])
      if (top.length > 7) plan.push([top[7]])
      const days = freeDays(plan.length)

      const created: Post[] = []
      for (const [i, group] of plan.entries()) {
        setStatus(`Writing caption ${i + 1} of ${plan.length}…`)
        const kind = i === 0 ? `a ${group.length}-photo carousel recap` : 'a single standout photo'
        const ai = await sandyWrite(
          `Write an Instagram caption for ${kind} from "${g.title || 'a London night'}" I shot. 1-3 short lines, nightlife energy, no hashtags, max 2 emojis. Make each one different from the last.`,
        )
        const caption = `${ai ?? generateCaptions('hyped', 'event', { subject: '', venue: '', city: 'London' }, 1, false)[0]}\n\n${buildHashtags('event')}`
        const post = await createPost(group)
        created.push(await updatePost(post.id, { caption, post_on: days[i] ?? null }))
      }
      setMade(created)
      onDone(created)
      setStep('review')
    } catch (e) {
      setError((e as Error).message)
      setStep('pick')
    }
  }

  return (
    <div className="ps-drawer-wrap" onClick={step === 'working' ? undefined : onClose}>
      <aside className="ps-drawer" onClick={(e) => e.stopPropagation()} aria-label="Auto-post">
        <header>
          <h2>✦ Auto-post</h2>
          {step !== 'working' && (
            <button className="st-ghost" onClick={onClose}>
              Close
            </button>
          )}
        </header>
        {error && <p className="gr-error">{error}</p>}

        {step === 'pick' && (
          <>
            <p className="ps-hint">Pick a gallery. Sandy picks the best frames (client hearts and your stars count extra), writes captions and schedules them on your free days.</p>
            {galleries === null && <p className="st-empty st-loading">Loading galleries…</p>}
            {galleries?.map((g) => (
              <button key={g.id} className="st-item" onClick={() => run(g)}>
                <span className="st-avatar">{(g.title || 'G').slice(0, 2).toUpperCase()}</span>
                <span className="st-item-text">
                  <b>{g.title || 'Untitled gallery'}</b>
                  <small>
                    {new Date(g.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {g.photo_count} photos
                  </small>
                </span>
              </button>
            ))}
          </>
        )}

        {step === 'working' && (
          <div className="ap-working">
            <div className="ap-orb" />
            <p>{status}</p>
          </div>
        )}

        {step === 'review' && (
          <>
            <p className="ps-hint">Done. {made.length} posts planned. Tap any of them in Posts to tweak.</p>
            {made.map((p) => (
              <div key={p.id} className="ap-made">
                <img src={p.photos[0]?.url} alt="" />
                <span>
                  <b>
                    {p.post_on ? new Date(`${p.post_on}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Unscheduled'}
                    {p.photos.length > 1 ? ` · carousel of ${p.photos.length}` : ''}
                  </b>
                  <small>{p.caption.split('\n')[0]}</small>
                </span>
              </div>
            ))}
            <button className="btn-brass" onClick={onClose}>
              Nice
            </button>
          </>
        )}
      </aside>
    </div>
  )
}
