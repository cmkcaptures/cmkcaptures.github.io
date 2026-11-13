// Stores the "how Lightroom renders your camera" calibration privately.
import { supabase } from '../supabase'
import type { Calibration } from './engine'

export async function loadCalibration(): Promise<Calibration | null> {
  const { data } = (await supabase?.from('edit_calibration').select('calib').eq('id', 1).maybeSingle()) ?? {}
  return (data?.calib as Calibration) ?? null
}

export async function saveCalibration(c: Calibration): Promise<void> {
  const { error } = (await supabase?.from('edit_calibration').upsert({ id: 1, calib: c, updated_at: new Date().toISOString() })) ?? {}
  if (error) throw error
}

export async function clearCalibration(): Promise<void> {
  await supabase?.from('edit_calibration').delete().eq('id', 1)
}
