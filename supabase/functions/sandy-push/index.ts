// Sandy's phone alerts. Runs on a schedule (pg_cron) and on demand ("Send a test").
// Builds a short digest from reminders, clients and planned posts, then Web Pushes it.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const OWNER = 'cmkcaptures@gmail.com'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: cors })
const DAY = 86400000

async function eveningWeather(date: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13&hourly=temperature_2m,precipitation_probability&timezone=Europe%2FLondon&start_date=${date}&end_date=${date}`,
    )
    const h = (await res.json()).hourly as { time: string[]; temperature_2m: number[]; precipitation_probability: number[] }
    const idx = h.time.map((t, i) => (+t.slice(11, 13) >= 18 ? i : -1)).filter((i) => i >= 0)
    const temp = Math.round(idx.reduce((s, i) => s + h.temperature_2m[i], 0) / idx.length)
    const rain = Math.max(...idx.map((i) => h.precipitation_probability[i] ?? 0))
    return ` ${temp}°C${rain >= 30 ? `, ${rain}% rain` : ''}.`
  } catch {
    return ''
  }
}

function homeTip(date: string): string {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay()
  return d === 5 || d === 6 ? ' Night Tube is running.' : ' No Night Tube, so check your last train.'
}

function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
}

function parseShoot(text: string): string | null {
  if (!text) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text)
  if (Number.isNaN(d.getTime())) return null
  if (d.getFullYear() < 2020) d.setFullYear(new Date().getFullYear())
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const body = await req.json().catch(() => ({}))
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  // The schedule passes a random secret that only lives in the database (no policies, service role only).
  const given = req.headers.get('x-cron-secret')
  const { data: secret } = given ? await admin.from('app_secrets').select('value').eq('name', 'push_cron').maybeSingle() : { data: null }
  const cronOk = !!given && !!secret?.value && given === secret.value
  if (!cronOk) {
    const { data: who } = await admin.auth.getUser(jwt)
    if (who.user?.email !== OWNER) return fail('Not allowed.', 403)
  }

  // Push keys are generated once and kept server-side (app_secrets has no policies).
  const { data: keys } = await admin.from('app_secrets').select('name,value').in('name', ['vapid_public', 'vapid_private'])
  let pub = keys?.find((k) => k.name === 'vapid_public')?.value
  let priv = keys?.find((k) => k.name === 'vapid_private')?.value
  if (!pub || !priv) {
    const made = webpush.generateVAPIDKeys()
    pub = made.publicKey
    priv = made.privateKey
    await admin.from('app_secrets').upsert([{ name: 'vapid_public', value: pub }, { name: 'vapid_private', value: priv }])
  }
  if (body.publicKey) return Response.json({ publicKey: pub }, { headers: cors })
  webpush.setVapidDetails('mailto:cmkcaptures@gmail.com', pub, priv)

  const today = londonToday()
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + DAY).toISOString().slice(0, 10)
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * DAY).toISOString().slice(0, 10)
  const lines: string[] = []

  if (!body.test) {
    const [{ data: rems }, { data: recs }, { data: posts }] = await Promise.all([
      admin.from('sandy_reminders').select('text,due_on').eq('done', false).lte('due_on', today),
      admin.from('studio_records').select('data').eq('kind', 'client'),
      admin.from('posts').select('post_on').eq('posted', false),
    ])
    for (const r of rems ?? []) lines.push(`⏰ ${r.text}`)
    for (const { data: c } of (recs ?? []) as { data: Record<string, string> }[]) {
      const shoot = parseShoot(c.shootDate)
      if (!shoot) continue
      if (c.stage === 'booked' && shoot === tomorrow) lines.push(`📸 ${c.name} shoot tomorrow.${await eveningWeather(tomorrow)}${homeTip(tomorrow)} Charge batteries, format cards.`)
      if (c.stage === 'booked' && shoot === today) lines.push(`📸 ${c.name} shoot today. Go get it.`)
      const late = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${shoot}T00:00:00Z`)) / DAY
      if ((c.stage === 'booked' || c.stage === 'shot') && late >= 2 && late <= 14) lines.push(`⚠️ ${c.name}'s gallery is due (shot ${late} days ago).`)
    }
    const planned = (posts ?? []).filter((p: { post_on: string | null }) => p.post_on && p.post_on >= today && p.post_on <= weekEnd).length
    const postingToday = (posts ?? []).some((p: { post_on: string | null }) => p.post_on === today)
    if (postingToday) lines.push('📱 You planned a post for today.')
    else if (planned === 0 && new Date().getUTCDay() === 1) lines.push('📱 Nothing planned to post this week.')
    if (!lines.length) return Response.json({ sent: 0, reason: 'nothing to say' }, { headers: cors })
  }

  const payload = JSON.stringify(
    body.test
      ? { title: 'Sandy', body: "Phone alerts are on. I'll ping you when something needs you.", tag: 'test' }
      : { title: lines.length === 1 ? 'Sandy' : `Sandy · ${lines.length} things`, body: lines.slice(0, 4).join('\n'), tag: `digest-${today}` },
  )

  const { data: subs } = await admin.from('push_subs').select('endpoint,sub')
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.sub, payload)
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint)
    }
  }
  return Response.json({ sent, lines: lines.length }, { headers: cors })
})
