import { useEffect, useRef } from "react"
import type { MountableSurface } from "@platform/host"

import { usePlatformHost } from "./context"

export interface SurfaceMountProps {
  surface: MountableSurface
  className?: string
  owner?: { mfeId: string }
}

/**
 * Mounts a remote `MountableSurface` (help or release-note content) into a
 * host-owned element, and keeps a failure inside that element.
 */
export function SurfaceMount({ surface, className, owner }: SurfaceMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const host = usePlatformHost()
  useEffect(() => {
    const element = ref.current
    if (!element) return
    let handle: { dispose(): void } | undefined
    try {
      handle = surface.mount(element)
    } catch (error) {
      host.diagnostics.emit({
        type: "log",
        level: "warn",
        message: "surface mount failed",
        detail: error instanceof Error ? error.message : String(error),
        mfeId: owner?.mfeId,
      })
      element.textContent = "This content failed to render."
    }
    return () => {
      try {
        handle?.dispose()
      } catch {
        // isolated
      }
      element.replaceChildren()
    }
  }, [surface, host, owner?.mfeId])
  return (
    <div ref={ref} className={className} data-platform-surface="" data-mfe={owner?.mfeId} />
  )
}
