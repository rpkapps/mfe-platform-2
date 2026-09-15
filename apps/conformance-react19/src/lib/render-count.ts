import * as React from "react"

/**
 * Counts renders of the calling component. This is a test instrument for the
 * slice-subscription conformance check, so it deliberately mutates a ref during
 * render — the exact thing the react-hooks rule forbids in application code.
 */
export function useRenderCount(): number {
  const ref = React.useRef(0)
  // eslint-disable-next-line react-hooks/refs
  ref.current += 1
  // eslint-disable-next-line react-hooks/refs
  return ref.current
}
