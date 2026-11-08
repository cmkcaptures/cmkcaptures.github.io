import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

export type SandyMode = 'idle' | 'thinking' | 'talking' | 'learning' | 'alert'

export interface SandyAnswer {
  match: RegExp
  reply: () => string
}

interface Props {
  tips: string[]
  urgent: boolean
  answers: SandyAnswer[]
}

const IDLE_LINES = ['Just chilling. Ask me anything.', 'Tap me if you need something.']

export default function Sandy({ tips, urgent, answers }: Props) {
  const [mode, setMode] = useState<SandyMode>('idle')
  const [line, setLine] = useState(tips[0] ?? IDLE_LINES[0])
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
    window.setTimeout(() => setMode('idle'), 2600)
  }

  function nextTip() {
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
    window.setTimeout(() => {
      const found = answers.find((a) => a.match.test(q))
      say(found ? found.reply() : "I can't do that one yet. Try \"help\".")
    }, 500)
  }

  return (
    <div className={`sandy${open ? ' open' : ''}`}>
      <div className="sandy-talk">
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
      </button>
    </div>
  )
}
