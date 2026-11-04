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

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  async function signIn(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setError('')
    const { error: failed } = await supabase.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password,
    })
    if (failed) setError('That password did not work.')
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
        {error && <p className="gm-error">{error}</p>}
      </form>
    </div>
  )
}
