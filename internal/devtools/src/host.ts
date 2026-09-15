import type { RecordedTelemetryEvent } from "@platform-internal/core"
import type { DiagnosticsBus, DiagnosticSnapshot } from "@platform-internal/diagnostics"

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
  }
}
