// Turns on Sandy's phone alerts (Web Push). The public key is safe to ship.
import { supabase } from '../supabase'

const VAPID_PUBLIC = 'BPntjo2qnJGGRFnUJ1SpQml1QZXzS4m8xgCmEhns3zW-Lw0HTgk66mNOwhl156fjG7PxBsB6uT3BXfCsUsuM18E'

export type PushState = 'unsupported' | 'needs-install' | 'off' | 'on' | 'blocked'

function toBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isInstalled() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

export async function turnOnPush(): Promise<PushState> {
  if (!supabase) throw new Error('Not connected.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC) as BufferSource }))
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subs').upsert({ endpoint: json.endpoint, sub: json, device: navigator.userAgent.slice(0, 120) })
  if (error) throw error
  return 'on'
}

export async function turnOffPush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase?.from('push_subs').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
  return 'off'
}

export async function sendTestPush(): Promise<void> {
  if (!supabase) throw new Error('Not connected.')
  const { error } = await supabase.functions.invoke('sandy-push', { body: { test: true } })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(body?.error ?? error.message)
  }
}
