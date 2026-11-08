// Pulls @cmk._7's recent posts and their stats so Sandy can keep up with them.
// Only post data is read. Follower counts are deliberately never requested.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER = 'cmkcaptures@gmail.com'
const GRAPH = 'https://graph.instagram.com'
const REFRESH_AFTER_DAYS = 7
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

const fail = (message: string, status = 400) => Response.json({ error: message }, { status, headers: cors })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: who } = await admin.auth.getUser(jwt)
  if (who.user?.email !== OWNER) return fail('Not allowed.', 403)

  const { data: saved } = await admin.from('ig_auth').select('token,refreshed_at').eq('id', 1).maybeSingle()
  let token: string = saved?.token ?? Deno.env.get('IG_TOKEN') ?? ''
  if (!token) return fail('Instagram is not connected yet. Add the IG_TOKEN secret in Supabase.', 412)

  // Long-lived tokens last 60 days; refreshing weekly keeps it alive forever.
  const age = saved ? (Date.now() - new Date(saved.refreshed_at).getTime()) / 86400000 : Infinity
  if (age > REFRESH_AFTER_DAYS) {
    const r = await fetch(`${GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`)
    const body = await r.json()
    if (r.ok && body.access_token) {
      token = body.access_token
      await admin.from('ig_auth').upsert({ id: 1, token, refreshed_at: new Date().toISOString() })
    }
  }

  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'
  const res = await fetch(`${GRAPH}/v23.0/me/media?fields=${fields}&limit=30&access_token=${token}`)
  const list = await res.json()
  if (!res.ok) return fail(list.error?.message ?? `Instagram returned ${res.status}`, 502)

  const rows = await Promise.all(
    (list.data ?? []).map(async (m: Record<string, any>) => {
      const stats: Record<string, number> = {}
      const ins = await fetch(`${GRAPH}/v23.0/${m.id}/insights?metric=reach,saved,shares,views&access_token=${token}`)
      if (ins.ok) {
        for (const metric of (await ins.json()).data ?? []) stats[metric.name] = metric.values?.[0]?.value ?? 0
      }
      return {
        id: m.id,
        caption: m.caption ?? '',
        media_type: m.media_type ?? '',
        media_url: m.media_url ?? null,
        thumbnail_url: m.thumbnail_url ?? null,
        permalink: m.permalink ?? null,
        posted_at: m.timestamp ?? null,
        likes: m.like_count ?? null,
        comments: m.comments_count ?? null,
        reach: stats.reach ?? null,
        saves: stats.saved ?? null,
        shares: stats.shares ?? null,
        views: stats.views ?? null,
        synced_at: new Date().toISOString(),
      }
    }),
  )
  if (rows.length) {
    const { error } = await admin.from('ig_media').upsert(rows)
    if (error) return fail(error.message, 500)
  }

  // Tick off planned posts that have now gone up, matched on the start of the caption.
  const { data: planned } = await admin.from('posts').select('id,caption').eq('posted', false).neq('caption', '')
  const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40)
  const live = new Set(rows.map((r) => key(r.caption)).filter((k) => k.length >= 12))
  const done = (planned ?? []).filter((p) => live.has(key(p.caption))).map((p) => p.id)
  if (done.length) await admin.from('posts').update({ posted: true }).in('id', done)

  return Response.json({ synced: rows.length, autoPosted: done.length }, { headers: cors })
})
