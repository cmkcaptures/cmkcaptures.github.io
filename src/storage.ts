import type { Client } from './types'
import { normalizeClient } from './types'

const KEY = 'photoflow.clients'

export function loadClients(): Client[] {
  const raw = localStorage.getItem(KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as (Partial<Client> & { id: string })[]
    return parsed.map(normalizeClient)
  } catch {
    return []
  }
}

export function saveClients(clients: Client[]): void {
  localStorage.setItem(KEY, JSON.stringify(clients))
}
