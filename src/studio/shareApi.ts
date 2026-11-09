// Partner portals and live walls (Studio side).
import { supabase } from '../supabase'
import { shrink } from './postsApi'

function db() {
  if (!supabase) throw new Error('Not connected.')
  return supabase
}

export interface Partner {
  id: string
  token: string
  name: string
  handle: string
  client_ids: string[]
}

export const partnerLink = (token: string) => `${window.location.origin}/p/${token}`
export const wallLink = (token: string) => `${window.location.origin}/live/${token}`

export async function findPartner(name: string): Promise<Partner | null> {
  const { data } = await db().from('partners').select('*').ilike('name', name).maybeSingle()
  return (data as Partner) ?? null
}

export async function savePartner(name: string, handle: string, clientIds: string[]): Promise<Partner> {
  const existing = await findPartner(name)
  const res = existing
    ? await db().from('partners').update({ handle, client_ids: clientIds }).eq('id', existing.id).select().single()
    : await db().from('partners').insert({ name, handle, client_ids: clientIds }).select().single()
  if (res.error) throw res.error
  return res.data as Partner
}

export interface Wall {
  id: string
  token: string
  title: string
  active: boolean
}

export async function wallFor(clientId: string, title: string): Promise<Wall> {
  const { data } = await db().from('live_walls').select('*').eq('client_id', clientId).maybeSingle()
  if (data) return data as Wall
  const res = await db().from('live_walls').insert({ client_id: clientId, title }).select().single()
  if (res.error) throw res.error
  return res.data as Wall
}

export async function existingWall(clientId: string): Promise<Wall | null> {
  const { data } = await db().from('live_walls').select('*').eq('client_id', clientId).maybeSingle()
  return (data as Wall) ?? null
}

export async function wallCount(wallId: string): Promise<number> {
  const { count } = await db().from('live_photos').select('id', { count: 'exact', head: true }).eq('wall_id', wallId)
  return count ?? 0
}

export async function addToWall(wall: Wall, file: File): Promise<void> {
  const path = `live/${wall.id}/${crypto.randomUUID()}.jpg`
  const up = await db().storage.from('post-previews').upload(path, await shrink(file), { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const url = db().storage.from('post-previews').getPublicUrl(path).data.publicUrl
  const { error } = await db().from('live_photos').insert({ wall_id: wall.id, url, path })
  if (error) throw error
}
