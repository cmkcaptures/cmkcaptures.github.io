import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Renders overlays at the top of the page so animated parents can't trap them. */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(<div className="app-portal">{children}</div>, document.body)
}
