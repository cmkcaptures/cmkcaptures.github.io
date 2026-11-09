// Night-before brief: London forecast for the shoot evening (Open-Meteo, free, no key) and getting home.
export interface NightWeather {
  temp: number
  rain: number // max chance of rain 6pm-2am, %
  summary: string
}

const CODES: [number, string][] = [
  [0, 'clear'],
  [3, 'cloudy'],
  [48, 'foggy'],
  [57, 'drizzle'],
  [67, 'rain'],
  [77, 'snow'],
  [82, 'showers'],
  [99, 'thunderstorms'],
]

export async function nightWeather(dateISO: string): Promise<NightWeather | null> {
  try {
    const next = new Date(new Date(`${dateISO}T00:00:00`).getTime() + 86400000).toISOString().slice(0, 10)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=51.51&longitude=-0.13&hourly=temperature_2m,precipitation_probability,weather_code&timezone=Europe%2FLondon&start_date=${dateISO}&end_date=${next}`
    const res = await fetch(url)
    if (!res.ok) return null
    const h = (await res.json()).hourly as { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] }
    const idx = h.time.map((t, i) => ({ t, i })).filter(({ t }) => (t.startsWith(dateISO) && +t.slice(11, 13) >= 18) || (t.startsWith(next) && +t.slice(11, 13) <= 2)).map(({ i }) => i)
    if (!idx.length) return null
    const temps = idx.map((i) => h.temperature_2m[i])
    const rain = Math.max(...idx.map((i) => h.precipitation_probability[i] ?? 0))
    const code = Math.max(...idx.map((i) => h.weather_code[i] ?? 0))
    const summary = CODES.find(([c]) => code <= c)?.[1] ?? 'mixed'
    return { temp: Math.round(temps.reduce((a, b) => a + b, 0) / temps.length), rain, summary }
  } catch {
    return null
  }
}

/** How to get home after a night shoot. */
export function gettingHome(dateISO: string): string {
  const day = new Date(`${dateISO}T00:00:00`).getDay()
  return day === 5 || day === 6
    ? 'Night Tube runs tonight (Central, Jubilee, Northern, Piccadilly, Victoria). Night buses as backup.'
    : 'No Night Tube tonight: last trains are around 00:30, so check your last train or plan a night bus/Uber.'
}

export function weatherLine(w: NightWeather): string {
  return `${w.temp}°C, ${w.summary}${w.rain >= 30 ? `, ${w.rain}% chance of rain` : ''}`
}
