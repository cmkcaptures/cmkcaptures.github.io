import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase'
import './Gallery.css'

const OWNER_EMAIL = 'cmkcaptures@gmail.com'

export default function StudioGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  async function sendReset() {
    if (!supabase) return
    setError('')
    const { error: failed } = await supabase.auth.resetPasswordForEmail(OWNER_EMAIL, {
      redirectTo: `${window.location.origin}/studio`,
    })
    if (failed) setError(failed.message)
    else setNotice(`Reset link sent to ${OWNER_EMAIL}.`)
  }

  async function saveNewPassword(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    const { error: failed } = await supabase.auth.updateUser({ password })
    if (failed) setError(failed.message)
    else {
      setPassword('')
      setRecovering(false)
    }
  }

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    const { error: failed } = await supabase.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password,
    })
    if (failed) setError(failed.message)
  }

  if (recovering) {
    return (
      <div className="cg gate">
        <form className="gate-form" onSubmit={saveNewPassword}>
          <span className="cg-brand">NEW PASSWORD</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            autoFocus
          />
          <button className="btn-brass" type="submit">
            Save password
          </button>
          {error && <p className="gm-error">{error}</p>}
        </form>
      </div>
    )
  }

  if (session?.user.email === OWNER_EMAIL) return <>{children}</>
  if (supabase && loading) return <div className="cg" />

  return (
    <div className="cg gate">
      <form className="gate-form" onSubmit={signIn}>
        <span className="cg-brand">STUDIO</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
        />
        <button className="btn-brass" type="submit" disabled={!supabase}>
          Sign in
        </button>
        <button className="gallery-btn" type="button" onClick={sendReset} disabled={!supabase}>
          Forgot password
        </button>
        {error && <p className="gm-error">{error}</p>}
        {notice && <p className="gm-note">{notice}</p>}
      </form>
    </div>
  )
}
