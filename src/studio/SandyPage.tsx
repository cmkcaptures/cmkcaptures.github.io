import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SandyAnswer } from './Sandy'
import { SandyFace } from './Sandy'
import type { Nudge, NudgeGo } from './sandyBrain'
import type { Reminder } from './sandyCommands'
import { addReminder, deleteReminder, friendlyDate, listReminders, pullDate, setReminderDone } from './sandyCommands'
import { addLead, listLeads } from '../growth'
import type { Lead } from '../growth'
import type { Client } from '../types'
import { paymentStatus } from '../types'
import { supabase } from '../supabase'
import PushCard from './PushCard'
import BrainPanel from './BrainPanel'
import './SandyPage.css'

interface Msg {
  from: 'me' | 'bot'
  text: string
  at: number
}

interface Props {
  clients: Client[]
  nudges: Nudge[]
  answers: SandyAnswer[]
  onGo: (view: NudgeGo) => void
  onAddClient: (name: string, shootDate: string, price: string, type: string) => void
}

const LOG_KEY = 'sandy.log'
const QUICK = ['Plan my week', 'What should I post?', 'Events to pitch', 'Remind me to ', 'Add lead ', 'Add client ']

function loadLog(): Msg[] {
  try {
    return (JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]') as Msg[]).map((m) => ({ ...m, from: m.from === 'me' ? 'me' : 'bot' }))
  } catch {
    return []
  }
}

export default function SandyPage({ clients, nudges, answers, onGo, onAddClient }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [brain, setBrain] = useState<'ai' | 'rules'>('ai')
  const [log, setLog] = useState<Msg[]>(loadLog)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'idle' | 'thinking' | 'talking' | 'learning'>('idle')
  const [reminders, setReminders] = useState<Reminder[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listReminders().then(setReminders).catch(() => {})
    listLeads().then(setLeads).catch(() => {})
  }, [])

  function context() {
    const now = new Date()
    return {
      today: now.toISOString().slice(0, 10),
      weekday: now.toLocaleDateString('en-GB', { weekday: 'long' }),
      time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      clients: clients.map((c) => ({ name: c.name, stage: c.stage, type: c.type, shoot: c.shootDate, price: c.price, payment: paymentStatus(c), notes: c.notes.slice(0, 200) })),
      leads: leads.slice(0, 40).map((l) => ({ name: l.name, kind: l.kind, handle: l.handle, status: l.status, event: l.event_name, follow_up_on: l.follow_up_on })),
      reminders: reminders.filter((r) => !r.done).map((r) => ({ id: r.id, text: r.text, due_on: r.due_on })),
      todo: nudges.map((n) => ({ level: n.level, title: n.title, detail: n.detail, events: n.events?.map((e) => `${e.name} at ${e.venue}, ${e.date}`) })),
    }
  }

  async function run(name: string, args: Record<string, string>): Promise<string | null> {
    if (name === 'remember' && args.body) {
      const { error } = await supabase!.from('sandy_knowledge').insert({ topic: args.topic || 'general', title: args.title || args.body.slice(0, 40), body: args.body })
      if (error) throw error
      return `Got it, I'll remember that.`
    }
    if (name === 'add_reminder' && args.text) {
      const r = await addReminder(args.text, args.due_on || null)
      setReminders((list) => [...list, r])
      return `Reminder saved: ${r.text} (${friendlyDate(r.due_on)}).`
    }
    if (name === 'complete_reminder' && args.id) {
      setReminders((list) => list.map((x) => (x.id === args.id ? { ...x, done: true } : x)))
      await setReminderDone(args.id, true)
      return 'Ticked that off.'
    }
    if (name === 'add_lead' && args.name) {
      const kind = (['promoter', 'venue', 'artist', 'model', 'brand'].includes(args.kind) ? args.kind : 'promoter') as Lead['kind']
      const lead = await addLead({ name: args.name, kind, handle: args.handle ?? '', event_name: args.event_name ?? '', event_date: args.event_date ?? '' })
      setLeads((l) => [lead, ...l])
      return `Added ${lead.name} to your leads.`
    }
    if (name === 'add_client' && args.name) {
      onAddClient(args.name, args.shoot_date ?? '', args.price ?? '', args.type ?? '')
      return `${args.name} is in your pipeline.`
    }
    if (name === 'open_section' && args.section) {
      setTimeout(() => onGo(args.section as NudgeGo), 900)
      return null
    }
    return null
  }

  async function think(history: Msg[]): Promise<string> {
    if (!supabase) throw new Error('offline')
    const { data, error } = await supabase.functions.invoke('sandy-chat', {
      body: { messages: history.slice(-16).map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text })), context: context() },
    })
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
      throw new Error(body?.error ?? error.message)
    }
    const done: string[] = []
    for (const a of (data.actions ?? []) as { name: string; args: Record<string, string> }[]) {
      const note = await run(a.name, a.args ?? {})
      if (note) done.push(note)
    }
    return (data.reply as string)?.trim() || done.join(' ') || 'Done.'
  }

  useEffect(() => {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-60)))
    } catch {
      // History is a convenience only.
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [log])

  useEffect(() => {
    if (mode !== 'talking') return
    const id = setTimeout(() => setMode('idle'), 2400)
    return () => clearTimeout(id)
  }, [mode])

  function reply(text: string) {
    setLog((l) => [...l, { from: 'bot', text, at: Date.now() }])
    setMode('talking')
  }

  async function handle(raw: string): Promise<string> {
    const q = raw.trim()
    let m: RegExpMatchArray | null

    if ((m = q.match(/^remind me (to |about )?(.+)$/i))) {
      const { date, rest } = pullDate(m[2])
      const r = await addReminder(rest, date)
      setReminders((list) => [...list, r])
      return `Got it. I'll remind you to ${rest} ${date ? friendlyDate(date) : 'when you next check in'}.`
    }
    if ((m = q.match(/^(add|new) lead (.+)$/i))) {
      const { date, rest } = pullDate(m[2])
      const handle = rest.match(/@[\w.]+/)?.[0] ?? ''
      const name = rest.replace(handle, '').replace(/\s{2,}/g, ' ').trim() || handle
      await addLead({ name, kind: 'promoter', handle, event_name: '', event_date: date ?? '' })
      return `Added ${name} to your leads. Copy their message in Outreach.`
    }
    if ((m = q.match(/^(add|new) client (.+)$/i))) {
      const { date, rest } = pullDate(m[2])
      const price = rest.match(/£\s?\d+/)?.[0]?.replace(/\s/g, '') ?? ''
      const type = rest.match(/\b(event|club|portrait|birthday|wedding|brand|music video|party)\b/i)?.[0] ?? ''
      const name = rest.replace(price, '').replace(type, '').replace(/\b(for|on|at)\b/gi, '').replace(/\s{2,}/g, ' ').trim()
      if (!name) return 'Who? Try "add client Sam event 12 Dec £150".'
      onAddClient(name, date ?? '', price, type ? type[0].toUpperCase() + type.slice(1).toLowerCase() : '')
      return `${name} is in your pipeline as an inquiry${date ? `, shoot ${friendlyDate(date)}` : ''}${price ? `, ${price}` : ''}.`
    }
    if (/remind|reminder|remember/i.test(q)) {
      const open = reminders.filter((r) => !r.done)
      return open.length ? open.map((r) => `${r.text} (${friendlyDate(r.due_on)})`).join(' · ') : 'No reminders. Say "remind me to … tomorrow".'
    }
    if (/^(go to|open|show) (home|clients|outreach|posts|money)/i.test(q)) {
      const view = q.match(/home|clients|outreach|posts|money/i)![0].toLowerCase() as NudgeGo
      onGo(view)
      return `Opening ${view}.`
    }
    if (/plan|week|to ?do|today/i.test(q)) {
      return nudges.length ? nudges.slice(0, 4).map((n, i) => `${i + 1}. ${n.title}`).join('\n') : "You're clear. Good time to pitch an event."
    }
    if (/event|pitch|gig|club/i.test(q)) {
      const ev = nudges.flatMap((n) => n.events ?? []).slice(0, 3)
      return ev.length ? `Worth a pitch:\n${ev.map((e) => `• ${e.name} (${e.venue})`).join('\n')}\nSay "add lead" + their name to save one.` : 'No fresh events right now.'
    }
    const found = answers.find((a) => a.match.test(q))
    if (found) return found.reply()
    return 'I can: remind you of things, add clients and leads, plan your week, find events, and open any section. Try "remind me to edit Mango tomorrow".'
  }

  async function send(e?: FormEvent, text = input) {
    e?.preventDefault()
    const q = text.trim()
    if (!q) return
    setInput('')
    const mine: Msg = { from: 'me', text: q, at: Date.now() }
    setLog((l) => [...l, mine])
    setMode('thinking')
    try {
      let answer: string
      try {
        answer = await think([...log, mine])
        setBrain('ai')
      } catch {
        setBrain('rules')
        answer = await handle(q)
      }
      setTimeout(() => reply(answer), 350)
    } catch (err) {
      reply(`That didn't save: ${(err as Error).message}`)
    }
  }

  function quick(q: string) {
    if (q.endsWith(' ')) {
      setInput(q)
      inputRef.current?.focus()
    } else send(undefined, q)
  }

  async function toggle(r: Reminder) {
    setReminders((list) => list.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)))
    setReminderDone(r.id, !r.done).catch(() => {})
    if (!r.done) setMode('learning')
  }

  async function remove(r: Reminder) {
    setReminders((list) => list.filter((x) => x.id !== r.id))
    deleteReminder(r.id).catch(() => {})
  }

  const open = reminders.filter((r) => !r.done)
  const done = reminders.filter((r) => r.done)

  return (
    <div className="sp">
      <section className="sp-hero">
        <div className={`sp-bot sandy-bot mode-${mode}`}>
          <SandyFace />
        </div>
        <div>
          <h1>Sandy</h1>
          <p className="sp-status">
            <i className={`sp-led ${mode}`} />
            {brain === 'rules' && <em className="sp-brain">basic mode</em>}
            {mode === 'thinking' ? 'Thinking…' : mode === 'talking' ? 'Talking' : mode === 'learning' ? 'Learning' : `Watching ${nudges.length ? `${nudges.length} thing${nudges.length === 1 ? '' : 's'}` : 'everything'} for you`}
          </p>
        </div>
      </section>

      <div className="sp-grid">
        <section className="sp-chat">
          <div className="sp-log" aria-live="polite">
            {log.length === 0 && <p className="sp-hello">Hey! Tell me what to do, like “remind me to send Mango's gallery tomorrow”.</p>}
            {log.map((m, i) => (
              <div key={i} className={`sp-msg ${m.from}`}>
                {m.text}
              </div>
            ))}
            {mode === 'thinking' && (
              <div className="sp-msg bot typing">
                <i />
                <i />
                <i />
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="sp-quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => quick(q)}>
                {q.trim()}
                {q.endsWith(' ') ? '…' : ''}
              </button>
            ))}
            {log.length > 0 && (
              <button className="sp-clear" onClick={() => setLog([])}>
                Clear chat
              </button>
            )}
          </div>
          <form className="sp-input" onSubmit={send}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Tell Sandy what to do…" aria-label="Message Sandy" />
            <button className="btn-brass" type="submit" disabled={!input.trim()}>
              Send
            </button>
          </form>
        </section>

        <aside className="sp-side">
          <PushCard />
          <section className="sp-card">
            <h2>On her radar</h2>
            {nudges.length === 0 && <p className="st-empty">All clear.</p>}
            {nudges.slice(0, 6).map((n, i) => (
              <button key={n.id} className={`sp-nudge lvl-${n.level}`} onClick={() => n.go && onGo(n.go)} style={{ animationDelay: `${i * 0.05}s` }}>
                <i />
                <span>
                  <b>{n.title}</b>
                  <small>{n.detail}</small>
                </span>
              </button>
            ))}
          </section>

          <section className="sp-card">
            <h2>Reminders</h2>
            {open.length === 0 && <p className="st-empty">Nothing yet. Say “remind me to …”.</p>}
            {open.map((r) => (
              <div key={r.id} className={`sp-rem${r.due_on && r.due_on <= new Date().toISOString().slice(0, 10) ? ' due' : ''}`}>
                <input type="checkbox" checked={false} onChange={() => toggle(r)} aria-label={`Done: ${r.text}`} />
                <span>
                  {r.text}
                  <small>{friendlyDate(r.due_on)}</small>
                </span>
                <button onClick={() => remove(r)} aria-label="Delete reminder">
                  ×
                </button>
              </div>
            ))}
            {done.length > 0 && (
              <details className="sp-done">
                <summary>{done.length} done</summary>
                {done.map((r) => (
                  <div key={r.id} className="sp-rem done">
                    <input type="checkbox" checked onChange={() => toggle(r)} aria-label={`Not done: ${r.text}`} />
                    <span>{r.text}</span>
                    <button onClick={() => remove(r)} aria-label="Delete reminder">
                      ×
                    </button>
                  </div>
                ))}
              </details>
            )}
          </section>
        </aside>
      </div>
      <BrainPanel />
    </div>
  )
}
