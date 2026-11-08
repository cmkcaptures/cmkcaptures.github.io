// Returns upcoming London events from Skiddle so the Studio can turn them into leads.
const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const RADIUS_MILES = 10

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const url = new URL('https://www.skiddle.com/api/v1/events/search/')
  url.search = new URLSearchParams({
    api_key: Deno.env.get('SKIDDLE_API_KEY') ?? '',
    latitude: String(LONDON.latitude),
    longitude: String(LONDON.longitude),
    radius: String(RADIUS_MILES),
    eventcode: new URL(req.url).searchParams.get('type') ?? 'CLUB',
    order: 'date',
    description: '1',
    limit: '100',
  }).toString()

  const res = await fetch(url)
  const body = await res.json()
  if (!res.ok || body.error) {
    return Response.json({ error: body.errormessage ?? `Skiddle returned ${res.status}` }, { status: 502, headers: cors })
  }

  const events = (body.results ?? []).map((e: Record<string, any>) => ({
    id: String(e.id),
    name: e.eventname,
    date: e.date,
    venue: e.venue?.name ?? '',
    area: e.venue?.town ?? '',
    link: e.link,
    image: e.imageurl ?? '',
    description: (e.description ?? '').slice(0, 300),
  }))
  return Response.json({ total: Number(body.totalcount ?? events.length), events }, { headers: cors })
})
