import { useEffect, useState, type ComponentType } from "react"

import { Button } from "@tecton/react/components/button"

import { loadDevtools, shouldLoadDevtools, type DevtoolsModule } from "../devtools"
import { usePlatformHost } from "./context"

export interface PlatformDevtoolsProps {
  defaultOpen?: boolean
  /** Force-enable regardless of the flag (harness); policy `never` still wins. */
  force?: boolean
  className?: string
}

type PanelComponent = ComponentType<{ host: Parameters<DevtoolsModule["DevtoolsPanel"]>[0]["host"] }>

/** Renders nothing unless the developer tools may load; then lazy-loads the panel behind a toggle. */
export function PlatformDevtools({ defaultOpen = false, force = false, className }: PlatformDevtoolsProps) {
  const host = usePlatformHost()
  const [allowed, setAllowed] = useState(false)
  const [open, setOpen] = useState(defaultOpen)
  const [Panel, setPanel] = useState<PanelComponent | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    const ok = force ? host.devtools.policy !== "never" && typeof window !== "undefined" : shouldLoadDevtools(host)
    setAllowed(ok)
  }, [host, force])
  useEffect(() => {
    if (!allowed || Panel || !open) return
    let cancelled = false
    loadDevtools(host)
      .then((module) => {
        if (!cancelled) setPanel(() => module.DevtoolsPanel as PanelComponent)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailed(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [allowed, open, Panel, host])
  if (!allowed) return null
  return (
    <div className={["platform-devtools-host", className].filter(Boolean).join(" ")} data-platform-devtools-host="">
      <Button variant={open ? "default" : "outline"} size="sm" className="platform-devtools-toggle" data-testid="platform-devtools-toggle" onPress={() => setOpen((value) => !value)} aria-expanded={open}>
        {open ? "Close devtools" : "Devtools"}
      </Button>
      {open ? (
        <div className="platform-devtools-drawer" role="region" aria-label="Platform developer tools">
          {Panel ? <Panel host={host} /> : failed ? <p className="platform-devtools-empty">The developer tools failed to load: {failed}</p> : <p className="platform-devtools-empty">Loading developer tools…</p>}
        </div>
      ) : null}
    </div>
  )
}
