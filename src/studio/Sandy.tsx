import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Nudge, NudgeGo } from './sandyBrain'
import type { ChatTurn } from './sandyAI'
import Debrief from './Debrief'
import { addLead } from '../growth'

const store = {
  get<T>(key: string, fallback: T): T {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '') as T
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Ticks are a convenience; losing them is fine.
    }
  },
}

export type SandyMode = 'idle' | 'thinking' | 'talking' | 'learning' | 'alert'

export interface SandyAnswer {
  match: RegExp
  reply: () => string
}

interface Props {
  tips: string[]
  urgent: boolean
  answers: SandyAnswer[]
  nudges: Nudge[]
  onGo: (view: NudgeGo) => void
  ai?: (history: ChatTurn[]) => Promise<string>
  onPaid?: (clientId: string, price: string) => void
}

const IDLE_LINES = ['Just chilling. Ask me anything.', 'Tap me if you need something.']

export default function Sandy({ tips, urgent: insightUrgent, answers, nudges: allNudges, onGo, ai, onPaid }: Props) {
  const [chat, setChat] = useState<ChatTurn[]>([])
  const [hidden, setHidden] = useState<string[]>(() => store.get('sandy.hidden', []))
  const [ticks, setTicks] = useState<Record<string, string[]>>(() => store.get('sandy.ticks', {}))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pitched, setPitched] = useState<string[]>([])
  const nudges = allNudges.filter((n) => !hidden.includes(n.id))
  const alerts = nudges.filter((n) => n.level === 'alert').length
  const urgent = insightUrgent || alerts > 0

  function hide(id: string) {
    const next = [...hidden, id].slice(-200)
    setHidden(next)
    store.set('sandy.hidden', next)
  }

  function tick(id: string, item: string) {
    const list = ticks[id] ?? []
    const next = { ...ticks, [id]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item] }
    setTicks(next)
    store.set('sandy.ticks', next)
  }

  async function pitch(name: string, date: string) {
    setPitched((p) => [...p, name])
    try {
      await addLead({ name, kind: 'promoter', handle: '', event_name: name, event_date: date.slice(0, 10) })
    } catch {
      setPitched((p) => p.filter((x) => x !== name))
    }
  }
  const [mode, setMode] = useState<SandyMode>('idle')
  const [line, setLine] = useState(allNudges[0]?.title ?? tips[0] ?? IDLE_LINES[0])
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const tipIndex = useRef(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (open) return
      setMode((m) => {
        if (m === 'idle') return Math.random() < 0.5 ? 'thinking' : 'learning'
        return urgent ? 'alert' : 'idle'
      })
    }, 7000)
    return () => clearInterval(id)
  }, [open, urgent])

  useEffect(() => {
    if (urgent && !open) setMode('alert')
  }, [urgent, open])

  function say(text: string) {
    setMode('talking')
    setLine(text)
    window.setTimeout(() => setMode('idle'), Math.min(6000, 1400 + text.length * 25))
  }

  function nextTip() {
    if (nudges.length) return say(nudges.length === 1 ? 'One thing for you.' : `${nudges.length} things for you. Top one first.`)
    if (tips.length === 0) return say(IDLE_LINES[1])
    tipIndex.current = (tipIndex.current + 1) % tips.length
    say(tips[tipIndex.current])
  }

  function ask(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q) return
    setQuestion('')
    setMode('thinking')
    const history: ChatTurn[] = [...chat, { role: 'user', content: q }]
    const rules = () => {
      const found = answers.find((a) => a.match.test(q))
      return found ? found.reply() : "I can't do that one yet. Try \"help\"."
    }
    ;(ai ? ai(history) : Promise.reject(new Error('no ai')))
      .catch(rules)
      .then((answer) => {
        setChat([...history, { role: 'assistant' as const, content: answer }].slice(-12))
        say(answer)
      })
  }

  return (
    <div className={`sandy${open ? ' open' : ''}`}>
      <div className="sandy-talk">
        {open && (
          <div className="sandy-list" role="list" aria-label="Sandy's to-do list">
            {nudges.length === 0 && <p className="sandy-clear">All clear. Nothing needs you right now.</p>}
            {nudges.map((n, i) => {
              const done = ticks[n.id] ?? []
              const isOpen = expanded === n.id
              return (
                <div key={n.id} role="listitem" className={`sandy-nudge lvl-${n.level}`} style={{ animationDelay: `${i * 0.05}s` }}>
                  <button className="sandy-nudge-main" onClick={() => setExpanded(isOpen ? null : n.id)} aria-expanded={isOpen}>
                    <i className="sandy-dot" />
                    <span>
                      <b>{n.title}</b>
                      <small>{n.detail}</small>
                    </span>
                    {n.checklist && (
                      <em className="sandy-progress">
                        {done.length}/{n.checklist.length}
                      </em>
                    )}
                  </button>
                  {isOpen && (
                    <div className="sandy-nudge-body">
                      {n.checklist?.map((item) => (
                        <label key={item} className={done.includes(item) ? 'done' : ''}>
                          <input type="checkbox" checked={done.includes(item)} onChange={() => tick(n.id, item)} />
                          {item}
                        </label>
                      ))}
                      {n.debrief && (
                        <Debrief
                          {...n.debrief}
                          onDone={(paid) => {
                            if (paid) onPaid?.(n.debrief!.id, paid)
                            hide(n.id)
                          }}
                        />
                      )}
                      {n.events?.map((e) => (
                        <div key={e.id} className="sandy-event">
                          <a href={e.link} target="_blank" rel="noreferrer">
                            <b>{e.name}</b>
                            <small>
                              {e.venue} · {e.date}
                            </small>
                          </a>
                          <button onClick={() => pitch(e.name, e.date)} disabled={pitched.includes(e.name)}>
                            {pitched.includes(e.name) ? 'Added ✓' : 'Pitch'}
                          </button>
                        </div>
                      ))}
                      <div className="sandy-nudge-actions">
                        {n.go && (
                          <button
                            className="go"
                            onClick={() => {
                              onGo(n.go!)
                              setOpen(false)
                            }}
                          >
                            {n.goLabel ?? 'Open'} →
                          </button>
                        )}
                        <button onClick={() => hide(n.id)}>{n.checklist && done.length === n.checklist.length ? 'Done ✓' : 'Hide'}</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="sandy-bubble" key={line}>
          {line}
        </div>
        {open && (
          <form className="sandy-ask" onSubmit={ask}>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask Sandy… (try “help”)"
              aria-label="Ask Sandy"
              autoFocus
            />
          </form>
        )}
      </div>
      <button
        className={`sandy-bot mode-${mode}`}
        aria-label={open ? 'Close Sandy' : 'Open Sandy'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          if (!open) nextTip()
        }}
      >
        {!open && nudges.length > 0 && <span className={`sandy-badge${alerts ? ' hot' : ''}`}>{nudges.length}</span>}
        <SandyFace />
      </button>
    </div>
  )
}

export function SandyFace() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="sandyShell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ff0ff" />
          <stop offset="1" stopColor="#1fb6cc" />
        </linearGradient>
        <linearGradient id="sandyFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b2236" />
          <stop offset="1" stopColor="#05121f" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="48" r="46" fill="none" stroke="#38d6ec44" strokeWidth="1.5" />
      <path d="M26 92 Q50 74 74 92" fill="url(#sandyShell)" opacity=".85" />
      <rect x="15" y="40" width="10" height="20" rx="5" fill="#25c3d8" />
      <rect x="75" y="40" width="10" height="20" rx="5" fill="#25c3d8" />
      <ellipse cx="50" cy="48" rx="28" ry="27" fill="url(#sandyShell)" />
      <ellipse cx="50" cy="51" rx="21" ry="17" fill="url(#sandyFace)" />
      <rect className="sandy-scan" x="30" y="49" width="40" height="2" rx="1" fill="#7ff0ff" opacity=".7" />
      <ellipse className="sandy-eye" cx="42" cy="49" rx="3.6" ry="4.2" />
      <ellipse className="sandy-eye" cx="58" cy="49" rx="3.6" ry="4.2" />
      <path className="sandy-mouth" d="M44 58 Q50 62 56 58" stroke="#d6fbff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <g className="sandy-dots">
        <circle cx="76" cy="20" r="2.4" fill="#7ff0ff" />
        <circle cx="83" cy="15" r="2.4" fill="#7ff0ff" />
        <circle cx="90" cy="10" r="2.4" fill="#7ff0ff" />
      </g>
      <ellipse cx="40" cy="30" rx="8" ry="3.5" fill="#ffffff" opacity=".35" />
    </svg>
  )
}
