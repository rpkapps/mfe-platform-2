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

export type DevtoolsModule = typeof import("./devtools-entry")

let pending: Promise<DevtoolsModule> | null = null

/** Lazy-load the developer tools chunk (never statically imported from the main entries). */
export async function loadDevtools(host: PlatformHost): Promise<DevtoolsModule> {
  if (!pending) {
    pending = import("./devtools-entry")
      .then((module) => {
        host.diagnostics.emit({ type: "devtools", action: "loaded" })
        return module
      })
      .catch((error: unknown) => {
        pending = null
        host.diagnostics.emit({
          type: "devtools",
          action: "failed",
          reason: error instanceof Error ? error.message : String(error),
        })
        throw error
      })
  }
  return pending
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
