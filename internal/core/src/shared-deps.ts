import {
  compareVersions,
  maxSatisfying,
  minVersion,
  parseVersion,
  rangeMajor,
  satisfies,
} from "./semver"
import type { SharedRequest } from "./manifest"

/**
 * Dependency sharing by version group.
 *
 * Packages bound to a React instance (react, react-dom, @tanstack/react-router,
 * @platform/react, react-aria-components…) share inside the scope of their
 * React major (`react18`, `react19`): one React 19 for the shell and every
 * React 19 remote, one React 18 for the React 18 remotes. React 19 can never
 * satisfy a React 18 request because the scopes are distinct. Framework-neutral
 * packages (`@tanstack/history`, `zod`) share in `default`. Anything without a
 * compatible provider falls back to the remote's bundled copy.
 */
export const REACT_BOUND_PACKAGES = new Set([
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "react-dom/client",
  "@tanstack/react-router",
  "@tanstack/react-store",
  "@platform/react",
  "@tecton/react",
  "react-aria-components",
  "react-aria",
  "next-themes",
  "sonner",
  "lucide-react",
])

/**
 * Packages the platform shares by default when the remote depends on them.
 * UI-library stacks (`@tecton/react`, React Aria, sonner) are bundled per remote
 * on purpose: React Aria's portal and collection contexts must come from one copy
 * inside a remote, and Tecton is a source package compiled by each consumer.
 * Configure `shared` in mfe.config.ts to opt a package in.
 */
export const DEFAULT_SHARED_PACKAGES = [
  "react",
  "react-dom",
  "@tanstack/react-router",
  "@tanstack/history",
  "@platform/react",
  "@tecton/react",
  "zod",
] as const

/** Source packages (TSX, compiled by the consumer) cannot be shared as built modules. */
export const SOURCE_PACKAGES = new Set(["@tecton/react"])

/**
 * Packages every remote bundles for itself even though they are inferred: the SDK
 * binds React contexts and the UI-library stack (React Aria portal context via
 * `@platform/react/tecton`) of the remote it is built into, so one copy per remote
 * is the only safe resolution. Isolation, not sharing, is the SDK's job.
 */
export const PER_REMOTE_PACKAGES = new Set(["@platform/react"])

/** Subpath entries of the SDK shared together with the main entry. */
export const SDK_SUBPATHS = ["@platform/react/tecton"] as const

export const PAIRED_PACKAGES: Record<string, string[]> = {
  react: ["react-dom"],
  "react-dom": ["react"],
}

export function shareScopeFor(name: string, reactMajor: number): string {
  return REACT_BOUND_PACKAGES.has(name) ||
    name.startsWith("react-dom/") ||
    name.startsWith("react/")
    ? `react${reactMajor}`
    : "default"
}

export type SharedOverride =
  boolean | { version?: string; bundle?: boolean; singleton?: boolean; scope?: string }

export interface InferSharedOptions {
  dependencies: Record<string, string>
  /** Installed versions, when known (`name` → `x.y.z`). */
  installed?: Record<string, string>
  /** `mfe.config.ts` → `shared`. */
  overrides?: Record<string, SharedOverride>
  /** Extra packages beyond the defaults. */
  extra?: string[]
}

export interface InferSharedResult {
  requests: SharedRequest[]
  reactMajor: number
  warnings: string[]
}

export function inferSharedDependencies(options: InferSharedOptions): InferSharedResult {
  const { dependencies, installed = {}, overrides = {}, extra = [] } = options
  const warnings: string[] = []
  const reactRange = dependencies.react
  const reactMajor = reactRange
    ? (rangeMajor(reactRange) ?? parseVersion(installed.react ?? "")?.major ?? 19)
    : (parseVersion(installed.react ?? "")?.major ?? 19)
  const candidates = new Set<string>([
    ...DEFAULT_SHARED_PACKAGES,
    ...extra,
    ...Object.keys(overrides).filter((name) => overrides[name] !== false),
  ])
  const requests: SharedRequest[] = []
  for (const name of candidates) {
    const override = overrides[name]
    const range =
      dependencies[name] ?? (typeof override === "object" ? override.version : undefined)
    if (!range) {
      if (override !== undefined && override !== false)
        warnings.push(
          `"${name}" is configured as shared but is not a dependency of the project.`
        )
      continue
    }
    if (
      range.startsWith("workspace:") ||
      range.startsWith("catalog:") ||
      range.startsWith("github:") ||
      range.startsWith("git+") ||
      range.startsWith("file:") ||
      range.startsWith("link:")
    ) {
      const installedVersion = installed[name]
      if (!installedVersion) {
        requests.push({
          name,
          requiredVersion: "*",
          version: undefined,
          scope: shareScopeFor(name, reactMajor),
          singleton: false,
          shared: false,
          reason: "source-package",
        })
        continue
      }
    }
    if (override === false || (typeof override === "object" && override.bundle)) {
      requests.push({
        name,
        requiredVersion: range,
        version: installed[name],
        scope: shareScopeFor(name, reactMajor),
        singleton: false,
        shared: false,
        reason: "disabled",
        pairedWith: PAIRED_PACKAGES[name],
      })
      continue
    }
    if (
      SOURCE_PACKAGES.has(name) &&
      !(typeof override === "object" && override.singleton !== undefined)
    ) {
      requests.push({
        name,
        requiredVersion: range,
        version: installed[name],
        scope: shareScopeFor(name, reactMajor),
        singleton: false,
        shared: false,
        reason: "source-package",
      })
      continue
    }
    const requiredVersion =
      typeof override === "object" && override.version
        ? override.version
        : /^(workspace:|catalog:|link:|file:)/.test(range)
          ? `^${installed[name] ?? "0.0.0"}`
          : range
    if (PER_REMOTE_PACKAGES.has(name) && override === undefined) {
      // Bundled unless the remote opts in (`shared: { "@platform/react": true }`).
      requests.push({
        name,
        requiredVersion,
        version: installed[name],
        scope: shareScopeFor(name, reactMajor),
        singleton: false,
        shared: false,
        reason: "per-remote",
      })
      continue
    }
    requests.push({
      name,
      requiredVersion,
      version: installed[name],
      scope:
        typeof override === "object" && override.scope
          ? override.scope
          : shareScopeFor(name, reactMajor),
      singleton:
        typeof override === "object" && override.singleton !== undefined
          ? override.singleton
          : false,
      shared: true,
      reason:
        override === undefined
          ? "inferred"
          : typeof override === "object" && override.version
            ? "pinned"
            : "configured",
      pairedWith: PAIRED_PACKAGES[name],
    })
  }
  // A remote may opt the SDK into sharing explicitly (`shared: { "@platform/react": true }`);
  // its subpath entries then share with it so both resolve from one copy.
  const sdk = requests.find((request) => request.name === "@platform/react" && request.shared)
  if (sdk) {
    for (const subpath of SDK_SUBPATHS) {
      if (!requests.some((request) => request.name === subpath))
        requests.push({ ...sdk, name: subpath, pairedWith: undefined })
    }
  }
  if (dependencies.react && dependencies["react-dom"]) {
    const domMajor = rangeMajor(dependencies["react-dom"])
    if (domMajor !== null && domMajor !== reactMajor)
      warnings.push(
        `react (${dependencies.react}) and react-dom (${dependencies["react-dom"]}) request different majors; they must be a coordinated pair.`
      )
  }
  return {
    requests: requests.sort((a, b) => a.name.localeCompare(b.name)),
    reactMajor,
    warnings,
  }
}

/** A version available in a share scope, with who provides it. */
export interface SharedProvider {
  name: string
  version: string
  scope: string
  /** `shell` or an mfeId. */
  from: string
  loaded?: boolean
}

export interface ShareResolution {
  name: string
  scope: string
  requiredVersion: string
  outcome: "shared" | "bundled"
  /** Chosen provider when shared. */
  provider?: SharedProvider
  /** Version used (provider's or the remote's own). */
  version?: string
  reason: string
  /** Version group the request landed in (`react18`, `default`). */
  group: string
}

export interface NegotiateOptions {
  requester: string
  requests: SharedRequest[]
  providers: SharedProvider[]
}

/**
 * Pick a provider per request: highest loaded version satisfying the range in
 * the same scope, else highest satisfying version, else bundle. Paired packages
 * (react / react-dom) must come from the same provider or both bundle.
 */
export function negotiateShared(options: NegotiateOptions): ShareResolution[] {
  const resolutions = new Map<string, ShareResolution>()
  const pick = (request: SharedRequest): ShareResolution => {
    const group = request.scope
    if (!request.shared) {
      return {
        name: request.name,
        scope: request.scope,
        requiredVersion: request.requiredVersion,
        outcome: "bundled",
        version: request.version,
        reason:
          request.reason === "source-package"
            ? "source package is compiled per remote"
            : request.reason === "per-remote"
              ? "bundled per remote: binds the React contexts of the remote it is built into"
              : "sharing disabled by configuration",
        group,
      }
    }
    const candidates = options.providers.filter(
      (provider) =>
        provider.name === request.name &&
        provider.scope === request.scope &&
        satisfies(provider.version, request.requiredVersion)
    )
    if (candidates.length === 0) {
      const wrongScope = options.providers.filter(
        (provider) => provider.name === request.name && provider.scope !== request.scope
      )
      const reason = wrongScope.length
        ? `no provider in scope "${request.scope}" (available in ${wrongScope.map((p) => `${p.scope}@${p.version}`).join(", ")}); bundled copy used`
        : `no provider satisfies ${request.requiredVersion}; bundled copy used`
      return {
        name: request.name,
        scope: request.scope,
        requiredVersion: request.requiredVersion,
        outcome: "bundled",
        version: request.version,
        reason,
        group,
      }
    }
    const loaded = candidates.filter((candidate) => candidate.loaded)
    const pool = loaded.length ? loaded : candidates
    const best = pool.reduce((a, b) => (compareVersions(a.version, b.version) >= 0 ? a : b))
    return {
      name: request.name,
      scope: request.scope,
      requiredVersion: request.requiredVersion,
      outcome: "shared",
      provider: best,
      version: best.version,
      reason: loaded.length
        ? "already-loaded provider reused (loaded-first)"
        : "highest compatible provider",
      group,
    }
  }
  for (const request of options.requests) resolutions.set(request.name, pick(request))
  // Coordinate pairs.
  for (const request of options.requests) {
    for (const partner of request.pairedWith ?? []) {
      const mine = resolutions.get(request.name)
      const theirs = resolutions.get(partner)
      if (!mine || !theirs) continue
      if (
        mine.outcome !== theirs.outcome ||
        (mine.provider && theirs.provider && mine.provider.from !== theirs.provider.from)
      ) {
        for (const name of [request.name, partner]) {
          const current = resolutions.get(name)!
          const own = options.requests.find((r) => r.name === name)
          resolutions.set(name, {
            ...current,
            outcome: "bundled",
            provider: undefined,
            version: own?.version,
            reason: `${request.name} and ${partner} must come from one provider; bundled pair used`,
          })
        }
      }
    }
  }
  return Array.from(resolutions.values())
}

/** Highest version in `available` satisfying `range`, for tests and devtools. */
export function bestVersion(available: readonly string[], range: string): string | null {
  return maxSatisfying(available, range)
}

export { minVersion }
