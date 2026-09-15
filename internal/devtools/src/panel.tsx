import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import type { DiagnosticSnapshot } from "@platform-internal/diagnostics"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tecton/react/components/tabs"

import type { DevtoolsHost } from "./host"
import { BreadcrumbsPanel } from "./panels/breadcrumbs"
import { CommandsPanel } from "./panels/commands"
import { DependenciesPanel } from "./panels/dependencies"
import { DiagnosticsPanel } from "./panels/diagnostics"
import { HelpPanel } from "./panels/help"
import { OverlaysPanel } from "./panels/overlays"
import { OverviewPanel } from "./panels/overview"
import { RoutesPanel } from "./panels/routes"
import { RuntimePanel } from "./panels/runtime"
import { SessionPanel } from "./panels/session"
import { SettingsPanel } from "./panels/settings"
import { TelemetryPanel } from "./panels/telemetry"
import { listDevtoolsPanels, subscribeDevtoolsPanels, type DevtoolsPanelRenderProps } from "./registry"

export const DEVTOOLS_TABS: { id: string; title: string; render: (props: DevtoolsPanelRenderProps) => ReactNode }[] = [
  { id: "overview", title: "Overview", render: (props) => <OverviewPanel {...props} /> },
  { id: "dependencies", title: "Dependencies", render: (props) => <DependenciesPanel {...props} /> },
  { id: "routes", title: "Routes", render: (props) => <RoutesPanel {...props} /> },
  { id: "commands", title: "Commands", render: (props) => <CommandsPanel {...props} /> },
  { id: "settings", title: "Settings", render: (props) => <SettingsPanel {...props} /> },
  { id: "breadcrumbs", title: "Breadcrumbs", render: (props) => <BreadcrumbsPanel {...props} /> },
  { id: "help", title: "Help", render: (props) => <HelpPanel {...props} /> },
  { id: "session", title: "Session", render: (props) => <SessionPanel {...props} /> },
  { id: "runtime", title: "Runtime", render: (props) => <RuntimePanel {...props} /> },
  { id: "telemetry", title: "Telemetry", render: (props) => <TelemetryPanel {...props} /> },
  { id: "diagnostics", title: "Diagnostics", render: (props) => <DiagnosticsPanel {...props} /> },
  { id: "overlays", title: "Overlays", render: (props) => <OverlaysPanel {...props} /> },
]

export interface DevtoolsPanelProps {
  host: DevtoolsHost
  /** Initially selected tab id. */
  defaultTab?: string
  /** Snapshot refresh throttle in ms (default 250). */
  refreshMs?: number
  className?: string
}

/** Throttled live snapshot of the host: re-computed at most every `refreshMs` while events flow. */
export function useHostSnapshot(host: DevtoolsHost, refreshMs = 250): DiagnosticSnapshot {
  const [snapshot, setSnapshot] = useState(() => host.snapshot())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    let cancelled = false
    const schedule = () => {
      if (timer.current || cancelled) return
      timer.current = setTimeout(() => {
        timer.current = null
        if (!cancelled) setSnapshot(host.snapshot())
      }, refreshMs)
    }
    const unsubscribeHost = host.subscribe(schedule)
    const unsubscribeDiagnostics = host.diagnostics.subscribe(schedule)
    setSnapshot(host.snapshot())
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      unsubscribeHost()
      unsubscribeDiagnostics()
    }
  }, [host, refreshMs])
  return snapshot
}

/** Read-only developer tools: tabs over the live host snapshot; extensible through `registerDevtoolsPanel`. */
export function DevtoolsPanel({ host, defaultTab = "overview", refreshMs, className }: DevtoolsPanelProps) {
  const snapshot = useHostSnapshot(host, refreshMs)
  const custom = useSyncExternalStore(subscribeDevtoolsPanels, listDevtoolsPanels, listDevtoolsPanels)
  const tabs = useMemo(() => [...DEVTOOLS_TABS, ...custom.filter((panel) => !DEVTOOLS_TABS.some((tab) => tab.id === panel.id))], [custom])
  const props: DevtoolsPanelRenderProps = { host, snapshot }
  return (
    <div className={["platform-devtools", className].filter(Boolean).join(" ")} data-testid="platform-devtools-panel" data-platform-devtools="">
      <Tabs defaultSelectedKey={defaultTab} className="platform-devtools-tabs">
        <TabsList aria-label="Developer tools" variant="line" className="platform-devtools-tablist">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} id={tab.id}>
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} id={tab.id} className="platform-devtools-content">
            <PanelBoundary title={tab.title}>{tab.render(props)}</PanelBoundary>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

import { Component, type ErrorInfo } from "react"

class PanelBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  override componentDidCatch(_error: Error, _info: ErrorInfo) {}
  override render() {
    if (this.state.error) {
      return (
        <p className="platform-devtools-empty" role="alert">
          The {this.props.title} panel failed to render: {this.state.error.message}
        </p>
      )
    }
    return this.props.children
  }
}
