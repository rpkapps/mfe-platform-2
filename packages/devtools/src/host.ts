import type { CapabilityId, RecordedTelemetryEvent } from "@platform-internal/core"
import type { DiagnosticsBus, DiagnosticSnapshot } from "@platform-internal/diagnostics"

/**
 * Failures the tools can simulate against a live shell. Structural, like the
 * rest of this port: `@platform/host`'s `HostFaults` satisfies it, and a shell
 * that implements none of this simply omits `setFault`, which hides the panel.
 */
export interface DevtoolsFaults {
  unavailable: string[]
  incompatibleShared: boolean
  denyGroups: boolean
  droppedCapabilities: CapabilityId[]
}

/**
 * What the developer tools need from the host: a snapshot builder, change
 * notifications and the diagnostics bus. `@platform/host`'s `PlatformHost`
 * satisfies this structurally; the tools never import the host package.
 */
export interface DevtoolsHost {
  snapshot(): DiagnosticSnapshot
  subscribe(listener: () => void): () => void
  diagnostics: DiagnosticsBus
  telemetryEvents?: () => RecordedTelemetryEvent[]
  remotes?: {
    retry?(mfeId: string): Promise<unknown>
    setLocalOverride?(mfeId: string, url: string | null): void
    faults?(): DevtoolsFaults
    setFault?<K extends keyof DevtoolsFaults>(fault: K, value: DevtoolsFaults[K]): void
  }
}
