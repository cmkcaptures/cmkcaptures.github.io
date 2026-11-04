import { supabase } from './supabase'
import { addDaysISO, todayISO } from './invoiceTypes'
import { firstName } from './types'

export type LeadStatus = 'to_contact' | 'messaged' | 'replied' | 'booked' | 'passed'
export type LeadKind = 'promoter' | 'venue' | 'artist' | 'model' | 'brand'

export interface Lead {
  id: string
  name: string
  kind: LeadKind
  handle: string
  event_name: string
  event_date: string
  status: LeadStatus
  watching: boolean
  follow_up_on: string | null
  notes: string
}

export const LEAD_STATUSES: { key: LeadStatus; label: string }[] = [
  { key: 'to_contact', label: 'To contact' },
  { key: 'messaged', label: 'Messaged' },
  { key: 'replied', label: 'Replied' },
  { key: 'booked', label: 'Booked' },
  { key: 'passed', label: 'Passed' },
]

export const LEAD_KINDS: LeadKind[] = ['promoter', 'venue', 'artist', 'model', 'brand']
export const FOLLOW_UP_DAYS = 3

const SITE = 'https://cmkcaptures.github.io'

function db() {
  if (!supabase) throw new Error('Supabase is not connected.')
  return supabase
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await db().from('leads').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Lead[]
}

export async function addLead(lead: Pick<Lead, 'name' | 'kind' | 'handle' | 'event_name' | 'event_date'>): Promise<Lead> {
  const { data, error } = await db().from('leads').insert(lead).select().single()
  if (error) throw error
  return data as Lead
}

export async function updateLead(id: string, changes: Partial<Lead>): Promise<Lead> {
  const { data, error } = await db().from('leads').update(changes).eq('id', id).select().single()
  if (error) throw error
  return data as Lead
}

export async function deleteLead(id: string): Promise<void> {
  const { error } = await db().from('leads').delete().eq('id', id)
  if (error) throw error
}

export function isFollowUpDue(lead: Lead): boolean {
  return lead.status === 'messaged' && !!lead.follow_up_on && lead.follow_up_on <= todayISO()
}

export function messagedChanges(): Partial<Lead> {
  return { status: 'messaged', follow_up_on: addDaysISO(todayISO(), FOLLOW_UP_DAYS) }
}

export function draftMessage(lead: Lead): string {
  const name = firstName(lead.name)
  if (isFollowUpDue(lead)) {
    return `Yo ${name}, just checking you saw my message about shooting${lead.event_name ? ` ${lead.event_name}` : ' your next one'}. Still down if you need someone 🙏🏽`
  }
  const event = lead.event_name ? `${lead.event_name} looks like it's gonna go off` : 'been seeing what you\'re doing and it looks hard'
  const work = `Here's my work: ${SITE}`
  switch (lead.kind) {
    case 'venue':
      return `Yo, I'm a London event photographer and I'd love to shoot some nights at ${lead.name}. Fast turnaround, and you get photos ready for your socials. ${work}. Who's best to speak to?`
    case 'artist':
      return `Yo ${name}, ${event}. I shoot live music and artist portraits in London, and I think I could get you some strong shots. ${work}. Down to link?`
    case 'model':
      return `Yo ${name}, love your look. I shoot flash portraits and editorial in London, and I'd like to work with you on a shoot. ${work}. You interested?`
    case 'brand':
      return `Yo, love what ${lead.name} is doing. I shoot events and content in London and I think I could get you some strong photos. ${work}. Who's best to speak to?`
    default:
      return `Yo ${name}, ${event}. I shoot nightlife and events in London with next-day delivery, ready for your socials. ${work}. You got a photographer sorted?`
  }
}
