import { supabase } from '../supabase'

export interface PostPhoto {
  url: string
  path?: string
  id?: string
  favourite?: boolean
  starred?: boolean
}

export type PostKind = 'post' | 'beforeafter' | 'sneak'

export interface Post {
  id: string
  photos: PostPhoto[]
  caption: string
  tags: string[]
  post_on: string | null
  posted: boolean
  kind: PostKind
}

export interface GalleryOption {
  id: string
  title: string
  created_at: string
  photo_count: number
}

const PREVIEW_BUCKET = 'post-previews'
const PREVIEW_SIZE = 1350

function db() {
  if (!supabase) throw new Error('Supabase is not connected.')
  return supabase
}

export async function listPosts(): Promise<Post[]> {
  const { data, error } = await db().from('posts').select('*').eq('posted', false).order('created_at')
  if (error) throw error
  return data as Post[]
}

export async function createPost(photos: PostPhoto[], kind: PostKind = 'post'): Promise<Post> {
  const clean = photos.map(({ url, path }) => (path ? { url, path } : { url }))
  const { data, error } = await db().from('posts').insert({ photos: clean, kind }).select().single()
  if (error) throw error
  return data as Post
}

export async function updatePost(id: string, changes: Partial<Post>): Promise<Post> {
  const { data, error } = await db().from('posts').update(changes).eq('id', id).select().single()
  if (error) throw error
  return data as Post
}

export async function deletePost(post: Post): Promise<void> {
  const own = post.photos.map((p) => p.path).filter((p): p is string => !!p)
  if (own.length) await db().storage.from(PREVIEW_BUCKET).remove(own)
  const { error } = await db().from('posts').delete().eq('id', post.id)
  if (error) throw error
}

function shrink(file: File): Promise<Blob> {
  return createImageBitmap(file).then((image) => {
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * scale)
    canvas.height = Math.round(image.height * scale)
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not read that photo.'))), 'image/jpeg', 0.85),
    )
  })
}

export async function uploadPhoto(file: File): Promise<PostPhoto> {
  const path = `${crypto.randomUUID()}.jpg`
  const stored = await db().storage.from(PREVIEW_BUCKET).upload(path, await shrink(file), { contentType: 'image/jpeg' })
  if (stored.error) throw stored.error
  return { path, url: db().storage.from(PREVIEW_BUCKET).getPublicUrl(path).data.publicUrl }
}

export async function listGalleries(): Promise<GalleryOption[]> {
  const { data, error } = await db().from('galleries').select('id,title,created_at,gallery_photos(count)').order('created_at', { ascending: false })
  if (error) throw error
  return (data as { id: string; title: string; created_at: string; gallery_photos: { count: number }[] }[])
    .map((g) => ({ id: g.id, title: g.title, created_at: g.created_at, photo_count: g.gallery_photos[0]?.count ?? 0 }))
    .filter((g) => g.photo_count > 0)
}

export async function galleryPhotos(galleryId: string): Promise<PostPhoto[]> {
  const { data, error } = await db().from('gallery_photos').select('id,path,favourite,starred').eq('gallery_id', galleryId).order('filename')
  if (error) throw error
  return (data as { id: string; path: string; favourite: boolean; starred: boolean }[]).map((p) => ({
    id: p.id,
    favourite: p.favourite,
    starred: p.starred,
    url: db().storage.from('galleries').getPublicUrl(p.path).data.publicUrl,
  }))
}

export async function setStarred(photoId: string, starred: boolean): Promise<void> {
  const { error } = await db().from('gallery_photos').update({ starred }).eq('id', photoId)
  if (error) throw error
}

/** Free, on-device photo score: sharpness (edge energy) + contrast + exposure. */
export function scorePhoto(url: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = 96
        const h = Math.max(3, Math.round((img.height / img.width) * w))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        const d = ctx.getImageData(0, 0, w, h).data
        const lum = new Float32Array(w * h)
        let sum = 0
        for (let i = 0; i < w * h; i++) {
          lum[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
          sum += lum[i]
        }
        const mean = sum / lum.length
        let varSum = 0
        let edge = 0
        for (let y = 1; y < h - 1; y++)
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            edge += Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w])
            varSum += (lum[i] - mean) ** 2
          }
        const sharp = edge / lum.length / 40
        const contrast = Math.sqrt(varSum / lum.length) / 64
        const exposure = 1 - Math.abs(mean - 110) / 110
        resolve(sharp * 0.5 + contrast * 0.25 + exposure * 0.25)
      } catch {
        resolve(0)
      }
    }
    img.onerror = () => resolve(0)
    img.src = url
  })
}

export async function listSavedCaptions(): Promise<{ id: string; text: string }[]> {
  const { data, error } = await db().from('saved_captions').select('id,text').order('created_at', { ascending: false })
  if (error) throw error
  return data as { id: string; text: string }[]
}

export async function saveCaption(text: string): Promise<{ id: string; text: string }> {
  const { data, error } = await db().from('saved_captions').insert({ text }).select('id,text').single()
  if (error) throw error
  return data as { id: string; text: string }
}

export async function listKnownHandles(): Promise<string[]> {
  const { data } = await db().from('shoot_people').select('handle')
  return [...new Set(((data ?? []) as { handle: string }[]).map((p) => p.handle).filter(Boolean))]
}
