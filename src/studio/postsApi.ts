import { supabase } from '../supabase'

export interface PostPhoto {
  url: string
  path?: string
}

export interface Post {
  id: string
  photos: PostPhoto[]
  caption: string
  tags: string[]
  post_on: string | null
  posted: boolean
}

export interface GalleryOption {
  id: string
  title: string
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

export async function createPost(photos: PostPhoto[]): Promise<Post> {
  const { data, error } = await db().from('posts').insert({ photos }).select().single()
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
  const { data, error } = await db().from('galleries').select('id,title').order('created_at', { ascending: false })
  if (error) throw error
  return data as GalleryOption[]
}

export async function galleryPhotos(galleryId: string): Promise<PostPhoto[]> {
  const { data, error } = await db().from('gallery_photos').select('path').eq('gallery_id', galleryId).order('filename')
  if (error) throw error
  return (data as { path: string }[]).map((p) => ({ url: db().storage.from('galleries').getPublicUrl(p.path).data.publicUrl }))
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
