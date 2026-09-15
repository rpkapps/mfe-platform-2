import type { ReactNode } from "react"
import type { DiagnosticSnapshot } from "@platform-internal/diagnostics"

import type { DevtoolsHost } from "./host"

export interface DevtoolsPanelRenderProps {
  host: DevtoolsHost
  snapshot: DiagnosticSnapshot
}

export interface DevtoolsPanelDefinition {
  id: string
  title: string
  render: (props: DevtoolsPanelRenderProps) => ReactNode
  order?: number
}

const panels = new Map<string, DevtoolsPanelDefinition>()
const listeners = new Set<() => void>()
let snapshot: DevtoolsPanelDefinition[] = []

const notify = () => {
  snapshot = Array.from(panels.values()).sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title))
  for (const listener of Array.from(listeners)) listener()
}

/** Add a custom tab to the developer tools (shell extensions). Returns a disposer. */
export function registerDevtoolsPanel(definition: DevtoolsPanelDefinition): () => void {
  panels.set(definition.id, definition)
  notify()
  return () => {
    if (panels.get(definition.id) === definition) {
      panels.delete(definition.id)
      notify()
    }
  }
}

export function listDevtoolsPanels(): DevtoolsPanelDefinition[] {
  return snapshot
}

export function subscribeDevtoolsPanels(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
