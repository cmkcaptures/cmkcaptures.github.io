// Touch-friendly "move to…" sheet, opened by a long-press (phones can't drag and drop).
import { useRef } from 'react'
import type { TouchEvent } from 'react'
import Portal from './Portal'

export interface MoveOption {
  key: string
  label: string
  sub?: string
  current?: boolean
}

export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  return {
    onTouchStart: (e: TouchEvent) => {
      fired.current = false
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(25)
        onLong()
      }, ms)
    },
    onTouchMove: (e: TouchEvent) => {
      const s = start.current
      if (s && Math.hypot(e.touches[0].clientX - s.x, e.touches[0].clientY - s.y) > 10) cancel()
    },
    onTouchEnd: (e: TouchEvent) => {
      cancel()
      if (fired.current) e.preventDefault() // don't also open the card
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}

export default function MoveSheet({ title, options, onPick, onClose }: { title: string; options: MoveOption[]; onPick: (key: string) => void; onClose: () => void }) {
  return (
    <Portal>
      <div className="mv-wrap" onClick={onClose}>
        <div className="mv-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
          <i className="mv-grab" />
          <h3>{title}</h3>
          <div className="mv-list">
            {options.map((o) => (
              <button
                key={o.key}
                className={o.current ? 'on' : ''}
                disabled={o.current}
                onClick={() => {
                  onPick(o.key)
                  onClose()
                }}
              >
                <b>{o.label}</b>
                {o.sub && <small>{o.sub}</small>}
                {o.current && <em>Here now</em>}
              </button>
            ))}
          </div>
          <button className="mv-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Portal>
  )
}

/** Same as useLongPress but safe to use inside lists (no hook). */
export function pressHandlers(onLong: () => void, ms = 450) {
  let timer: number | null = null
  let start: { x: number; y: number } | null = null
  let fired = false
  const cancel = () => {
    if (timer) window.clearTimeout(timer)
    timer = null
  }
  return {
    onTouchStart: (e: TouchEvent) => {
      fired = false
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      timer = window.setTimeout(() => {
        fired = true
        navigator.vibrate?.(25)
        onLong()
      }, ms)
    },
    onTouchMove: (e: TouchEvent) => {
      if (start && Math.hypot(e.touches[0].clientX - start.x, e.touches[0].clientY - start.y) > 10) cancel()
    },
    onTouchEnd: (e: TouchEvent) => {
      cancel()
      if (fired) e.preventDefault()
    },
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}
