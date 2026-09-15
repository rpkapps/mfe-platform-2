import { PlatformError } from "@platform-internal/core"

import type { PlatformHost } from "./types"

export const DEVTOOLS_FLAG_KEY = "platform:devtools"
export const DEVTOOLS_QUERY = "platform.devtools"

export interface DevtoolsDecision {
  allowed: boolean
  reason:
    "no-window" | "policy-never" | "policy-always" | "environment" | "flag-missing" | "flag"
}

export function readDevtoolsFlag(
  win: Window | undefined = typeof window !== "undefined" ? window : undefined
): boolean {
  if (!win) return false
  try {
    if (win.localStorage?.getItem(DEVTOOLS_FLAG_KEY) === "1") return true
  } catch {
    // storage blocked
  }
  try {
    const params = new URLSearchParams(win.location.search)
    if (params.get(DEVTOOLS_QUERY) === "1") return true
  } catch {
    // ignore
  }
  return false
}

/** `win: null` means "no browser window" (SSR); `undefined` uses the global. */
export function decideDevtools(
  host: Pick<PlatformHost, "devtools" | "environment">,
  win: Window | null | undefined = typeof window !== "undefined" ? window : null
): DevtoolsDecision {
  if (!win) return { allowed: false, reason: "no-window" }
  if (host.devtools.policy === "never") return { allowed: false, reason: "policy-never" }
  if (host.devtools.policy === "always") return { allowed: true, reason: "policy-always" }
  if (!host.devtools.environments.includes(host.environment))
    return { allowed: false, reason: "environment" }
  return readDevtoolsFlag(win)
    ? { allowed: true, reason: "flag" }
    : { allowed: false, reason: "flag-missing" }
}

/** True when the developer tools may load: browser only, policy allows, environment supported, flag set. */
export function shouldLoadDevtools(host: PlatformHost, win?: Window | null): boolean {
  const decision = decideDevtools(host, win)
  host.diagnostics.emit({
    type: "devtools",
    action: decision.allowed ? "requested" : "denied",
    reason: decision.reason,
  })
  return decision.allowed
}

/**
 * What a developer-tools module has to provide. Declared structurally, and in
 * terms the host already knows, so `@platform/host` never imports a UI package
 * — the shell decides which one to load:
 *
 * ```ts
 * createPlatformHost({
 *   devtools: { ...runtimeConfig.devtools, load: () => import("@platform/devtools") },
 * })
 * ```
 *
 * `@platform/devtools` satisfies it; so does a shell's own implementation.
 */
export interface DevtoolsModule {
  DevtoolsPanel: (props: {
    host: PlatformHost
    defaultTab?: string
    refreshMs?: number
    className?: string
  }) => unknown
}

/** Loader a shell supplies through `devtools.load`. */
export type DevtoolsLoader = () => Promise<DevtoolsModule>

const pending = new WeakMap<PlatformHost, Promise<DevtoolsModule>>()

/**
 * Load the shell's developer-tools module, once per host. The import lives in
 * the shell, so the tools stay a separate chunk and a shell that never calls
 * this never pays for them.
 */
export async function loadDevtools(host: PlatformHost): Promise<DevtoolsModule> {
  const existing = pending.get(host)
  if (existing) return existing
  const load = host.devtools.load
  if (!load) {
    const error = new PlatformError({
      code: "INTERNAL",
      message:
        'The developer tools are enabled but no loader was supplied. Pass `devtools.load` to createPlatformHost, for example `load: () => import("@platform/devtools")`.',
      source: "@platform/host",
      override: "createPlatformHost → devtools.load",
    })
    host.diagnostics.emit({ type: "devtools", action: "failed", reason: error.message })
    throw error
  }
  const promise = load()
    .then((module) => {
      host.diagnostics.emit({ type: "devtools", action: "loaded" })
      return module
    })
    .catch((error: unknown) => {
      pending.delete(host)
      host.diagnostics.emit({
        type: "devtools",
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
      })
      throw error
    })
  pending.set(host, promise)
  return promise
}

/** Set or clear the local-storage flag behind the developer-tools toggle. */
export function setDevtoolsFlag(
  enabled: boolean,
  win: Window | undefined = typeof window !== "undefined" ? window : undefined
): void {
  try {
    if (enabled) win?.localStorage.setItem(DEVTOOLS_FLAG_KEY, "1")
    else win?.localStorage.removeItem(DEVTOOLS_FLAG_KEY)
  } catch {
    // storage blocked
  }
}
