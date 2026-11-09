// Sandy's AI brain. Groq (free tier, Llama 3.3 70B) with tools the Studio carries out.
import { createClient } from 'npm:@supabase/supabase-js@2'

const OWNER = 'cmkcaptures@gmail.com'
// Groq retires models over time, so pick the best one this key can use right now.
const PREFERRED = [/gpt-oss-120b/, /kimi-k2/, /llama-4-maverick/, /llama-3.3-70b/, /qwen.*32b/, /70b/, /gpt-oss-20b/]
let chosen: string | null = null
async function pickModel(key: string): Promise<string> {
  if (chosen) return chosen
  const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` } })
  const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id).filter((id: string) => !/whisper|tts|guard|embed|vision/i.test(id))
  for (const re of PREFERRED) {
    const hit = ids.find((id) => re.test(id))
    if (hit) return (chosen = hit)
  }
  return (chosen = ids[0] ?? 'openai/gpt-oss-120b')
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}
const fail = (error: string, status = 400) => Response.json({ error }, { status, headers: cors })

const PERSONA = `You are Sandy, the AI assistant inside PhotoFlow, the private studio app of CMK Captures: a London nightlife and event photographer (Instagram @cmk._7). You help him get bookings, stay on top of clients, plan Instagram posts and run the business.

How you talk: warm, quick, a bit of personality, casual UK English. Keep replies short (1-4 sentences or a tight list) unless he asks for detail. No corporate fluff. Never mention follower counts or follower growth; he doesn't want that.

What you know about the business: shoots club nights, events, artists and promoters in London. Sigma 35mm f1.4 and a Godox flash with trigger. Takes a 50% non-refundable deposit and delivers galleries within 48 hours. Gets work by pitching promoters and venues, and by posting consistently.

You can act. When he asks you to do something (remind, add a lead, add a client, open a section, tick off a reminder), call the matching tool, then confirm in one short line. Turn relative dates into YYYY-MM-DD using today's date from the context. If something is unclear, make a sensible guess rather than asking, unless guessing could cause a mistake. Give real advice when asked (pitch messages, captions, pricing, editing, shoot tips) using what you know about his situation. Base facts about his clients, leads and posts only on the context; don't invent data.`

const STOP = new Set('the a an and or but to of in on at for with is are was were be been it this that i me my you your we our do does did can could should would will what when where who how why about from as by so if just get got have has had not no yes hey sandy please'.split(' '))
const words = (s: string) => (s.toLowerCase().match(/[a-z0-9£@.]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w))

/** Picks the knowledge most relevant to the conversation, plus pinned core facts, within a size budget. */
function relevant(rows: { topic: string; title: string; body: string; pinned: boolean }[], query: string, budget = 7000): string {
  const q = new Set(words(query))
  const scored = rows.map((r) => {
    const text = words(`${r.topic} ${r.title} ${r.body}`)
    const title = words(r.title)
    let s = r.pinned ? 100 : 0
    for (const w of text) if (q.has(w)) s += 1
    for (const w of title) if (q.has(w)) s += 3
    return { r, s }
  })
  scored.sort((a, b) => b.s - a.s)
  let out = ''
  for (const { r, s } of scored) {
    if (s === 0 && out.length > budget * 0.6) break
    const line = `[${r.topic}] ${r.title}: ${r.body}\n`
    if (out.length + line.length > budget) continue
    out += line
  }
  return out
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Save a fact to your long-term memory when he tells you something worth knowing later (a rule, preference, contact, price, venue detail, lesson). Use when he says remember, note, or shares durable info.',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['me', 'business', 'gear', 'craft', 'style', 'growth', 'contacts', 'venues', 'studio', 'general'] },
          title: { type: 'string', description: 'Short label' },
          body: { type: 'string', description: 'The fact, written clearly in first person as him' },
        },
        required: ['title', 'body'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_reminder',
      description: 'Save a reminder for him.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' }, due_on: { type: 'string', description: 'YYYY-MM-DD or empty' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_reminder',
      description: 'Mark one of his open reminders as done.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_lead',
      description: 'Save a promoter, venue, artist, model or brand to pitch.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['promoter', 'venue', 'artist', 'model', 'brand'] },
          handle: { type: 'string', description: 'Instagram handle with @, or empty' },
          event_name: { type: 'string' },
          event_date: { type: 'string', description: 'YYYY-MM-DD or empty' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_client',
      description: 'Add a new client to his pipeline as an inquiry.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', description: 'e.g. Event, Club, Portrait, Birthday, Brand' },
          shoot_date: { type: 'string', description: 'YYYY-MM-DD or empty' },
          price: { type: 'string', description: 'e.g. £150, or empty' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_section',
      description: 'Take him to a section of the Studio.',
      parameters: {
        type: 'object',
        properties: { section: { type: 'string', enum: ['home', 'clients', 'outreach', 'posts', 'money'] } },
        required: ['section'],
      },
    },
  },
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '')
  const { data: who } = await admin.auth.getUser(jwt)
  if (who.user?.email !== OWNER) return fail('Not allowed.', 403)

  const env = Deno.env.toObject()
  const keyName = Object.keys(env).find((k) => k.trim().toUpperCase() === 'GROQ_API_KEY')
  const key = keyName ? env[keyName].trim() : ''
  if (!key) {
    const near = Object.keys(env).filter((k) => /groq/i.test(k)).map((k) => JSON.stringify(k))
    return fail(`Sandy has no brain key yet. Add GROQ_API_KEY in Supabase secrets.${near.length ? ' Found: ' + near.join(', ') : ''}`, 412)
  }

  const { messages, context } = await req.json()
  const lastAsk = (Array.isArray(messages) ? messages : []).filter((m: { role: string }) => m.role === 'user').slice(-2).map((m: { content: string }) => m.content).join(' ')
  const { data: brain } = await admin.from('sandy_knowledge').select('topic,title,body,pinned')
  const knowledge = relevant((brain ?? []) as { topic: string; title: string; body: string; pinned: boolean }[], lastAsk)
  const history = (Array.isArray(messages) ? messages : []).slice(-16).map((m: { role: string; content: string }) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: String(m.content).slice(0, 4000),
  }))

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: await pickModel(key),
      temperature: 0.6,
      max_tokens: 700,
      tools,
      tool_choice: 'auto',
      messages: [
        { role: 'system', content: PERSONA },
        { role: 'system', content: `What you know about him and the business (your memory; trust it over guesses):\n${knowledge || '(nothing saved yet)'}` },
        { role: 'system', content: `Live context (JSON):\n${JSON.stringify(context).slice(0, 9000)}` },
        ...history,
      ],
    }),
  })
  const body = await res.json()
  if (!res.ok) chosen = null
  if (!res.ok) return fail(body.error?.message ?? `Groq returned ${res.status}`, 502)

  const msg = body.choices?.[0]?.message ?? {}
  const actions = (msg.tool_calls ?? []).map((t: { function: { name: string; arguments: string } }) => {
    let args = {}
    try {
      args = JSON.parse(t.function.arguments || '{}')
    } catch {
      // Ignore malformed arguments; the Studio skips actions it can't run.
    }
    return { name: t.function.name, args }
  })
  return Response.json({ reply: msg.content ?? '', actions }, { headers: cors })
})
