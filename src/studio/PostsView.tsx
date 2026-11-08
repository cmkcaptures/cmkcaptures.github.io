import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import type { GalleryOption, Post, PostPhoto } from './postsApi'
import {
  createPost,
  deletePost,
  galleryPhotos,
  listGalleries,
  listKnownHandles,
  listPosts,
  listSavedCaptions,
  saveCaption,
  updatePost,
  uploadPhoto,
} from './postsApi'
import { buildHashtags, generateCaptions } from '../captions'
import { addDaysISO, todayISO } from '../invoiceTypes'
import './Posts.css'

const WEEK_DAYS = 7

function dayLabel(iso: string): { name: string; num: string } {
  const d = new Date(`${iso}T00:00:00`)
  return { name: d.toLocaleDateString('en-GB', { weekday: 'short' }), num: String(d.getDate()) }
}

function fullText(post: Post): string {
  return [post.caption.trim(), post.tags.length ? post.tags.join(' ') : ''].filter(Boolean).join('\n\n')
}

export default function PostsView() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ intoPost?: string } | null>(null)
  const [uploading, setUploading] = useState('')
  const [justPosted, setJustPosted] = useState<Post | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [error, setError] = useState('')
  const uploadInto = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listPosts()
      .then(setPosts)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const today = todayISO()
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => addDaysISO(today, i))
  const ready = posts.filter((p) => !p.post_on)
  const scheduled = posts.filter((p) => p.post_on).sort((a, b) => a.post_on!.localeCompare(b.post_on!))
  const open = posts.find((p) => p.id === openId) ?? null

  function replace(post: Post) {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? post : p)))
  }

  async function change(post: Post, changes: Partial<Post>) {
    setError('')
    replace({ ...post, ...changes })
    try {
      replace(await updatePost(post.id, changes))
    } catch (e) {
      replace(post)
      setError((e as Error).message)
    }
  }

  async function addPhotos(photos: PostPhoto[], intoPost?: string | null, asCarousel = false) {
    setError('')
    try {
      if (intoPost) {
        const target = posts.find((p) => p.id === intoPost)
        if (target) await change(target, { photos: [...target.photos, ...photos] })
        return
      }
      const groups = asCarousel ? [photos] : photos.map((p) => [p])
      for (const group of groups) {
        const post = await createPost(group)
        setPosts((prev) => [...prev, post])
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function upload(files: File[]) {
    const photos: PostPhoto[] = []
    for (const [i, file] of files.entries()) {
      setUploading(`Uploading ${i + 1} of ${files.length}`)
      try {
        photos.push(await uploadPhoto(file))
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    setUploading('')
    if (photos.length) await addPhotos(photos, uploadInto.current)
    uploadInto.current = null
  }

  function pickFiles(intoPost: string | null) {
    uploadInto.current = intoPost
    fileInput.current?.click()
  }

  async function mergeInto(targetId: string, sourceId: string) {
    const target = posts.find((p) => p.id === targetId)
    const source = posts.find((p) => p.id === sourceId)
    if (!target || !source || target.id === source.id) return
    await change(target, { photos: [...target.photos, ...source.photos] })
    try {
      await deletePost({ ...source, photos: [] })
      setPosts((prev) => prev.filter((p) => p.id !== source.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function remove(post: Post) {
    try {
      await deletePost(post)
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
      setOpenId(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function markPosted(post: Post) {
    await change(post, { posted: true })
    setPosts((prev) => prev.filter((p) => p.id !== post.id))
    setOpenId(null)
    if (post.tags.length) setJustPosted(post)
  }

  function onDrag(e: DragEvent, id: string) {
    e.dataTransfer.setData('text/post', id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function dropOn(e: DragEvent, target: string) {
    e.preventDefault()
    setDragOver(null)
    const id = e.dataTransfer.getData('text/post')
    if (!id) return
    const post = posts.find((p) => p.id === id)
    if (!post) return
    if (target === 'ready') change(post, { post_on: null })
    else if (target.startsWith('post:')) mergeInto(target.slice(5), id)
    else change(post, { post_on: target })
  }

  function dropZone(target: string) {
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        setDragOver(target)
      },
      onDragLeave: () => setDragOver((d) => (d === target ? null : d)),
      onDrop: (e: DragEvent) => dropOn(e, target),
    }
  }

  return (
    <div className="ps">
      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          upload([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
      {error && <p className="gr-error">{error}</p>}

      <section className="ps-block">
        <div className="ps-head">
          <div>
            <h2>Ready to post</h2>
            <p>Drag onto a day to schedule. Drop one post onto another to make a carousel.</p>
          </div>
          <div className="ps-head-actions">
            <button className="st-ghost" onClick={() => setPicker({})}>
              From a gallery
            </button>
            <button className="btn-brass" onClick={() => pickFiles(null)} disabled={!!uploading}>
              {uploading || '+ Upload'}
            </button>
          </div>
        </div>
        <div className={`ps-ready${dragOver === 'ready' ? ' over' : ''}`} {...dropZone('ready')}>
          {loading && <p className="st-empty st-loading">Loading your posts…</p>}
          {!loading && ready.length === 0 && <p className="st-empty">Nothing waiting. Upload photos or pull some from a gallery.</p>}
          {ready.map((p, i) => (
            <button
              key={p.id}
              className={`ps-thumb${dragOver === `post:${p.id}` ? ' over' : ''}`}
              style={{ animationDelay: `${i * 0.04}s` }}
              draggable
              onDragStart={(e) => onDrag(e, p.id)}
              onClick={() => setOpenId(p.id)}
              {...dropZone(`post:${p.id}`)}
            >
              {p.photos[0] && <img src={p.photos[0].url} alt="" loading="lazy" draggable={false} />}
              {p.photos.length > 1 && <span className="ps-count">{p.photos.length}</span>}
              {p.caption && <span className="ps-has-caption" title="Has a caption" />}
            </button>
          ))}
        </div>
      </section>

      <section className="ps-block">
        <div className="ps-head">
          <div>
            <h2>This week</h2>
            <p>{scheduled.filter((p) => p.post_on! <= days[WEEK_DAYS - 1]).length} planned. Empty days are free slots.</p>
          </div>
        </div>
        <div className="ps-week">
          {days.map((day) => {
            const onDay = scheduled.filter((p) => p.post_on === day)
            const { name, num } = dayLabel(day)
            return (
              <div key={day} className={`ps-day${onDay.length ? '' : ' free'}${day === today ? ' today' : ''}${dragOver === day ? ' over' : ''}`} {...dropZone(day)}>
                <span className="ps-day-name">{day === today ? 'Today' : name}</span>
                <span className="ps-day-num">{num}</span>
                {onDay.map((p) => (
                  <button key={p.id} className="ps-day-post" draggable onDragStart={(e) => onDrag(e, p.id)} onClick={() => setOpenId(p.id)}>
                    {p.photos[0] && <img src={p.photos[0].url} alt="" draggable={false} />}
                  </button>
                ))}
                {!onDay.length && <span className="ps-free">Free</span>}
              </div>
            )
          })}
        </div>
      </section>

      <section className="ps-block">
        <div className="ps-head">
          <div>
            <h2>Grid preview</h2>
            <p>How your next posts line up on @cmk._7.</p>
          </div>
        </div>
        <div className="ps-grid">
          {[...scheduled].reverse().map((p) => (
            <button key={p.id} className="ps-grid-tile" onClick={() => setOpenId(p.id)}>
              {p.photos[0] && <img src={p.photos[0].url} alt="" />}
              <span>{dayLabel(p.post_on!).name}</span>
            </button>
          ))}
          {Array.from({ length: Math.max(0, 9 - scheduled.length) }, (_, i) => (
            <div key={i} className="ps-grid-tile empty" />
          ))}
        </div>
      </section>

      {open && (
        <PostCard
          key={open.id}
          post={open}
          onClose={() => setOpenId(null)}
          onChange={(changes) => change(open, changes)}
          onAddFromGallery={() => setPicker({ intoPost: open.id })}
          onUpload={() => pickFiles(open.id)}
          onPosted={() => markPosted(open)}
          onDelete={() => remove(open)}
        />
      )}

      {picker && (
        <GalleryPicker
          intoPost={!!picker.intoPost}
          onClose={() => setPicker(null)}
          onPick={(photos, asCarousel) => {
            addPhotos(photos, picker.intoPost, asCarousel)
            setPicker(null)
          }}
        />
      )}

      {justPosted && <TagReminder post={justPosted} onClose={() => setJustPosted(null)} />}
    </div>
  )
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  return [
    copied,
    (key, text) =>
      navigator.clipboard.writeText(text).then(() => {
        setCopied(key)
        setTimeout(() => setCopied(null), 1600)
      }),
  ]
}

function PostCard({
  post,
  onClose,
  onChange,
  onAddFromGallery,
  onUpload,
  onPosted,
  onDelete,
}: {
  post: Post
  onClose: () => void
  onChange: (changes: Partial<Post>) => void
  onAddFromGallery: () => void
  onUpload: () => void
  onPosted: () => void
  onDelete: () => void
}) {
  const [index, setIndex] = useState(0)
  const [crop, setCrop] = useState<'none' | '3:4' | '4:5'>('3:4')
  const [caption, setCaption] = useState(post.caption)
  const [memory, setMemory] = useState<{ id: string; text: string }[]>([])
  const [handles, setHandles] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [copied, copy] = useCopy()

  useEffect(() => {
    listSavedCaptions().then(setMemory).catch(() => {})
    listKnownHandles().then(setHandles).catch(() => {})
  }, [])

  useEffect(() => {
    if (index >= post.photos.length) setIndex(Math.max(0, post.photos.length - 1))
  }, [post.photos.length, index])

  const photo = post.photos[index]

  function commitCaption(text: string) {
    setCaption(text)
    if (text !== post.caption) onChange({ caption: text })
  }

  function shuffle() {
    const fresh = generateCaptions('hyped', 'event', { subject: '', venue: '', city: 'London' }, 1, false)[0]
    commitCaption(fresh)
  }

  function move(by: number) {
    const to = index + by
    if (to < 0 || to >= post.photos.length) return
    const photos = [...post.photos]
    ;[photos[index], photos[to]] = [photos[to], photos[index]]
    onChange({ photos })
    setIndex(to)
  }

  function removePhoto() {
    onChange({ photos: post.photos.filter((_, i) => i !== index) })
  }

  function addTag() {
    const handle = tagInput.trim().replace(/^([^@])/, '@$1')
    if (handle.length < 2 || post.tags.includes(handle)) return
    onChange({ tags: [...post.tags, handle] })
    setTagInput('')
  }

  async function remember() {
    if (!caption.trim() || memory.some((m) => m.text === caption.trim())) return
    try {
      const saved = await saveCaption(caption.trim())
      setMemory((m) => [saved, ...m])
    } catch {
      // Saving to memory is optional; the caption itself is already stored on the post.
    }
  }

  return (
    <div className="ps-drawer-wrap" onClick={onClose}>
      <aside className="ps-drawer" onClick={(e) => e.stopPropagation()} aria-label="Post">
        <header>
          <h2>{post.photos.length > 1 ? `Carousel · ${post.photos.length} photos` : 'Post'}</h2>
          <button className="st-ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="ps-stage">
          {photo ? <img src={photo.url} alt="" /> : <p className="st-empty">No photos left in this post.</p>}
          {photo && crop !== 'none' && <span className={`ps-crop ps-crop-${crop.replace(':', '-')}`} />}
          {post.photos.length > 1 && (
            <>
              <button className="ps-nav prev" onClick={() => setIndex((i) => Math.max(0, i - 1))} aria-label="Previous photo">
                ‹
              </button>
              <button className="ps-nav next" onClick={() => setIndex((i) => Math.min(post.photos.length - 1, i + 1))} aria-label="Next photo">
                ›
              </button>
              <div className="ps-dots">
                {post.photos.map((_, i) => (
                  <i key={i} className={i === index ? 'on' : ''} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ps-tools">
          {(['3:4', '4:5', 'none'] as const).map((c) => (
            <button key={c} className={crop === c ? 'on' : ''} onClick={() => setCrop(c)}>
              {c === 'none' ? 'No guide' : c}
            </button>
          ))}
          <span className="ps-tools-gap" />
          {post.photos.length > 1 && (
            <>
              <button onClick={() => move(-1)} aria-label="Move photo earlier">
                ←
              </button>
              <button onClick={() => move(1)} aria-label="Move photo later">
                →
              </button>
            </>
          )}
          {photo && <button onClick={removePhoto}>Remove photo</button>}
        </div>
        <div className="ps-add-more">
          <button className="st-ghost" onClick={onUpload}>
            + Upload
          </button>
          <button className="st-ghost" onClick={onAddFromGallery}>
            + From gallery
          </button>
        </div>

        <label className="ps-label" htmlFor="ps-caption">
          Caption
        </label>
        <textarea id="ps-caption" rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={(e) => commitCaption(e.target.value)} placeholder="Write a caption, shuffle one, or pick from your saved ones" />
        <div className="ps-row-actions">
          <button className="st-ghost" onClick={shuffle}>
            ↻ Shuffle
          </button>
          <button className="st-ghost" onClick={() => commitCaption(`${caption.trim()}\n\n${buildHashtags('event')}`.trim())}>
            # Hashtags
          </button>
          <button className="st-ghost" onClick={remember} disabled={!caption.trim()}>
            ★ Save to memory
          </button>
        </div>
        {memory.length > 0 && (
          <div className="ps-memory">
            {memory.slice(0, 8).map((m) => (
              <button key={m.id} onClick={() => commitCaption(m.text)} title={m.text}>
                {m.text}
              </button>
            ))}
          </div>
        )}

        <label className="ps-label" htmlFor="ps-tag">
          Tag
        </label>
        <div className="ps-tags">
          {post.tags.map((t) => (
            <span key={t} className="ps-tag">
              {t}
              <button onClick={() => onChange({ tags: post.tags.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>
                ×
              </button>
            </span>
          ))}
          <input
            id="ps-tag"
            list="ps-handles"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTag()
              }
            }}
            placeholder="@handle, then Enter"
          />
          <datalist id="ps-handles">
            {handles.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </div>

        <label className="ps-label" htmlFor="ps-date">
          Post on
        </label>
        <input id="ps-date" type="date" value={post.post_on ?? ''} onChange={(e) => onChange({ post_on: e.target.value || null })} />

        <div className="ps-footer">
          <button className="btn-brass" onClick={() => copy('all', fullText({ ...post, caption }))}>
            {copied === 'all' ? 'Copied!' : 'Copy caption + tags'}
          </button>
          <button className="st-ghost" onClick={onPosted}>
            ✓ Posted
          </button>
          <button className="gr-delete" onClick={onDelete}>
            Delete post
          </button>
        </div>
      </aside>
    </div>
  )
}

function GalleryPicker({ intoPost, onClose, onPick }: { intoPost: boolean; onClose: () => void; onPick: (photos: PostPhoto[], asCarousel: boolean) => void }) {
  const [galleries, setGalleries] = useState<GalleryOption[] | null>(null)
  const [gallery, setGallery] = useState<GalleryOption | null>(null)
  const [photos, setPhotos] = useState<PostPhoto[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    listGalleries()
      .then(setGalleries)
      .catch((e: Error) => setError(e.message))
  }, [])

  function choose(g: GalleryOption) {
    setGallery(g)
    setPhotos(null)
    setChosen([])
    galleryPhotos(g.id)
      .then(setPhotos)
      .catch((e: Error) => setError(e.message))
  }

  const picked = (photos ?? []).filter((p) => chosen.includes(p.url))

  return (
    <div className="ps-drawer-wrap" onClick={onClose}>
      <aside className="ps-drawer ps-picker" onClick={(e) => e.stopPropagation()} aria-label="Pick photos">
        <header>
          <h2>{gallery ? gallery.title || 'Gallery' : 'Pick a gallery'}</h2>
          <button className="st-ghost" onClick={gallery ? () => setGallery(null) : onClose}>
            {gallery ? 'Back' : 'Close'}
          </button>
        </header>
        {error && <p className="gr-error">{error}</p>}
        {!gallery && galleries === null && <p className="st-empty st-loading">Loading galleries…</p>}
        {!gallery && galleries?.length === 0 && <p className="st-empty">No galleries yet. Upload photos to a client first.</p>}
        {!gallery &&
          galleries?.map((g) => (
            <button key={g.id} className="st-item" onClick={() => choose(g)}>
              <span className="st-avatar">{(g.title || 'G').slice(0, 2).toUpperCase()}</span>
              <span className="st-item-text">
                <b>{g.title || 'Untitled gallery'}</b>
              </span>
            </button>
          ))}
        {gallery && photos === null && <p className="st-empty st-loading">Loading photos…</p>}
        {gallery && photos && (
          <>
            <div className="ps-pick-grid">
              {photos.map((p) => {
                const on = chosen.includes(p.url)
                return (
                  <button key={p.url} className={on ? 'on' : ''} onClick={() => setChosen((c) => (on ? c.filter((x) => x !== p.url) : [...c, p.url]))} aria-pressed={on}>
                    <img src={p.url} alt="" loading="lazy" />
                    {on && <span>{chosen.indexOf(p.url) + 1}</span>}
                  </button>
                )
              })}
            </div>
            <div className="ps-footer">
              {intoPost ? (
                <button className="btn-brass" disabled={!picked.length} onClick={() => onPick(picked, true)}>
                  Add {picked.length || ''} to post
                </button>
              ) : (
                <>
                  <button className="btn-brass" disabled={!picked.length} onClick={() => onPick(picked, false)}>
                    Add as {picked.length || ''} posts
                  </button>
                  <button className="st-ghost" disabled={picked.length < 2} onClick={() => onPick(picked, true)}>
                    Make 1 carousel
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function TagReminder({ post, onClose }: { post: Post; onClose: () => void }) {
  const [copied, copy] = useCopy()
  return (
    <div className="ps-drawer-wrap ps-center" onClick={onClose}>
      <div className="ps-reminder" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tag reminder">
        <h2>Did you tag them?</h2>
        <p>Tag these {post.tags.length} on the post or in your story:</p>
        <div className="ps-tags">
          {post.tags.map((t) => (
            <button key={t} className="ps-tag" onClick={() => copy(t, t)}>
              {copied === t ? 'Copied!' : t}
            </button>
          ))}
        </div>
        <div className="ps-footer">
          <button className="btn-brass" onClick={() => copy('all', post.tags.join(' '))}>
            {copied === 'all' ? 'Copied!' : 'Copy all'}
          </button>
          <button className="st-ghost" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
