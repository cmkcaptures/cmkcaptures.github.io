// Sandy's brain: free, rule-based. Looks at everything and returns a short, ranked to-do list.
import { useEffect, useRef, useState } from 'react'
import type { Client } from '../types'
import { supabase } from '../supabase'
import { listLeads, FOLLOW_UP_DAYS } from '../growth'
import type { Lead } from '../growth'
import { fetchEvents } from './events'
import type { RadarEvent } from './events'
import { parseShootDate } from './time'
import type { NightWeather } from './nightBrief'
import { gettingHome, nightWeather, weatherLine } from './nightBrief'

export type NudgeGo = 'home' | 'clients' | 'outreach' | 'posts' | 'money'

export interface Nudge {
  id: string
  level: 'alert' | 'do' | 'idea'
  title: string
  detail: string
  go?: NudgeGo
  goLabel?: string
  checklist?: string[]
  events?: RadarEvent[]
}

const DAY = 86400000

export const SHOOT_PREP = [
  'Charge camera batteries + spare',
  'Charge the Godox trigger + flash',
  'Format memory cards',
  'Clean the Sigma 35mm',
  'Confirm time, venue and contact',
  'Know who to tag (artists, venue, promoter)',
  'Check the deposit is in',
]

export const AFTER_SHOOT = [
  'Back up the cards (two places)',
  'Cull in Lightroom',
  'Edit the picks',
  'Upload to the client gallery',
  'Post a sneak peek within 24h',
  'Send the gallery + ask for a review',
]

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

function daysFromToday(date: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / DAY)
}

interface World {
  weather: Record<string, NightWeather | null>
  reminders: { id: string; text: string; due_on: string | null }[]
  clients: Client[]
  leads: Lead[]
  events: RadarEvent[]
  posts: { photos: { url: string }[]; post_on: string | null; posted: boolean; created_at: string }[]
  galleries: { id: string; client_id: string; created_at: string; photos: number }[]
}

export function think(w: World): Nudge[] {
  const out: Nudge[] = []
  const todayIso = new Date().toISOString().slice(0, 10)
  for (const r of w.reminders)
    if (r.due_on && r.due_on <= todayIso)
      out.push({ id: `rem-${r.id}`, level: 'alert', title: r.text, detail: r.due_on < todayIso ? 'Reminder, overdue.' : 'Reminder for today.' })
  const shoots = w.clients
    .map((c) => ({ c, date: parseShootDate(c.shootDate) }))
    .filter((s): s is { c: Client; date: Date } => !!s.date)

  // Shoot prep: anything in the next 2 days.
  for (const { c, date } of shoots) {
    const d = daysFromToday(date)
    if (d >= 0 && d <= 2 && c.stage === 'booked')
      out.push({
        id: `prep-${c.id}`,
        level: 'alert',
        title: `${c.name} shoot ${d === 0 ? 'today' : d === 1 ? 'tomorrow' : 'in 2 days'}`,
        detail: [
          c.depositPaid ? 'Run through your kit list.' : 'Deposit not in yet. Chase it, then prep your kit.',
          w.weather[iso(date)] ? `Weather: ${weatherLine(w.weather[iso(date)]!)}.` : '',
          gettingHome(iso(date)),
        ]
          .filter(Boolean)
          .join(' '),
        checklist: [
          ...SHOOT_PREP,
          ...((w.weather[iso(date)]?.rain ?? 0) >= 40 ? ['Rain cover / bag for the camera'] : []),
          ...((w.weather[iso(date)]?.temp ?? 20) <= 6 ? ['Spare batteries warm in a pocket (cold drains them)'] : []),
          'Plan the journey home',
        ],
        go: 'clients',
        goLabel: 'Open clients',
      })
  }

  // After-shoot: shoot happened but still marked booked/shot.
  for (const { c, date } of shoots) {
    const d = daysFromToday(date)
    if (d < 0 && d >= -14 && (c.stage === 'booked' || c.stage === 'shot'))
      out.push({
        id: `after-${c.id}`,
        level: d <= -2 ? 'alert' : 'do',
        title: `Finish ${c.name}'s shoot`,
        detail: d <= -2 ? `Shot ${-d} days ago. Your 48h delivery promise is due.` : 'Shot yesterday. Get it backed up and culled.',
        checklist: AFTER_SHOOT,
        go: 'clients',
        goLabel: 'Open clients',
      })
  }

  // Post reminders: galleries with nothing pulled into Posts yet.
  const used = w.posts.flatMap((p) => p.photos.map((ph) => ph.url))
  const names = new Map(w.clients.map((c) => [c.id, c.name]))
  const unposted = w.galleries.filter((g) => g.photos > 0 && !used.some((u) => u.includes(`/galleries/${g.id}/`)))
  if (unposted.length)
    out.push({
      id: `gal-${unposted.map((g) => g.id).join('')}`,
      level: 'do',
      title: `${unposted.length} galler${unposted.length === 1 ? 'y' : 'ies'} with nothing posted`,
      detail: `${unposted
        .slice(0, 3)
        .map((g) => names.get(g.client_id) ?? 'A client')
        .join(', ')}. Use Sandy's picks to grab the best shots.`,
      go: 'posts',
      goLabel: 'Go to Posts',
    })

  // Posting rhythm for the next 7 days.
  const today = new Date().toISOString().slice(0, 10)
  const weekEnd = new Date(Date.now() + 6 * DAY).toISOString().slice(0, 10)
  const planned = w.posts.filter((p) => !p.posted && p.post_on && p.post_on >= today && p.post_on <= weekEnd).length
  const waiting = w.posts.filter((p) => !p.posted && !p.post_on).length
  if (planned < 3)
    out.push({
      id: `rhythm-${today}`,
      level: planned === 0 ? 'alert' : 'do',
      title: planned === 0 ? 'Nothing planned to post this week' : `Only ${planned} post${planned === 1 ? '' : 's'} planned this week`,
      detail: waiting ? `You've got ${waiting} ready. Drag them onto days.` : 'Aim for 3. Pull some from a gallery.',
      go: 'posts',
      goLabel: 'Plan posts',
    })

  // Quiet week: no shoots in the next 7 days.
  const soon = shoots.filter(({ date }) => {
    const d = daysFromToday(date)
    return d >= 0 && d <= 7
  })
  const picks = w.events.filter((e) => !w.leads.some((l) => l.event_name === e.name)).slice(0, 3)
  if (!soon.length)
    out.push({
      id: `quiet-${today}`,
      level: 'alert',
      title: 'Quiet week ahead',
      detail: picks.length ? 'No shoots booked for 7 days. Pitch one of these:' : 'No shoots booked for 7 days. Message some leads.',
      events: picks,
      go: 'outreach',
      goLabel: 'Open Outreach',
    })
  else if (picks.length)
    out.push({ id: `events-${today}`, level: 'idea', title: 'Events worth pitching', detail: 'Fresh London nights from the radar.', events: picks, go: 'outreach', goLabel: 'All events' })

  // Leads waiting on a follow-up.
  const due = w.leads.filter((l) => l.status === 'messaged' && l.follow_up_on && l.follow_up_on <= today)
  if (due.length)
    out.push({
      id: `follow-${today}`,
      level: 'do',
      title: `${due.length} lead${due.length === 1 ? '' : 's'} to follow up`,
      detail: `${due.slice(0, 3).map((l) => l.name).join(', ')} — it's been ${FOLLOW_UP_DAYS}+ days.`,
      go: 'outreach',
      goLabel: 'Follow up',
    })

  // Rebooks.
  for (const c of w.clients)
    if (c.rebookOn && c.rebookOn <= today)
      out.push({ id: `rebook-${c.id}`, level: 'idea', title: `Time to rebook ${c.name}`, detail: 'You set a reminder for around now.', go: 'clients', goLabel: 'Open clients' })

  const rank = { alert: 0, do: 1, idea: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level])
}

export function useSandyBrain(clients: Client[]): Nudge[] {
  const [rest, setRest] = useState<Omit<World, 'clients'> | null>(null)
  const clientsRef = useRef(clients)
  clientsRef.current = clients

  useEffect(() => {
    let alive = true
    async function load() {
      const [reminders, leads, events, posts, galleries] = await Promise.all([
        supabase?.from('sandy_reminders').select('id,text,due_on').eq('done', false).then((r) => r.data ?? []) ?? [],
        listLeads().catch(() => []),
        fetchEvents().catch(() => []),
        supabase?.from('posts').select('photos,post_on,posted,created_at').then((r) => r.data ?? []) ?? [],
        supabase?.from('galleries').select('id,client_id,created_at,gallery_photos(count)').then((r) => r.data ?? []) ?? [],
      ])
      const soon = clientsRef.current
        .map((c) => (c.stage === 'booked' ? parseShootDate(c.shootDate) : null))
        .filter((d): d is Date => !!d && daysFromToday(d) >= 0 && daysFromToday(d) <= 2)
        .map(iso)
      const weather: World['weather'] = {}
      for (const d of [...new Set(soon)]) weather[d] = await nightWeather(d)
      if (!alive) return
      setRest({
        weather,
        reminders: reminders as World['reminders'],
        leads,
        events,
        posts: posts as World['posts'],
        galleries: (galleries as { id: string; client_id: string; created_at: string; gallery_photos: { count: number }[] }[]).map((g) => ({
          id: g.id,
          client_id: g.client_id,
          created_at: g.created_at,
          photos: g.gallery_photos[0]?.count ?? 0,
        })),
      })
    }
    load()
    const id = setInterval(load, 5 * 60000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return rest ? think({ clients, ...rest }) : []
}
