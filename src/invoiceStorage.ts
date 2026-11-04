import type { Invoice, BusinessProfile } from './invoiceTypes'
import { DEFAULT_BUSINESS } from './invoiceTypes'

const INVOICES_KEY = 'photoflow.invoices'
const BUSINESS_KEY = 'photoflow.business'

export function loadInvoices(): Invoice[] {
  const raw = localStorage.getItem(INVOICES_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as Invoice[]
  } catch {
    return []
  }
}

export function saveInvoices(invoices: Invoice[]): void {
  localStorage.setItem(INVOICES_KEY, JSON.stringify(invoices))
}

export function loadBusiness(): BusinessProfile {
  const raw = localStorage.getItem(BUSINESS_KEY)
  if (!raw) return { ...DEFAULT_BUSINESS }
  try {
    return { ...DEFAULT_BUSINESS, ...(JSON.parse(raw) as Partial<BusinessProfile>) }
  } catch {
    return { ...DEFAULT_BUSINESS }
  }
}

export function saveBusiness(profile: BusinessProfile): void {
  localStorage.setItem(BUSINESS_KEY, JSON.stringify(profile))
}
