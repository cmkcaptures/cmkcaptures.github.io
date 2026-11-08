import { supabase } from '../supabase'

export interface RadarEvent {
  id: string
  name: string
  date: string
  venue: string
  area: string
  link: string
  description: string
}

// Skiddle lists lots of nights that will never hire a photographer.
const NOISE = /pub crawl|bingo|brunch|quiz|karaoke|comedy|arcade|walking tour|bar crawl/i

export async function fetchEvents(): Promise<RadarEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase.functions.invoke('event-radar')
  if (error) throw error
  const events = (data?.events ?? []) as RadarEvent[]
  return events.filter((e) => !NOISE.test(`${e.name} ${e.venue}`))
}

export function initialsOf(text: string): string {
  return (
    text
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '•'
  )
}
