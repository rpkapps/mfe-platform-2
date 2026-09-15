import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import { BugIcon, XIcon } from "lucide-react"

import { Button } from "@tecton/react/components/button"
import { loadDevtools, shouldLoadDevtools, type DevtoolsModule } from "@platform/host"
import { usePlatformHost } from "@platform/host-react"
import { TEST_IDS } from "@platform-internal/conformance"

const ids = TEST_IDS.shell

const HEIGHT_KEY = "platform:devtools:height"
const OPEN_KEY = "platform:devtools:open"
const MIN_HEIGHT = 192
const DEFAULT_HEIGHT = 420

export interface DevtoolsControl {
  toggle: () => void
  open: () => void
  close: () => void
}

export interface PlatformDevtoolsProps {
  defaultOpen?: boolean
  /** Force-enable regardless of the flag; policy `never` still wins. */
  force?: boolean
  className?: string
  /** Lets the shell header drive the drawer. */
  controlRef?: RefObject<DevtoolsControl | null>
}

type PanelComponent = ComponentType<{
  host: Parameters<DevtoolsModule["DevtoolsPanel"]>[0]["host"]
}>

/** localStorage is best-effort: a private window or blocked site data must not break the shell. */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function clampHeight(height: number): number {
  const max = typeof window === "undefined" ? 900 : Math.round(window.innerHeight * 0.9)
  return Math.min(Math.max(height, MIN_HEIGHT), Math.max(max, MIN_HEIGHT))
}

/**
 * The developer tools, docked like a browser's: a small icon button in the
 * bottom-right corner opens a full-width panel along the bottom of the
 * viewport, resizable by dragging its top edge. Height and open state are
 * remembered per browser. Renders nothing at all unless the tools may load.
 */
export function PlatformDevtools({
  defaultOpen = false,
  force = false,
  className,
  controlRef,
}: PlatformDevtoolsProps) {
  const host = usePlatformHost()
  const [allowed, setAllowed] = useState(false)
  const [open, setOpen] = useState(defaultOpen)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const [dragging, setDragging] = useState(false)
  const [Panel, setPanel] = useState<PanelComponent | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    const ok = force
      ? host.devtools.policy !== "never" && typeof window !== "undefined"
      : shouldLoadDevtools(host)
    setAllowed(ok)
    if (!ok) return
    const storedHeight = Number(readStored(HEIGHT_KEY))
    if (Number.isFinite(storedHeight) && storedHeight > 0) setHeight(clampHeight(storedHeight))
    if (!defaultOpen && readStored(OPEN_KEY) === "1") setOpen(true)
  }, [host, force, defaultOpen])

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

  const setOpenPersisted = useCallback((next: boolean) => {
    setOpen(next)
    writeStored(OPEN_KEY, next ? "1" : "0")
  }, [])

  useImperativeHandle(
    controlRef,
    () => ({
      toggle: () => setOpenPersisted(!open),
      open: () => setOpenPersisted(true),
      close: () => setOpenPersisted(false),
    }),
    [open, setOpenPersisted]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPersisted(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, setOpenPersisted])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startY: event.clientY, startHeight: height }
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setHeight(clampHeight(drag.current.startHeight + (drag.current.startY - event.clientY)))
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
    setDragging(false)
    writeStored(HEIGHT_KEY, String(height))
  }

  if (!allowed) return null

  return (
    <>
      {open ? null : (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Open developer tools"
          className={["platform-devtools-launcher", className].filter(Boolean).join(" ")}
          data-testid={ids.devtoolsToggle}
          aria-expanded={false}
          onPress={() => setOpenPersisted(true)}
        >
          <BugIcon aria-hidden />
        </Button>
      )}
      {open ? (
        <div
          className="platform-devtools-dock"
          data-platform-devtools-host=""
          data-dragging={dragging || undefined}
          style={{ height: `${height}px` }}
          role="region"
          aria-label="Platform developer tools"
        >
          <div
            className="platform-devtools-resize"
            data-testid={ids.devtoolsResize}
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize developer tools"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          />
          <div className="platform-devtools-dock-body">
            {Panel ? (
              <Panel host={host} />
            ) : failed ? (
              <p className="platform-devtools-empty">
                The developer tools failed to load: {failed}
              </p>
            ) : (
              <p className="platform-devtools-empty">Loading developer tools…</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close developer tools"
            className="platform-devtools-close"
            data-testid={ids.devtoolsClose}
            onPress={() => setOpenPersisted(false)}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      ) : null}
    </>
  )
}
