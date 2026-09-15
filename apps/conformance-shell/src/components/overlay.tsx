import { useEffect, useState, type ReactNode } from "react"
import type { OverlayRoot } from "@platform-internal/core"

import { PortalProvider } from "@tecton/react/tecton/portal"

import { usePlatformHost } from "@platform/host-react"

/**
 * Wraps the shell's own Tecton tree so its dialogs, popovers and menus portal
 * into a shell-owned overlay root managed by the overlay manager; global
 * modal ordering then covers shell and remote overlays alike.
 */
export function ShellOverlayProvider({
  children,
  attributes,
}: {
  children: ReactNode
  attributes?: Record<string, string>
}) {
  const host = usePlatformHost()
  const [root, setRoot] = useState<OverlayRoot | null>(null)
  useEffect(() => {
    let created: OverlayRoot | null = null
    try {
      created = host.overlays.createRoot({
        owner: { mfeId: "shell", instanceId: "shell" },
        attributes: { "data-platform-shell-overlays": "", ...(attributes ?? {}) },
      })
      setRoot(created)
    } catch (error) {
      host.diagnostics.emit({
        type: "error",
        code: "OVERLAY_FAILED",
        error: {
          name: "PlatformError",
          code: "OVERLAY_FAILED",
          message: error instanceof Error ? error.message : String(error),
          hint: "",
          docsUrl: "",
        },
      })
    }
    return () => {
      created?.dispose()
      setRoot(null)
    }
  }, [host])
  useEffect(() => {
    if (!root) return
    const apply = () => {
      const theme = host.context.getState().resolvedTheme
      root.element.classList.toggle("dark", theme === "dark")
      root.element.setAttribute("data-theme", theme)
    }
    apply()
    return host.context.subscribe(apply)
  }, [root, host])
  return <PortalProvider container={root ? root.element : null}>{children}</PortalProvider>
}
