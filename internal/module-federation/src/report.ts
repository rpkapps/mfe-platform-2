import {
  negotiateShared,
  type MfeManifest,
  type ShareResolution,
} from "@platform-internal/core"

import type { FederationShareScopeMap } from "./federation"
import { providersFrom, type ShareResolutionRecord } from "./share-policy"

export interface SharedReportRow {
  name: string
  version?: string
  scope: string
  outcome: "shared" | "bundled"
  from?: string
  reason: string
  requiredVersion: string
  group: string
}

/**
 * Build the shared-dependency report of one remote: recorded runtime
 * decisions first, then (for requests the runtime never asked about, e.g.
 * packages the remote bundles on purpose or has not loaded yet) a negotiation
 * against the providers currently present in the share scope map.
 */
export function buildSharedReport(options: {
  manifest: MfeManifest
  federationName: string
  recorded?: Map<string, ShareResolutionRecord>
  shareScopeMap?: FederationShareScopeMap
}): SharedReportRow[] {
  const rows = new Map<string, SharedReportRow>()
  // A development server registers its shared packages in a private scope and runs
  // on its own copies (see `devShareScope` in @platform/vite): nothing to negotiate.
  if (options.manifest.dev) {
    return options.manifest.shared
      .filter((request) => request.shared)
      .map((request) => ({
        name: request.name,
        version: request.version,
        scope: request.scope,
        outcome: "bundled" as const,
        reason: "development server: own copy (shared only in production builds)",
        requiredVersion: request.requiredVersion,
        group: request.scope,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
  const toRow = (resolution: ShareResolution): SharedReportRow => ({
    name: resolution.name,
    version: resolution.version,
    scope: resolution.scope,
    outcome: resolution.outcome,
    from: resolution.provider?.from,
    reason: resolution.reason,
    requiredVersion: resolution.requiredVersion,
    group: resolution.group,
  })
  for (const record of options.recorded?.values() ?? []) rows.set(record.name, toRow(record))
  const pending = options.manifest.shared.filter((request) => !rows.has(request.name))
  if (pending.length) {
    let providers: ReturnType<typeof providersFrom> = []
    try {
      providers = providersFrom(options.shareScopeMap).filter(
        (provider) => provider.from !== options.federationName
      )
    } catch {
      providers = []
    }
    for (const resolution of negotiateShared({
      requester: options.federationName,
      requests: pending,
      providers,
    })) {
      const row = toRow(resolution)
      if (!options.recorded?.size && row.outcome === "shared")
        row.reason = `${row.reason} (predicted: remote not loaded yet)`
      rows.set(row.name, row)
    }
  }
  return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name))
}
