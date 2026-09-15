/**
 * Platform protocol version. A remote built for protocol `N` is loadable by a
 * host whose protocol major is `N`. Bump the major only for breaking changes to
 * the manifest, mount/dispose, bridge, registration or diagnostic contracts.
 */
export const PLATFORM_PROTOCOL_VERSION = "1.0" as const

/** Version of the manifest document format. */
export const MANIFEST_SCHEMA_VERSION = 1 as const

/** Version of the runtime configuration document format. */
export const RUNTIME_CONFIG_SCHEMA_VERSION = 1 as const

/** Base URL of the documentation site used in diagnostics (`docsUrl`). */
export const DOCS_BASE_URL = "https://platform.docs.local/docs" as const

export function protocolMajor(version: string): number {
  const major = Number.parseInt(version.split(".")[0] ?? "", 10)
  return Number.isFinite(major) ? major : -1
}

/** True when a remote built for `remoteVersion` can be loaded by a host on `hostVersion`. */
export function isProtocolCompatible(hostVersion: string, remoteVersion: string): boolean {
  const host = protocolMajor(hostVersion)
  const remote = protocolMajor(remoteVersion)
  return host >= 0 && host === remote
}
