// Reads an Instagram post/Insights screenshot with a free Groq vision model and logs the stats.
// No Instagram login or scraping: the user supplies their own screenshot.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER = 'cmkcaptures@gmail.com'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: cors })

let vision: string | null = null
async function visionModel(key: string): Promise<string> {
  if (vision) return vision
  const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id)
  for (const re of [/llama-4-maverick/, /llama-4-scout/, /vision/i, /llava/, /qwen.*vl/i, /gemma-?3/i, /pixtral/i, /-vl/i]) {
    const hit = ids.find((id) => re.test(id))
    if (hit) return (vision = hit)
  }
  throw new Error(`No vision model on this Groq key. Models: ${ids.join(', ')}`)
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).toLowerCase().replace(/,/g, '').trim()
  const m = s.match(/^([\d.]+)\s*([km])?/)
  if (!m) return null
  const n = parseFloat(m[1]) * (m[2] === 'k' ? 1000 : m[2] === 'm' ? 1_000_000 : 1)
  return Number.isFinite(n) ? Math.round(n) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: who } = await admin.auth.getUser(jwt)
  if (who.user?.email !== OWNER) return fail('Not allowed.', 403)

  const env = Deno.env.toObject()
  const key = Object.entries(env).find(([k]) => k.trim().toUpperCase() === 'GROQ_API_KEY')?.[1]?.trim()
  if (!key) return fail('Sandy has no brain key yet.', 412)

  const { image, text, thumb, today } = await req.json()
  if (!image && !text) return fail('No screenshot sent.')

  // Prefer reading the image directly; if this key has no vision model, use the text the browser read off it (OCR).
  let model = ''
  let useImage = false
  if (image) {
    try {
      model = await visionModel(key)
      useImage = true
    } catch {
      if (!text) return fail('Could not read the screenshot here. Try again in a moment.', 502)
    }
  }
  if (!useImage) {
    const res0 = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
    const ids: string[] = ((await res0.json()).data ?? []).map((m: { id: string }) => m.id)
    model = ids.find((id) => /gpt-oss-120b/.test(id)) ?? ids.find((id) => /qwen|llama|gpt-oss/.test(id)) ?? 'openai/gpt-oss-120b'
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: (() => {
            const ask = `${useImage ? 'This is a screenshot' : 'Below is text read (by OCR, so expect small mistakes and jumbled order) from a screenshot'} of one of my Instagram posts or its Insights page. Today is ${today}. Read the numbers exactly as shown. Reply with ONLY JSON: {"is_instagram": true/false, "likes": number|null, "comments": number|null, "saves": number|null, "shares": number|null, "reach": number|null (accounts reached), "views": number|null, "posted_on": "YYYY-MM-DD"|null (convert relative dates like "2 days ago" using today), "caption": first 80 characters of the caption or ""}. Use null for anything not visible. Numbers like 1.2K become 1200.`
            return useImage
              ? [
                  { type: 'text', text: ask },
                  { type: 'image_url', image_url: { url: image } },
                ]
              : `${ask}\n\nOCR TEXT:\n${String(text).slice(0, 4000)}`
          })(),
        },
      ],
    }),
  })
  const body = await res.json()
  if (!res.ok) return fail(body.error?.message ?? `Vision model returned ${res.status}`, 502)

  let read: Record<string, unknown> = {}
  try {
    read = JSON.parse(body.choices?.[0]?.message?.content ?? '{}')
  } catch {
    return fail("Couldn't read that screenshot. Try one that shows the post's numbers clearly.", 422)
  }
  if (read.is_instagram === false) return fail("That doesn't look like an Instagram post or Insights screen.", 422)

  const stats = { likes: num(read.likes), comments: num(read.comments), saves: num(read.saves), shares: num(read.shares), reach: num(read.reach), views: num(read.views) }
  if (Object.values(stats).every((v) => v === null)) return fail("Couldn't find any numbers on that screenshot.", 422)

  const caption = String(read.caption ?? '').slice(0, 200)
  const posted = /^\d{4}-\d{2}-\d{2}$/.test(String(read.posted_on)) ? `${read.posted_on}T20:00:00Z` : null

  // Same post screenshotted again (later, with more likes)? Update it instead of adding a duplicate.
  const { data: existing } = await admin.from('ig_media').select('id,caption').like('id', 'shot-%')
  const key40 = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 30)
  const match = caption.length >= 10 ? (existing ?? []).find((m: { caption: string }) => key40(m.caption) === key40(caption)) : undefined
  const id = match?.id ?? `shot-${crypto.randomUUID()}`
  const row: Record<string, unknown> = { id, media_type: 'IMAGE', synced_at: new Date().toISOString() }
  for (const [k, v] of Object.entries(stats)) if (v !== null) row[k] = v
  if (caption) row.caption = caption
  if (posted) row.posted_at = posted
  if (thumb) row.media_url = thumb
  if (!match) row.permalink = null

  const { error } = await admin.from('ig_media').upsert(row)
  if (error) return fail(error.message, 500)
  return Response.json({ id, updated: !!match, ...stats, caption, posted_on: read.posted_on ?? null, model }, { headers: cors })
})
