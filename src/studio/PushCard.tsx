import { useEffect, useState } from 'react'
import type { PushState } from './push'
import { pushState, sendTestPush, turnOffPush, turnOnPush } from './push'

const TEXT: Record<PushState, string> = {
  on: "On for this device. I'll ping you mornings and evenings when something needs you.",
  off: 'Get pinged about reminders, shoots tomorrow, late galleries and posting days.',
  blocked: 'Notifications are blocked for this site. Allow them in your browser settings, then come back.',
  'needs-install': 'On iPhone: tap Share → Add to Home Screen, open PhotoFlow from there, then turn alerts on.',
  unsupported: "This browser can't do push alerts. Try Chrome, or the Home Screen app on iPhone.",
}

export default function PushCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'))
  }, [])

  async function run(fn: () => Promise<PushState | void>, done?: string) {
    setBusy(true)
    setNote('')
    try {
      const next = await fn()
      if (next) setState(next)
      if (done) setNote(done)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }

  if (!state) return null
  return (
    <section className="sp-card">
      <h2>
        Phone alerts <span className={`sp-push-dot ${state}`} />
      </h2>
      <p className="sp-push-text">{TEXT[state]}</p>
      <div className="sp-push-actions">
        {state === 'off' && (
          <button className="btn-brass" disabled={busy} onClick={() => run(turnOnPush, 'Done. Try a test.')}>
            {busy ? 'Turning on…' : 'Turn on alerts'}
          </button>
        )}
        {state === 'on' && (
          <>
            <button className="btn-brass" disabled={busy} onClick={() => run(sendTestPush, 'Sent. Check your notifications.')}>
              {busy ? 'Sending…' : 'Send a test'}
            </button>
            <button className="st-ghost" disabled={busy} onClick={() => run(turnOffPush)}>
              Turn off
            </button>
          </>
        )}
      </div>
      {note && <p className="sp-push-note">{note}</p>}
    </section>
  )
}
