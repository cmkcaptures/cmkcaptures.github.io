import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { supabase } from './supabase'
import type { Client } from './types'
import { normalizeClient } from './types'
import type { BusinessProfile, Invoice } from './invoiceTypes'
import { DEFAULT_BUSINESS } from './invoiceTypes'

// Set after a device's local data has been merged once. From then on the cloud
// is the source of truth, so a record deleted elsewhere can't come back from a stale cache.
const MIGRATED_KEY = 'photoflow.cloudMigrated'
const PROFILE_ID = 'profile'
const TABLE = 'studio_records'

type Kind = 'client' | 'invoice' | 'business'
type Snapshot = Map<string, string>

function key(kind: Kind, id: string) {
  return `${kind}:${id}`
}

function snapshot(clients: Client[], invoices: Invoice[], business: BusinessProfile): Snapshot {
  const snap: Snapshot = new Map()
  for (const c of clients) snap.set(key('client', c.id), JSON.stringify(c))
  for (const i of invoices) snap.set(key('invoice', i.id), JSON.stringify(i))
  snap.set(key('business', PROFILE_ID), JSON.stringify(business))
  return snap
}

function mergeById<T extends { id: string }>(cloud: T[], local: T[]): T[] {
  const ids = new Set(cloud.map((r) => r.id))
  return [...cloud, ...local.filter((r) => !ids.has(r.id))]
}

export function useCloudSync(
  clients: Client[],
  invoices: Invoice[],
  business: BusinessProfile,
  setClients: Dispatch<SetStateAction<Client[]>>,
  setInvoices: Dispatch<SetStateAction<Invoice[]>>,
  setBusiness: Dispatch<SetStateAction<BusinessProfile>>,
) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const synced = useRef<Snapshot | null>(null)
  const pushing = useRef(0)
  const latest = useRef({ clients, invoices, business })
  latest.current = { clients, invoices, business }

  const pull = useCallback(async () => {
    if (!supabase || pushing.current > 0) return
    const { data, error: failed } = await supabase.from(TABLE).select('kind,id,data')
    if (failed) {
      setError(failed.message)
      return
    }
    setError('')
    const rows = data as { kind: Kind; id: string; data: unknown }[]
    const cloudClients = rows
      .filter((r) => r.kind === 'client')
      .map((r) => normalizeClient(r.data as Client))
    const cloudInvoices = rows.filter((r) => r.kind === 'invoice').map((r) => r.data as Invoice)
    const cloudBusiness = rows.find((r) => r.kind === 'business')?.data as BusinessProfile | undefined

    const firstTime = !localStorage.getItem(MIGRATED_KEY)
    const { clients: localClients, invoices: localInvoices, business: localBusiness } = latest.current
    const nextClients = firstTime ? mergeById(cloudClients, localClients) : cloudClients
    const nextInvoices = firstTime ? mergeById(cloudInvoices, localInvoices) : cloudInvoices
    const nextBusiness = cloudBusiness ? { ...DEFAULT_BUSINESS, ...cloudBusiness } : localBusiness

    synced.current = new Map(
      rows.map((r) => [
        key(r.kind, r.id),
        JSON.stringify(r.kind === 'client' ? normalizeClient(r.data as Client) : r.kind === 'business' ? nextBusiness : r.data),
      ]),
    )
    setClients(nextClients)
    setInvoices(nextInvoices)
    setBusiness(nextBusiness)
    setReady(true)
  }, [setClients, setInvoices, setBusiness])

  useEffect(() => {
    pull()
    const onVisible = () => {
      if (document.visibilityState === 'visible') pull()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [pull])

  useEffect(() => {
    if (!ready || !supabase || !synced.current) return
    const previous = synced.current
    const current = snapshot(clients, invoices, business)
    const upserts = [...current]
      .filter(([k, v]) => previous.get(k) !== v)
      .map(([k, v]) => {
        const split = k.indexOf(':')
        return { kind: k.slice(0, split), id: k.slice(split + 1), data: JSON.parse(v) }
      })
    const removed = [...previous.keys()].filter((k) => !current.has(k))
    if (upserts.length === 0 && removed.length === 0) {
      localStorage.setItem(MIGRATED_KEY, '1')
      return
    }

    synced.current = current
    pushing.current += 1
    const db = supabase
    const run = async () => {
      if (upserts.length) {
        const { error: failed } = await db.from(TABLE).upsert(upserts)
        if (failed) throw failed
      }
      for (const k of removed) {
        const split = k.indexOf(':')
        const { error: failed } = await db
          .from(TABLE)
          .delete()
          .eq('kind', k.slice(0, split))
          .eq('id', k.slice(split + 1))
        if (failed) throw failed
      }
    }
    run()
      .then(() => {
        localStorage.setItem(MIGRATED_KEY, '1')
        setError('')
      })
      .catch((e: Error) => {
        // Forget what we assumed was saved so the next change retries everything.
        synced.current = previous
        setError(e.message)
      })
      .finally(() => {
        pushing.current -= 1
      })
  }, [ready, clients, invoices, business])

  return { ready, error }
}
