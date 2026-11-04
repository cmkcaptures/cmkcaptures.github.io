import { supabase } from './supabase'

const BUCKET = 'galleries'
const PUBLIC_SITE = 'https://cmkcaptures.github.io'

export interface Gallery {
  id: string
  token: string
  client_id: string
  title: string
  release_at: string | null
}

export interface GalleryPhoto {
  id: string
  path: string
  filename: string
}

export interface PublicGallery {
  title: string
  release_at: string | null
  locked: boolean
  photos: { path: string; filename: string }[]
}

function db() {
  if (!supabase) throw new Error('Supabase is not connected yet.')
  return supabase
}

export function galleryLink(token: string): string {
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname)
  return `${local ? PUBLIC_SITE : window.location.origin}/g/${token}`
}

export function photoUrl(path: string, download?: string): string {
  const options = download ? { download } : undefined
  return db().storage.from(BUCKET).getPublicUrl(path, options).data.publicUrl
}

export async function getOrCreateGallery(clientId: string, title: string): Promise<Gallery> {
  const found = await db().from('galleries').select('*').eq('client_id', clientId).maybeSingle()
  if (found.error) throw found.error
  if (found.data) return found.data as Gallery
  const made = await db().from('galleries').insert({ client_id: clientId, title }).select().single()
  if (made.error) throw made.error
  return made.data as Gallery
}

export async function listPhotos(galleryId: string): Promise<GalleryPhoto[]> {
  const { data, error } = await db()
    .from('gallery_photos')
    .select('id,path,filename')
    .eq('gallery_id', galleryId)
    .order('filename')
  if (error) throw error
  return data as GalleryPhoto[]
}

export async function uploadPhoto(galleryId: string, file: File): Promise<GalleryPhoto> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${galleryId}/${crypto.randomUUID()}.${ext}`
  const stored = await db().storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (stored.error) throw stored.error
  const { data, error } = await db()
    .from('gallery_photos')
    .insert({ gallery_id: galleryId, path, filename: file.name })
    .select('id,path,filename')
    .single()
  if (error) throw error
  return data as GalleryPhoto
}

export async function deletePhoto(photo: GalleryPhoto): Promise<void> {
  const stored = await db().storage.from(BUCKET).remove([photo.path])
  if (stored.error) throw stored.error
  const { error } = await db().from('gallery_photos').delete().eq('id', photo.id)
  if (error) throw error
}

export async function setRelease(galleryId: string, releaseAt: string | null): Promise<void> {
  const { error } = await db().from('galleries').update({ release_at: releaseAt }).eq('id', galleryId)
  if (error) throw error
}

export async function fetchPublicGallery(token: string): Promise<PublicGallery | null> {
  const { data, error } = await db().rpc('get_gallery', { p_token: token })
  if (error) throw error
  return data as PublicGallery | null
}
