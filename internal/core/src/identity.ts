import { PlatformError } from "./errors"

/** `mfeId` grammar: lowercase kebab-case, starting with a letter. */
export const MFE_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function isValidMfeId(value: string): boolean {
  return MFE_ID_RE.test(value)
}

export function assertMfeId(value: string, source?: string): string {
  if (!isValidMfeId(value)) {
    throw new PlatformError({ code: "MFE_ID_INVALID", message: `"${value}" is not a valid mfeId.`, source, override: "mfe.config.ts → mfeId" })
  }
  return value
}

/** Infer the default `mfeId` from a package name: `@acme/asset-tracker` → `asset-tracker`. */
export function inferMfeId(packageName: string): string {
  const base = packageName.includes("/") ? packageName.slice(packageName.lastIndexOf("/") + 1) : packageName
  const id = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "mfe-$1")
  return id === "" ? "mfe" : id
}

/** Module Federation container name derived from an mfeId (must be an identifier). */
export function federationName(mfeId: string): string {
  return `mfe_${mfeId.replace(/-/g, "_")}`
}

export const ROUTE_PREFIX_RE = /^\/(?:[a-z0-9]+(?:[-_.][a-z0-9]+)*)(?:\/[a-z0-9]+(?:[-_.][a-z0-9]+)*)*$/

export function isValidRoutePrefix(value: string): boolean {
  return value === "/" || ROUTE_PREFIX_RE.test(value)
}

export function assertRoutePrefix(value: string, mfeId?: string): string {
  if (!isValidRoutePrefix(value)) {
    throw new PlatformError({
      code: "ROUTE_PREFIX_INVALID",
      message: `"${value}" is not a valid route prefix.`,
      owner: mfeId ? { mfeId } : undefined,
      override: "mfe.config.ts → routePrefix",
    })
  }
  return value
}

/** Default route prefix: `/${mfeId}`. */
export function inferRoutePrefix(mfeId: string): string {
  return `/${mfeId}`
}

let instanceCounter = 0

/** Unique per-mount identifier. Stable within a page for the same slot key when provided. */
export function createInstanceId(mfeId: string, slot?: string): string {
  instanceCounter += 1
  const suffix = slot ? `${slot}` : `${instanceCounter.toString(36)}`
  return `${mfeId}#${suffix}`
}

export interface NamespaceParts {
  mfeId: string
  instanceId?: string
  key: string
}

/** Stable namespace for storage keys, commands, settings: `platform:<mfeId>[:<instanceId>]:<key>`. */
export function namespaceKey(parts: NamespaceParts): string {
  const segments = ["platform", parts.mfeId]
  if (parts.instanceId) segments.push(parts.instanceId)
  segments.push(parts.key)
  return segments.join(":")
}

/** Split a namespaced key back into its parts (the inverse of `namespaceKey`). */
export function parseNamespacedKey(key: string): NamespaceParts | null {
  const [prefix, mfeId, ...rest] = key.split(":")
  if (prefix !== "platform" || !mfeId || rest.length === 0) return null
  if (rest.length === 1) return { mfeId, key: rest[0]! }
  return { mfeId, instanceId: rest[0], key: rest.slice(1).join(":") }
}

/** Namespaced command / registration id: `<mfeId>:<localId>` (instance-bound ids append `@<instanceId>`). */
export function qualifyId(mfeId: string, localId: string, instanceId?: string): string {
  return instanceId ? `${mfeId}:${localId}@${instanceId}` : `${mfeId}:${localId}`
}

export const LOCAL_ID_RE = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/

export function isValidLocalId(value: string): boolean {
  return LOCAL_ID_RE.test(value)
}
