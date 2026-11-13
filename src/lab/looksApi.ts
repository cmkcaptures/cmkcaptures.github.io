// Saved looks (the style library). Stored privately in Supabase.
import { supabase } from '../supabase'
import type { Look } from './look'

export interface SavedLook {
  id: string
  name: string
  look: Look
  thumb: string
}

export async function listLooks(): Promise<SavedLook[]> {
  const { data, error } = (await supabase?.from('edit_looks').select('id,name,look,thumb').order('created_at', { ascending: false })) ?? { data: [], error: null }
  if (error) throw error
  return (data ?? []) as SavedLook[]
}

export async function saveLook(name: string, look: Look, thumb: string): Promise<SavedLook> {
  const { data, error } = await supabase!.from('edit_looks').insert({ name, look, thumb }).select('id,name,look,thumb').single()
  if (error) throw error
  return data as SavedLook
}

export async function deleteLook(id: string): Promise<void> {
  const { error } = await supabase!.from('edit_looks').delete().eq('id', id)
  if (error) throw error
}

/** Small JPEG data URL used as the look's card image. */
export async function thumbFrom(url: string, size = 220): Promise<string> {
  const img = await createImageBitmap(await fetch(url).then((r) => r.blob()))
  const s = size / Math.max(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * s)
  c.height = Math.round(img.height * s)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  img.close()
  return c.toDataURL('image/jpeg', 0.72)
}
