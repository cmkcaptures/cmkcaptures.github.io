// Shared call to Sandy's AI brain (sandy-chat edge function) and the actions it can request.
import { supabase } from '../supabase'
import { addLead } from '../growth'
import type { Lead } from '../growth'
import { addReminder, friendlyDate, setReminderDone } from './sandyCommands'
import type { NudgeGo } from './sandyBrain'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface SandyHands {
  addClient: (name: string, shootDate: string, price: string, type: string) => void
  go: (view: NudgeGo) => void
}

async function act(name: string, args: Record<string, string>, hands: SandyHands): Promise<string | null> {
  if (name === 'add_reminder' && args.text) {
    const r = await addReminder(args.text, args.due_on || null)
    return `Reminder saved: ${r.text} (${friendlyDate(r.due_on)}).`
  }
  if (name === 'complete_reminder' && args.id) {
    await setReminderDone(args.id, true)
    return 'Ticked that off.'
  }
  if (name === 'add_lead' && args.name) {
    const kind = (['promoter', 'venue', 'artist', 'model', 'brand'].includes(args.kind) ? args.kind : 'promoter') as Lead['kind']
    const lead = await addLead({ name: args.name, kind, handle: args.handle ?? '', event_name: args.event_name ?? '', event_date: args.event_date ?? '' })
    return `Added ${lead.name} to your leads.`
  }
  if (name === 'add_client' && args.name) {
    hands.addClient(args.name, args.shoot_date ?? '', args.price ?? '', args.type ?? '')
    return `${args.name} is in your pipeline.`
  }
  if (name === 'open_section' && args.section) {
    setTimeout(() => hands.go(args.section as NudgeGo), 900)
    return null
  }
  return null
}

/** Ask the AI. Throws if the brain is unreachable so callers can fall back to rules. */
export async function askSandy(history: ChatTurn[], context: unknown, hands: SandyHands): Promise<string> {
  if (!supabase) throw new Error('offline')
  const { data, error } = await supabase.functions.invoke('sandy-chat', { body: { messages: history.slice(-16), context } })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
  const done: string[] = []
  for (const a of (data.actions ?? []) as { name: string; args: Record<string, string> }[]) {
    const note = await act(a.name, a.args ?? {}, hands)
    if (note) done.push(note)
  }
  return (data.reply as string)?.trim() || done.join(' ') || 'Done.'
}
