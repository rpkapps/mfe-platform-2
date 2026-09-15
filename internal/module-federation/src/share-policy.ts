import {
  negotiateShared,
  shareScopeFor,
  type ShareResolution,
  type SharedProvider,
  type SharedRequest,
} from "@platform-internal/core"

import type { FederationShareScopeMap, FederationSharedEntry } from "./federation"

const PAIRS: Record<string, string> = { react: "react-dom", "react-dom": "react" }

/** Providers available in a share scope map for one package. */
export function providersFrom(map: FederationShareScopeMap | undefined, name?: string): SharedProvider[] {
  const providers: SharedProvider[] = []
  if (!map || typeof map !== "object") return providers
  for (const [scope, packages] of Object.entries(map)) {
    if (!packages || typeof packages !== "object") continue
    for (const [pkgName, versions] of Object.entries(packages)) {
      if (name !== undefined && pkgName !== name) continue
      if (!versions || typeof versions !== "object") continue
      for (const [version, entry] of Object.entries(versions as Record<string, FederationSharedEntry>)) {
        if (!entry || typeof entry !== "object") continue
        providers.push({
          name: pkgName,
          version,
          scope,
          from: typeof entry.from === "string" ? entry.from : "unknown",
          loaded: Boolean(entry.loaded || entry.lib),
        })
      }
    }
  }
  return providers
}

export interface ShareResolutionRecord extends ShareResolution {
  requester: string
  at: number
}

export interface SharePolicyState {
  /** requester (federation name) → package → resolution */
  resolutions: Map<string, Map<string, ShareResolutionRecord>>
}

export interface ResolveShareArgs {
  shareScopeMap: FederationShareScopeMap
  scope: string
  pkgName: string
  version: string
  shareInfo: FederationSharedEntry & { from: string }
  resolver: () => { shared: FederationSharedEntry; useTreesShaking: boolean } | undefined
}

/**
 * Version-group policy for one `resolveShare` call: only providers in the
 * requested scope are considered (never across `react18` / `react19`), an
 * already-loaded provider is preferred, react and react-dom must come from
 * the same provider, and a request without a compatible provider falls back
 * to the remote's own bundled copy. Every decision is recorded per requester.
 */
export function applySharePolicy(state: SharePolicyState, args: ResolveShareArgs, now = Date.now): ResolveShareArgs {
  const { scope, pkgName, shareInfo } = args
  const requester = shareInfo.from
  const versions = args.shareScopeMap?.[scope]?.[pkgName] ?? {}
  const providers = providersFrom({ [scope]: { [pkgName]: versions } }, pkgName).filter(
    (provider) => provider.from !== requester
  )
  const required = shareInfo.shareConfig?.requiredVersion
  const request: SharedRequest = {
    name: pkgName,
    requiredVersion: typeof required === "string" && required ? required : "*",
    version: args.version,
    scope,
    singleton: Boolean(shareInfo.shareConfig?.singleton),
    shared: true,
    reason: "inferred",
    pairedWith: PAIRS[pkgName] ? [PAIRS[pkgName]!] : undefined,
  }
  let [resolution] = negotiateShared({ requester, requests: [request], providers })
  if (!resolution) return args
  // Coordinate the pair: react-dom follows the provider react chose (and vice versa).
  const partnerName = PAIRS[pkgName]
  const partner = partnerName ? state.resolutions.get(requester)?.get(partnerName) : undefined
  if (partner) {
    if (partner.outcome === "shared" && partner.provider) {
      if (resolution.outcome !== "shared" || resolution.provider?.from !== partner.provider.from) {
        const same = providers.find(
          (provider) => provider.from === partner.provider!.from && negotiateShared({ requester, requests: [request], providers: [provider] })[0]?.outcome === "shared"
        )
        resolution = same
          ? { ...resolution, outcome: "shared", provider: same, version: same.version, reason: `paired with ${partnerName} from ${same.from}` }
          : { ...resolution, outcome: "bundled", provider: undefined, version: args.version, reason: `${pkgName} and ${partnerName} must come from one provider; bundled pair used` }
      }
    } else if (partner.outcome === "bundled" && resolution.outcome === "shared") {
      resolution = { ...resolution, outcome: "bundled", provider: undefined, version: args.version, reason: `${partnerName} is bundled; ${pkgName} bundled to keep the pair together` }
    }
  }
  let byRequester = state.resolutions.get(requester)
  if (!byRequester) {
    byRequester = new Map()
    state.resolutions.set(requester, byRequester)
  }
  byRequester.set(pkgName, { ...resolution, requester, at: now() })
  if (resolution.outcome === "shared" && resolution.provider) {
    const chosen = versions[resolution.provider.version]
    if (chosen) {
      const shared = chosen
      return { ...args, resolver: () => ({ shared, useTreesShaking: false }) }
    }
  }
  return { ...args, resolver: () => undefined }
}

/** Default share scope for a host-provided package: `react<major>` for React-bound packages, `default` otherwise. */
export function hostShareScope(name: string, version: string): string {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10)
  return shareScopeFor(name, Number.isFinite(major) ? major : 19)
}
