import { DOCS_BASE_URL } from "./protocol"

/**
 * Every platform failure carries a stable code, the owner (MFE / widget
 * instance) when known, the artefact that caused it, the override that could
 * fix it and the documentation page that explains it. Diagnostics and developer
 * tools render these fields directly.
 */
export const ERROR_CODES = {
  MANIFEST_FETCH_FAILED: {
    docs: "/failure-handling#manifest-loading",
    hint: "Check the manifest URL, the remote deployment and the allowed origins. Override the URL with a manifest override.",
  },
  MANIFEST_INVALID: {
    docs: "/manifests#validation",
    hint: "Rebuild the remote with a compatible @platform/vite; run `platform validate` in the remote project.",
  },
  MANIFEST_ORIGIN_DENIED: {
    docs: "/manifest-overrides#origin-validation",
    hint: "Add the origin to `allowedOrigins` in the host configuration or use a same-origin manifest URL.",
  },
  PROTOCOL_INCOMPATIBLE: {
    docs: "/module-federation#protocol-compatibility",
    hint: "Upgrade the remote's @platform/mfe-react and @platform/vite, or the host's @platform/host, so the protocol majors match.",
  },
  REMOTE_LOAD_FAILED: {
    docs: "/failure-handling#remote-loading",
    hint: "Check that the remote entry is reachable and served with CORS headers; the host retries with cache busting.",
  },
  REMOTE_DISABLED: {
    docs: "/runtime-configuration#per-mfe-enablement",
    hint: "Enable the MFE in the runtime configuration (`mfes.<mfeId>.enabled`).",
  },
  REMOTE_UNKNOWN: {
    docs: "/manifest-overrides#registry",
    hint: "Register the MFE in the host registry or the runtime configuration.",
  },
  DEPENDENCY_INCOMPATIBLE: {
    docs: "/dependency-sharing#incompatible-fallback",
    hint: "The remote bundles its own copy; check the shared dependency diagnostics and the `shared` overrides in mfe.config.ts.",
  },
  MOUNT_FAILED: {
    docs: "/failure-handling#mounting",
    hint: "The remote threw while mounting; see the remote's error boundary and telemetry.",
  },
  WIDGET_UNKNOWN: {
    docs: "/widgets#registration",
    hint: "Export the widget from `createMfe({ widgets })` and rebuild the remote.",
  },
  WIDGET_MOUNT_FAILED: {
    docs: "/widgets#failure-isolation",
    hint: "The widget threw while mounting; other widgets keep running.",
  },
  PERMISSION_DENIED: {
    docs: "/permission-groups#preflight",
    hint: "The current user lacks a permission group the manifest requires; backend authorization still applies.",
  },
  AUTH_UNAVAILABLE: {
    docs: "/authentication#no-credential-port",
    hint: "The shell supplied no credential adapter, or this MFE did not receive the `auth` capability. Declare it in mfe.config.ts and pass `credentials` to createPlatformHost.",
  },
  AUTH_FAILED: {
    docs: "/authentication#token-failures",
    hint: "The shell's credential adapter could not issue a token: the session may have expired, or the requested audience or scopes may not be granted. Sign in again and check the audience.",
  },
  CAPABILITY_UNAVAILABLE: {
    docs: "/platform-context#capabilities",
    hint: "The host does not approve this capability; feature-detect with `usePlatform((p) => p.capabilities)`.",
  },
  SHORTCUT_CONFLICT: {
    docs: "/commands#shortcut-conflicts",
    hint: "Choose another shortcut; the second registration is rejected, the first one keeps the shortcut.",
  },
  COMMAND_INVALID: {
    docs: "/commands#definition",
    hint: "Command ids are local, kebab-case and unique within the MFE.",
  },
  COMMAND_FAILED: {
    docs: "/commands#failure-states",
    hint: "The handler threw or rejected; the palette shows the error and the shell keeps running.",
  },
  SETTINGS_INVALID: {
    docs: "/settings#definition",
    hint: "Every field needs `defaultValue`; keys are unique within the group.",
  },
  SETTINGS_VALUE_INVALID: {
    docs: "/settings#invalid-stored-values",
    hint: "The stored value failed the schema and no migration fixed it; the field was reset to its default.",
  },
  STORAGE_INVALID: {
    docs: "/storage#malformed-data",
    hint: "The stored value failed the schema and no migration fixed it; defaults were applied.",
  },
  STORAGE_UNAVAILABLE: {
    docs: "/storage#unavailable",
    hint: "Browser storage is blocked; the store falls back to memory for this session.",
  },
  RUNTIME_CONFIG_INVALID: {
    docs: "/runtime-configuration#validation",
    hint: "Fix the runtime configuration document before the platform starts; the entrypoint validates it.",
  },
  RUNTIME_CONFIG_FETCH_FAILED: {
    docs: "/runtime-configuration#loading",
    hint: "Serve `/platform-config.json` from the same origin or inline it in the SSR document.",
  },
  ROUTE_PREFIX_INVALID: {
    docs: "/route-prefixes",
    hint: "Route prefixes start with `/`, contain only lowercase segments and have no trailing slash.",
  },
  MFE_ID_INVALID: {
    docs: "/manifests#mfe-id",
    hint: "`mfeId` is kebab-case (`asset-tracker`); it is inferred from the package name and persisted in `.platform/identity.json`.",
  },
  DEV_RESTART_REQUIRED: {
    docs: "/local-development#restart-diagnostics",
    hint: "Restart the development server: manifests, shared dependency versions, federation configuration and generated route trees are read at startup.",
  },
  TELEMETRY_FAILED: {
    docs: "/telemetry#failure-isolation",
    hint: "The telemetry adapter threw; events are dropped and the MFE keeps running.",
  },
  DEVTOOLS_UNAVAILABLE: {
    docs: "/developer-tools#enabling",
    hint: "Enable `platform:devtools` in localStorage and check the host devtools policy.",
  },
  OVERLAY_FAILED: {
    docs: "/overlays",
    hint: "The overlay root could not be created; overlays fall back to document.body.",
  },
  INTERNAL: {
    docs: "/troubleshooting",
    hint: "Unexpected failure; the diagnostic carries the original error.",
  },
} as const

export type PlatformErrorCode = keyof typeof ERROR_CODES

export interface PlatformErrorOwner {
  mfeId?: string
  instanceId?: string
  widgetId?: string
}

export interface PlatformErrorOptions {
  code: PlatformErrorCode
  message: string
  owner?: PlatformErrorOwner
  /** Manifest URL, package name, setting key… whatever artefact caused it. */
  source?: string
  /** Override available to the operator or developer. */
  override?: string
  cause?: unknown
  details?: Record<string, unknown>
}

export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly owner: PlatformErrorOwner | undefined
  readonly source: string | undefined
  readonly override: string | undefined
  readonly hint: string
  readonly docsUrl: string
  readonly details: Record<string, unknown> | undefined
  override readonly cause: unknown

  constructor(options: PlatformErrorOptions) {
    super(options.message)
    this.name = "PlatformError"
    this.code = options.code
    this.owner = options.owner
    this.source = options.source
    this.override = options.override
    this.details = options.details
    this.cause = options.cause
    this.hint = ERROR_CODES[options.code].hint
    this.docsUrl = `${DOCS_BASE_URL}${ERROR_CODES[options.code].docs}`
  }

  /** Serialisable view used by diagnostics, devtools and telemetry. */
  toJSON(): SerializedPlatformError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      owner: this.owner,
      source: this.source,
      override: this.override,
      hint: this.hint,
      docsUrl: this.docsUrl,
      details: this.details,
      cause: describeCause(this.cause),
    }
  }

  /** Multi-line, actionable text: what failed, who owns it, what to do, where to read. */
  format(): string {
    const lines = [`[platform:${this.code}] ${this.message}`]
    if (this.owner?.mfeId) lines.push(`  owner: ${formatOwner(this.owner)}`)
    if (this.source) lines.push(`  source: ${this.source}`)
    if (this.override) lines.push(`  override: ${this.override}`)
    lines.push(`  hint: ${this.hint}`)
    lines.push(`  docs: ${this.docsUrl}`)
    return lines.join("\n")
  }
}

export interface SerializedPlatformError {
  name: string
  code: PlatformErrorCode
  message: string
  owner?: PlatformErrorOwner
  source?: string
  override?: string
  hint: string
  docsUrl: string
  details?: Record<string, unknown>
  cause?: string
}

export function formatOwner(owner: PlatformErrorOwner): string {
  const parts = [owner.mfeId ?? "?"]
  if (owner.widgetId) parts.push(`widget ${owner.widgetId}`)
  if (owner.instanceId) parts.push(`instance ${owner.instanceId}`)
  return parts.join(" / ")
}

export function describeCause(cause: unknown): string | undefined {
  if (cause === undefined || cause === null) return undefined
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`
  if (typeof cause === "string") return cause
  try {
    return JSON.stringify(cause)
  } catch {
    return String(cause)
  }
}

export function isPlatformError(value: unknown): value is PlatformError {
  return (
    value instanceof PlatformError ||
    (typeof value === "object" &&
      value !== null &&
      (value as { name?: unknown }).name === "PlatformError" &&
      "code" in value)
  )
}

/** Wrap any thrown value in a PlatformError without losing an existing one. */
export function toPlatformError(
  value: unknown,
  fallback: Omit<PlatformErrorOptions, "cause" | "message"> & { message?: string }
): PlatformError {
  if (isPlatformError(value)) return value
  const message = fallback.message ?? (value instanceof Error ? value.message : String(value))
  return new PlatformError({ ...fallback, message, cause: value })
}
