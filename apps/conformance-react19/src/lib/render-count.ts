import * as React from "react"

/** Counts renders of the calling component (used to prove slice subscriptions). */
export function useRenderCount(): number {
  const ref = React.useRef(0)
  ref.current += 1
  return ref.current
}
