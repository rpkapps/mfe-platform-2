import { z } from "zod"

import { PlatformError } from "./errors"
import { mfeIdSchema } from "./manifest"
import { RUNTIME_CONFIG_SCHEMA_VERSION } from "./protocol"

/**
 * Shell-owned, client-safe runtime configuration. Generated at container start
 * by the host entrypoint (`platform-host-entrypoint`), served as
 * `/platform-config.json` or inlined by the SSR shell, validated before the
 * platform starts. Organised by `mfeId`; an MFE only ever receives its own
 * `env` block plus `shared`.
 */
export const runtimeEnvValueSchema = z.union([z.string(), z.number(), z.boolean()])

export const mfeRuntimeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  manifestUrl: z.string().optional(),
  /** Allow-listed public values handed to the MFE as `platform.runtime.env`. */
  env: z.record(z.string(), runtimeEnvValueSchema).default({}),
  preload: z.enum(["none", "entry", "eager"]).optional(),
  /** Origins the host accepts this MFE's assets from (adds to the manifest's list). */
  allowedOrigins: z.array(z.string()).optional(),
})

export const devtoolsPolicySchema = z.object({
  /** `"flag"`: only with the `platform:devtools` localStorage flag; `"always"`; `"never"`. */
  policy: z.enum(["flag", "always", "never"]).default("flag"),
  /** Environments in which the flag is honoured. */
  environments: z.array(z.string()).default(["development", "local", "test", "staging"]),
})

export const runtimeConfigSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z
    .literal(RUNTIME_CONFIG_SCHEMA_VERSION)
    .default(RUNTIME_CONFIG_SCHEMA_VERSION),
  generatedAt: z.string().optional(),
  /** Where the document came from (`entrypoint`, `inline`, `fetch`, `static`, `test`). */
  source: z.string().optional(),
  environment: z.string().default("production"),
  release: z
    .object({
      version: z.string().optional(),
      buildId: z.string().optional(),
      commit: z.string().optional(),
    })
    .default({}),
  /** Public values every MFE receives (`platform.runtime.shared`). */
  shared: z.record(z.string(), runtimeEnvValueSchema).default({}),
  mfes: z.record(mfeIdSchema, mfeRuntimeConfigSchema).default({}),
  devtools: devtoolsPolicySchema.default({
    policy: "flag",
    environments: ["development", "local", "test", "staging"],
  }),
  /** Cache policy for manifest fetches. */
  cache: z
    .object({
      manifestMaxAgeSeconds: z.number().int().nonnegative().default(60),
      bustOnRetry: z.boolean().default(true),
    })
    .default({ manifestMaxAgeSeconds: 60, bustOnRetry: true }),
  /** Manifest fetch retry policy. */
  retry: z
    .object({
      attempts: z.number().int().min(0).default(2),
      backoffMs: z.number().int().nonnegative().default(500),
    })
    .default({ attempts: 2, backoffMs: 500 }),
  /** Origins that may serve remotes in addition to same-origin and manifest-declared origins. */
  allowedOrigins: z.array(z.string()).default([]),
})

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>
export type RuntimeConfigInput = z.input<typeof runtimeConfigSchema>
export type MfeRuntimeConfig = z.infer<typeof mfeRuntimeConfigSchema>
export type RuntimeEnvValue = z.infer<typeof runtimeEnvValueSchema>

export function parseRuntimeConfig(input: unknown, source?: string): RuntimeConfig {
  const result = runtimeConfigSchema.safeParse(input)
  if (!result.success) {
    throw new PlatformError({
      code: "RUNTIME_CONFIG_INVALID",
      message: `Runtime configuration is invalid: ${result.error.issues.map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`).join("; ")}`,
      source,
      override:
        "PLATFORM_* environment variables at container start, or the inline configuration document",
    })
  }
  return source && !result.data.source ? { ...result.data, source } : result.data
}

/** Environment variable prefix read by the entrypoint. Only prefixed variables are ever read. */
export const RUNTIME_ENV_PREFIX = "PLATFORM_"

/** Substrings that mark a value as sensitive; such variables are refused, never emitted. */
export const SENSITIVE_KEY_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /PASSWD/i,
  /TOKEN/i,
  /PRIVATE/i,
  /CREDENTIAL/i,
  /API_KEY/i,
  /APIKEY/i,
  /_KEY$/i,
]

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

function coerceValue(value: string): RuntimeEnvValue {
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

/** `ASSET_TRACKER` → `asset-tracker`. */
export function envSegmentToMfeId(segment: string): string {
  return segment.toLowerCase().replace(/_/g, "-")
}

/** `asset-tracker` → `ASSET_TRACKER`. */
export function mfeIdToEnvSegment(mfeId: string): string {
  return mfeId.toUpperCase().replace(/-/g, "_")
}

export interface GenerateRuntimeConfigOptions {
  /** Environment variables (only `PLATFORM_*` keys are read). */
  env: Record<string, string | undefined>
  /** Base document merged under the environment-derived values. */
  base?: RuntimeConfigInput
  /** Known mfeIds (used to map `PLATFORM_MFE_<ID>_*` segments onto ids containing digits or ambiguous separators). */
  knownMfeIds?: readonly string[]
  now?: () => Date
}

export interface GenerateRuntimeConfigResult {
  config: RuntimeConfig
  /** Environment variables refused because their names look sensitive. */
  refused: string[]
  /** Per-key provenance for diagnostics (`mfes.asset-tracker.manifestUrl` → `PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL`). */
  sources: Record<string, string>
}

/**
 * Build the runtime configuration from `PLATFORM_*` environment variables:
 *
 * - `PLATFORM_ENVIRONMENT`, `PLATFORM_RELEASE_VERSION|BUILD_ID|COMMIT`
 * - `PLATFORM_SHARED_<KEY>` → `shared.<key>`
 * - `PLATFORM_ALLOWED_ORIGINS` (comma separated)
 * - `PLATFORM_DEVTOOLS_POLICY`
 * - `PLATFORM_MFE_<ID>_ENABLED|MANIFEST_URL|PRELOAD|ALLOWED_ORIGINS`
 * - `PLATFORM_MFE_<ID>_ENV_<KEY>` → `mfes.<id>.env.<KEY>`
 *
 * Variables whose names look sensitive are refused and reported.
 */
export function generateRuntimeConfig(
  options: GenerateRuntimeConfigOptions
): GenerateRuntimeConfigResult {
  const base = runtimeConfigSchema.parse(options.base ?? {})
  const config: RuntimeConfig = {
    ...base,
    shared: { ...base.shared },
    mfes: Object.fromEntries(
      Object.entries(base.mfes).map(([id, mfe]) => [id, { ...mfe, env: { ...mfe.env } }])
    ),
  }
  const refused: string[] = []
  const sources: Record<string, string> = {}
  const known = [...(options.knownMfeIds ?? []), ...Object.keys(base.mfes)]
  const resolveMfe = (
    segment: string,
    rest: string[]
  ): { mfeId: string; rest: string[] } | null => {
    // Prefer a known id that matches the longest prefix of the segments.
    const segments = [segment, ...rest]
    for (let length = segments.length; length >= 1; length -= 1) {
      const candidate = envSegmentToMfeId(segments.slice(0, length).join("_"))
      if (known.includes(candidate)) return { mfeId: candidate, rest: segments.slice(length) }
    }
    return null
  }
  const ensureMfe = (mfeId: string): MfeRuntimeConfig => {
    if (!config.mfes[mfeId]) config.mfes[mfeId] = { env: {} }
    return config.mfes[mfeId]!
  }

  for (const [name, raw] of Object.entries(options.env)) {
    if (!name.startsWith(RUNTIME_ENV_PREFIX) || raw === undefined) continue
    const key = name.slice(RUNTIME_ENV_PREFIX.length)
    if (isSensitiveKey(key)) {
      refused.push(name)
      continue
    }
    const value = raw
    if (key === "ENVIRONMENT") {
      config.environment = value
      sources.environment = name
    } else if (key === "RELEASE_VERSION") {
      config.release.version = value
      sources["release.version"] = name
    } else if (key === "RELEASE_BUILD_ID") {
      config.release.buildId = value
      sources["release.buildId"] = name
    } else if (key === "RELEASE_COMMIT") {
      config.release.commit = value
      sources["release.commit"] = name
    } else if (key === "ALLOWED_ORIGINS") {
      config.allowedOrigins = value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
      sources.allowedOrigins = name
    } else if (key === "DEVTOOLS_POLICY") {
      const parsed = devtoolsPolicySchema.shape.policy.safeParse(value)
      if (parsed.success) {
        config.devtools.policy = parsed.data
        sources["devtools.policy"] = name
      }
    } else if (key.startsWith("SHARED_")) {
      const sharedKey = key.slice("SHARED_".length)
      config.shared[sharedKey] = coerceValue(value)
      sources[`shared.${sharedKey}`] = name
    } else if (key.startsWith("MFE_")) {
      const parts = key.slice("MFE_".length).split("_")
      // Try known ids first; otherwise take segments until a known property keyword.
      const keywords = ["ENABLED", "MANIFEST", "PRELOAD", "ALLOWED", "ENV"]
      let mfeId: string
      let rest: string[]
      const resolved = resolveMfe(parts[0] ?? "", parts.slice(1))
      if (resolved) {
        mfeId = resolved.mfeId
        rest = resolved.rest
      } else {
        const index = parts.findIndex((part, i) => i > 0 && keywords.includes(part))
        if (index <= 0) continue
        mfeId = envSegmentToMfeId(parts.slice(0, index).join("_"))
        rest = parts.slice(index)
      }
      const property = rest.join("_")
      const mfe = ensureMfe(mfeId)
      if (property === "ENABLED") {
        mfe.enabled = value === "true" || value === "1"
        sources[`mfes.${mfeId}.enabled`] = name
      } else if (property === "MANIFEST_URL") {
        mfe.manifestUrl = value
        sources[`mfes.${mfeId}.manifestUrl`] = name
      } else if (property === "PRELOAD") {
        const parsed = mfeRuntimeConfigSchema.shape.preload.safeParse(value)
        if (parsed.success && parsed.data) {
          mfe.preload = parsed.data
          sources[`mfes.${mfeId}.preload`] = name
        }
      } else if (property === "ALLOWED_ORIGINS") {
        mfe.allowedOrigins = value
          .split(",")
          .map((origin) => origin.trim())
          .filter(Boolean)
        sources[`mfes.${mfeId}.allowedOrigins`] = name
      } else if (property.startsWith("ENV_")) {
        const envKey = property.slice("ENV_".length)
        mfe.env[envKey] = coerceValue(value)
        sources[`mfes.${mfeId}.env.${envKey}`] = name
      }
    }
  }
  config.generatedAt = (options.now ?? (() => new Date()))().toISOString()
  config.source = "entrypoint"
  return { config: runtimeConfigSchema.parse(config), refused, sources }
}

/** The view of the runtime configuration a single MFE may receive. */
export interface MfeRuntimeView {
  environment: string
  release: RuntimeConfig["release"]
  shared: Record<string, RuntimeEnvValue>
  env: Record<string, RuntimeEnvValue>
}

export function runtimeViewFor(
  config: RuntimeConfig,
  mfeId: string,
  declaredKeys?: Record<string, { default?: RuntimeEnvValue }>
): MfeRuntimeView {
  const own = config.mfes[mfeId]?.env ?? {}
  const env: Record<string, RuntimeEnvValue> = {}
  if (declaredKeys) {
    // Allow-list: only declared keys, defaults applied.
    for (const [key, declaration] of Object.entries(declaredKeys)) {
      if (own[key] !== undefined) env[key] = own[key]!
      else if (declaration.default !== undefined) env[key] = declaration.default
    }
  } else {
    Object.assign(env, own)
  }
  return {
    environment: config.environment,
    release: config.release,
    shared: { ...config.shared },
    env,
  }
}

/** Redacted copy for devtools: values are kept (they are public by contract) but the structure is frozen and sensitive-looking keys are masked defensively. */
export function redactRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  const mask = (record: Record<string, RuntimeEnvValue>) =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, isSensitiveKey(key) ? "•••" : value])
    )
  return {
    ...config,
    shared: mask(config.shared),
    mfes: Object.fromEntries(
      Object.entries(config.mfes).map(([id, mfe]) => [id, { ...mfe, env: mask(mfe.env) }])
    ),
  }
}
