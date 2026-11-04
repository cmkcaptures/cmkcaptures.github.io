import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import type { ShootType, Tone } from '../captions'
import { SHOOT_TYPES, TONES, buildHashtags, generateCaptions } from '../captions'
import { addDaysISO, formatDate, todayISO } from '../invoiceTypes'

interface PlannedPost {
  id: string
  post_on: string
  caption: string
  photo_path: string | null
  posted: boolean
}

const BUCKET = 'post-previews'
const PREVIEW_SIZE = 1080
const DAYS_BETWEEN_POSTS = 2

function makePreview(file: File): Promise<Blob> {
  return createImageBitmap(file).then((image) => {
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.82),
    )
  })
}

function previewUrl(path: string): string {
  return supabase!.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export default function PostPlanner() {
  const [posts, setPosts] = useState<PlannedPost[]>([])
  const [shootType, setShootType] = useState<ShootType>('event')
  const [tone, setTone] = useState<Tone>('hyped')
  const [progress, setProgress] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      ?.from('planned_posts')
      .select('*')
      .order('post_on')
      .then(({ data, error: failed }) => {
        if (failed) setError(failed.message)
        else setPosts(data as PlannedPost[])
      })
  }, [])

  async function addPhotos(files: File[]) {
    if (!supabase) return
    const db = supabase
    setError('')
    const upcoming = posts.filter((p) => !p.posted).map((p) => p.post_on).sort()
    const last = upcoming[upcoming.length - 1]
    let date = last && last >= todayISO() ? addDaysISO(last, DAYS_BETWEEN_POSTS) : todayISO()
    for (const [i, file] of files.entries()) {
      setProgress(`Adding ${i + 1} of ${files.length}`)
      try {
        const preview = await makePreview(file)
        const path = `${crypto.randomUUID()}.jpg`
        const stored = await db.storage.from(BUCKET).upload(path, preview, { contentType: 'image/jpeg' })
        if (stored.error) throw stored.error
        const caption = `${generateCaptions(tone, shootType, { subject: '', venue: '', city: 'London' }, 1, true)[0]}\n\n${buildHashtags(shootType)}`
        const { data, error: failed } = await db
          .from('planned_posts')
          .insert({ post_on: date, caption, photo_path: path })
          .select()
          .single()
        if (failed) throw failed
        setPosts((prev) => [...prev, data as PlannedPost].sort((a, b) => a.post_on.localeCompare(b.post_on)))
        date = addDaysISO(date, DAYS_BETWEEN_POSTS)
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`)
      }
    }
    setProgress('')
  }

  async function change(post: PlannedPost, changes: Partial<PlannedPost>) {
    if (!supabase) return
    const { error: failed } = await supabase.from('planned_posts').update(changes).eq('id', post.id)
    if (failed) setError(failed.message)
    else setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...changes } : p)).sort((a, b) => a.post_on.localeCompare(b.post_on)))
  }

  async function remove(post: PlannedPost) {
    if (!supabase) return
    if (post.photo_path) await supabase.storage.from(BUCKET).remove([post.photo_path])
    const { error: failed } = await supabase.from('planned_posts').delete().eq('id', post.id)
    if (failed) setError(failed.message)
    else setPosts((prev) => prev.filter((p) => p.id !== post.id))
  }

  function copy(post: PlannedPost) {
    navigator.clipboard.writeText(post.caption).then(() => {
      setCopiedId(post.id)
      setTimeout(() => setCopiedId(null), 1800)
    })
  }

  const today = todayISO()
  const shown = posts.filter((p) => !p.posted)

  return (
    <div>
      {error && <p className="gr-error">{error}</p>}
      <div className="gr-form">
        <select aria-label="Shoot type" value={shootType} onChange={(e) => setShootType(e.target.value as ShootType)}>
          {SHOOT_TYPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select aria-label="Caption vibe" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
          {TONES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <label className="btn-brass gr-upload">
          {progress || '+ Add photos'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              addPhotos([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {shown.length === 0 && <p className="gr-empty">Add edited photos, and they'll be planned every {DAYS_BETWEEN_POSTS} days with a caption.</p>}
      <div className="gr-posts">
        {shown.map((p) => (
          <article className="gr-card gr-post" key={p.id}>
            {p.photo_path && <img src={previewUrl(p.photo_path)} alt="Planned post" loading="lazy" />}
            <div className="gr-post-body">
              <div className="field">
                <label className="field-label">{p.post_on <= today ? 'Post now' : formatDate(p.post_on)}</label>
                <input type="date" aria-label="Post date" value={p.post_on} onChange={(e) => e.target.value && change(p, { post_on: e.target.value })} />
              </div>
              <textarea
                key={p.caption}
                defaultValue={p.caption}
                rows={5}
                aria-label="Caption"
                onBlur={(e) => {
                  if (e.target.value !== p.caption) change(p, { caption: e.target.value })
                }}
              />
              <div className="gr-actions">
                <button className="btn-brass" onClick={() => copy(p)}>{copiedId === p.id ? 'Copied!' : 'Copy caption'}</button>
                <button className="gallery-btn" onClick={() => change(p, { posted: true })}>Posted</button>
                <button className="gallery-btn" onClick={() => remove(p)}>Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
