// Turns plain sentences into actions. Free and rule-based.
import { supabase } from '../supabase'

export interface Reminder {
  id: string
  text: string
  due_on: string | null
  done: boolean
}

const DAY = 86400000
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** Finds a date phrase in text. Returns the date and the text without it. */
export function pullDate(text: string): { date: string | null; rest: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const rules: [RegExp, (m: RegExpMatchArray) => Date | null][] = [
    [/\b(on |by )?today\b/i, () => today],
    [/\b(on |by )?tonight\b/i, () => today],
    [/\b(on |by )?tomorrow\b/i, () => new Date(today.getTime() + DAY)],
    [/\bin (\d+) days?\b/i, (m) => new Date(today.getTime() + Number(m[1]) * DAY)],
    [/\bnext week\b/i, () => new Date(today.getTime() + 7 * DAY)],
    [
      /\b(on |by |next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      (m) => {
        const want = WEEKDAYS.indexOf(m[2].toLowerCase())
        let add = (want - today.getDay() + 7) % 7
        if (add === 0) add = 7
        return new Date(today.getTime() + add * DAY)
      },
    ],
    [/\b(\d{4}-\d{2}-\d{2})\b/, (m) => new Date(`${m[1]}T00:00:00`)],
    [
      /\b(on |by )?(\d{1,2})(st|nd|rd|th)? (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i,
      (m) => {
        const d = new Date(today.getFullYear(), MONTHS.indexOf(m[4].toLowerCase()), Number(m[2]))
        if (d < today) d.setFullYear(d.getFullYear() + 1)
        return d
      },
    ],
  ]
  for (const [re, make] of rules) {
    const m = text.match(re)
    if (m) {
      const date = make(m)
      if (date) return { date: iso(date), rest: text.replace(m[0], '').replace(/\s{2,}/g, ' ').trim() }
    }
  }
  return { date: null, rest: text.trim() }
}

export function friendlyDate(isoDate: string | null): string {
  if (!isoDate) return 'no date'
  const d = new Date(`${isoDate}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / DAY)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function db() {
  if (!supabase) throw new Error('Not connected.')
  return supabase
}

export async function listReminders(): Promise<Reminder[]> {
  const { data, error } = await db().from('sandy_reminders').select('id,text,due_on,done').order('due_on', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data as Reminder[]
}

export async function addReminder(text: string, due_on: string | null): Promise<Reminder> {
  const { data, error } = await db().from('sandy_reminders').insert({ text, due_on }).select('id,text,due_on,done').single()
  if (error) throw error
  return data as Reminder
}

export async function setReminderDone(id: string, done: boolean): Promise<void> {
  const { error } = await db().from('sandy_reminders').update({ done }).eq('id', id)
  if (error) throw error
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await db().from('sandy_reminders').delete().eq('id', id)
  if (error) throw error
}
