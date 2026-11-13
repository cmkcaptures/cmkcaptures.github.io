// Runs the Edit Lab solver off the main thread so the page never freezes.
import type { Pixels } from './look'
import type { Calibration, Descriptor } from './engine'
import { fit, prepare } from './engine'

self.onmessage = (e: MessageEvent<{ px: Pixels; target: Descriptor; calib: Calibration | null }>) => {
  const { px, target, calib } = e.data
  const res = fit(prepare(px, 110, calib), target, (p) => (self as unknown as Worker).postMessage({ progress: p }))
  ;(self as unknown as Worker).postMessage({ done: res })
}
