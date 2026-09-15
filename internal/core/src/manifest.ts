import { z } from "zod"

import { CAPABILITY_IDS } from "./capabilities"
import { MFE_ID_RE, ROUTE_PREFIX_RE } from "./identity"
import { MANIFEST_SCHEMA_VERSION, PLATFORM_PROTOCOL_VERSION } from "./protocol"

/**
 * The generated, versioned manifest of a platform remote. `@platform/vite`
 * emits it at build time (`platform-manifest.json` next to the remote entry);
 * the host validates it before loading anything. Nothing in it depends on the
 * loader (Module Federation is one implementation of `entry.loader`).
 */

export const mfeIdSchema = z
  .string()
  .regex(MFE_ID_RE, "mfeId must be kebab-case (e.g. asset-tracker)")
export const routePrefixSchema = z
  .string()
  .refine(
    (value) => value === "/" || ROUTE_PREFIX_RE.test(value),
    "route prefix must start with `/`, use lowercase segments and have no trailing slash"
  )
export const localIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/, "ids are local, lowercase and kebab-case")

export const releaseInfoSchema = z.object({
  version: z.string(),
  buildId: z.string().optional(),
  commit: z.string().optional(),
  builtAt: z.string().optional(),
  channel: z.string().optional(),
})

export const routeMetadataSchema = z.object({
  /** Path relative to the route prefix, in TanStack syntax (`/assets/$assetId`). */
  path: z.string(),
  /** Full path including the prefix. */
  fullPath: z.string(),
  file: z.string(),
  /** Whether the route declares `beforeLoad` (a native guard). */
  guarded: z.boolean().default(false),
  /** Static breadcrumb label when declared through `staticData.breadcrumb`. */
  breadcrumb: z
    .union([
      z.string(),
      z.object({
        label: z.string().optional(),
        dynamic: z.boolean().optional(),
        hidden: z.boolean().optional(),
      }),
    ])
    .optional(),
  /** Route-level navigation metadata (`staticData.navigation`). */
  navigation: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      icon: z.string().optional(),
      order: z.number().optional(),
      hidden: z.boolean().optional(),
    })
    .optional(),
  /** Permission groups declared through `staticData.permissionGroups`. */
  permissionGroups: z.array(z.string()).optional(),
})

export const commandContributionSchema = z.object({
  id: localIdSchema,
  label: z.string(),
  description: z.string().optional(),
  group: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  shortcut: z.string().optional(),
  permissionGroups: z.array(z.string()).optional(),
  route: z.string().optional(),
  static: z.boolean().default(false),
})

export const settingsFieldContributionSchema = z.object({
  key: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  kind: z.enum(["boolean", "text", "number", "select", "multi-select", "unknown"]).optional(),
  keywords: z.array(z.string()).optional(),
})

export const settingsContributionSchema = z.object({
  key: localIdSchema,
  title: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  managedBy: z.enum(["framework", "mfe"]).default("framework"),
  /** For `managedBy: "mfe"`: the MFE route that renders the settings page. */
  route: z.string().optional(),
  fields: z.array(settingsFieldContributionSchema).default([]),
})

export const helpContributionSchema = z.object({
  id: localIdSchema,
  title: z.string(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  href: z.string().optional(),
  route: z.string().optional(),
})

export const releaseNoteContributionSchema = z.object({
  id: localIdSchema,
  version: z.string(),
  title: z.string(),
  date: z.string().optional(),
  summary: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  href: z.string().optional(),
})

export const widgetContributionSchema = z.object({
  id: localIdSchema,
  title: z.string().optional(),
  description: z.string().optional(),
  /** JSON Schema of the widget props, when declared. */
  propsSchema: z.record(z.string(), z.unknown()).optional(),
  permissionGroups: z.array(z.string()).optional(),
})

export const sharedRequestSchema = z.object({
  name: z.string(),
  /** Requested range from package.json (or the override). */
  requiredVersion: z.string(),
  /** Version the remote was built with (its fallback copy). */
  version: z.string().optional(),
  /** Share scope: framework-agnostic packages share in `default`, React-bound packages in `react<major>`. */
  scope: z.string(),
  singleton: z.boolean().default(false),
  /** `false` when the package is bundled locally on purpose (`shared: { pkg: false }`). */
  shared: z.boolean().default(true),
  /** Why the package is shared or bundled (`inferred`, `configured`, `source-package`, `disabled`). */
  reason: z
    .enum(["inferred", "configured", "source-package", "disabled", "pinned"])
    .default("inferred"),
  /** Packages that must resolve from the same provider (`react` ↔ `react-dom`). */
  pairedWith: z.array(z.string()).optional(),
})

export const runtimeRequirementsSchema = z.object({
  react: z.object({
    requiredVersion: z.string(),
    major: z.number().int(),
    builtWith: z.string().optional(),
  }),
  reactDom: z
    .object({
      requiredVersion: z.string(),
      major: z.number().int(),
      builtWith: z.string().optional(),
    })
    .optional(),
  tanstackRouter: z
    .object({ requiredVersion: z.string(), builtWith: z.string().optional() })
    .optional(),
  platformReact: z
    .object({ requiredVersion: z.string(), builtWith: z.string().optional() })
    .optional(),
})

export const tectonRequirementsSchema = z.object({
  enabled: z.boolean(),
  version: z.string().optional(),
  /** CSS protocol: the shell must provide foundation styles of this major. */
  cssProtocol: z.string().optional(),
  /** Token set the remote was compiled against. */
  tokens: z.string().optional(),
  /** Whether the remote relies on the shell for fonts and base styles (`shell`) or ships its own (`bundled`). */
  foundation: z.enum(["shell", "bundled"]).default("shell"),
})

export const cssRequirementsSchema = z.object({
  /** Owner attribute every generated selector is scoped under. */
  ownerAttribute: z.string().default("data-mfe"),
  scoped: z.boolean().default(true),
  /** CSS assets to load with the remote (relative to the remote base URL). */
  assets: z.array(z.string()).default([]),
})

export const runtimeEnvDeclarationSchema = z.object({
  /** Keys the MFE expects from its runtime configuration (allow-list). */
  keys: z
    .record(
      z.string(),
      z.object({
        required: z.boolean().default(false),
        description: z.string().optional(),
        /** All runtime env values are public by definition; `sensitive` values are refused by the entrypoint. */
        public: z.literal(true).default(true),
        default: z.union([z.string(), z.number(), z.boolean()]).optional(),
      })
    )
    .default({}),
})

export const remoteEntrySchema = z.object({
  /** Loader implementation this entry targets. */
  loader: z.literal("module-federation"),
  /** Container name known to the loader. */
  name: z.string(),
  /** Remote entry file, relative to `remote.baseUrl`. */
  file: z.string(),
  /** Exposed module that returns the remote definition (`createMfe`). */
  expose: z.string().default("./mfe"),
  /** Module type of the remote entry. */
  type: z.enum(["module", "var"]).default("module"),
  /** Optional loader manifest (mf-manifest.json), relative to `remote.baseUrl`. */
  loaderManifest: z.string().optional(),
})

export const remoteLocationSchema = z.object({
  /** Base URL the remote's assets are served from. Absolute or relative to the manifest URL. */
  baseUrl: z.string().default("./"),
  /** Origins the host may load this remote from (in addition to the manifest origin). */
  allowedOrigins: z.array(z.string()).optional(),
  /** Whether the host should preload the entry when the MFE is discoverable. */
  preload: z.enum(["none", "entry", "eager"]).default("none"),
})

export const devInfoSchema = z.object({
  /** True when generated by a development server; such remotes are HMR-capable. */
  hmr: z.boolean(),
  /** Origin of the development server. */
  origin: z.string().optional(),
  /** Module the host imports before loading a dev remote so React Refresh is installed for its React instance. */
  refreshPreamble: z.string().optional(),
  /** Value that changes when a restart-requiring input changed (manifest, shared versions, federation config, route tree). */
  configHash: z.string().optional(),
  /** True once a restart-requiring input changed after the server started; hosts show a diagnostic instead of a stale remote. */
  restartRequired: z.boolean().optional(),
  /** Human-readable reason for `restartRequired` (which file changed). */
  restartReason: z.string().optional(),
})

export const mfeManifestSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(MANIFEST_SCHEMA_VERSION).default(MANIFEST_SCHEMA_VERSION),
  protocolVersion: z.string().default(PLATFORM_PROTOCOL_VERSION),
  mfeId: mfeIdSchema,
  kind: z.enum(["mfe", "widget-library"]).default("mfe"),
  version: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  release: releaseInfoSchema,
  entry: remoteEntrySchema,
  remote: remoteLocationSchema.default({ baseUrl: "./", preload: "none" }),
  routePrefix: routePrefixSchema.optional(),
  routes: z.array(routeMetadataSchema).default([]),
  navigation: z
    .object({
      title: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      category: z.string().optional(),
      order: z.number().optional(),
    })
    .optional(),
  discoverable: z.boolean().default(true),
  enabled: z.boolean().default(true),
  loadPolicy: z.enum(["lazy", "preload", "eager"]).default("lazy"),
  permissionGroups: z.array(z.string()).default([]),
  capabilities: z.array(z.enum(CAPABILITY_IDS)).default([]),
  commands: z.array(commandContributionSchema).default([]),
  settings: z.array(settingsContributionSchema).default([]),
  help: z.array(helpContributionSchema).default([]),
  releaseNotes: z.array(releaseNoteContributionSchema).default([]),
  widgets: z.array(widgetContributionSchema).default([]),
  breadcrumbs: z
    .object({
      rootLabel: z.string().optional(),
      renderer: z.enum(["shell", "mfe"]).default("shell"),
    })
    .default({ renderer: "shell" }),
  shared: z.array(sharedRequestSchema).default([]),
  runtime: runtimeRequirementsSchema,
  tecton: tectonRequirementsSchema.default({ enabled: false, foundation: "shell" }),
  css: cssRequirementsSchema.default({ ownerAttribute: "data-mfe", scoped: true, assets: [] }),
  env: runtimeEnvDeclarationSchema.default({ keys: {} }),
  dev: devInfoSchema.optional(),
})

export type MfeManifest = z.infer<typeof mfeManifestSchema>
export type MfeManifestInput = z.input<typeof mfeManifestSchema>
export type RouteMetadata = z.infer<typeof routeMetadataSchema>
export type CommandContribution = z.infer<typeof commandContributionSchema>
export type SettingsContribution = z.infer<typeof settingsContributionSchema>
export type HelpContribution = z.infer<typeof helpContributionSchema>
export type ReleaseNoteContribution = z.infer<typeof releaseNoteContributionSchema>
export type WidgetContribution = z.infer<typeof widgetContributionSchema>
export type SharedRequest = z.infer<typeof sharedRequestSchema>
export type RuntimeRequirements = z.infer<typeof runtimeRequirementsSchema>
export type TectonRequirements = z.infer<typeof tectonRequirementsSchema>
export type ReleaseInfo = z.infer<typeof releaseInfoSchema>
export type RemoteEntry = z.infer<typeof remoteEntrySchema>
export type DevInfo = z.infer<typeof devInfoSchema>

export type ManifestValidation =
  | { ok: true; manifest: MfeManifest }
  | { ok: false; issues: { path: string; message: string }[] }

export function validateManifest(input: unknown): ManifestValidation {
  const result = mfeManifestSchema.safeParse(input)
  if (result.success) return { ok: true, manifest: result.data }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  }
}

/** Resolve a manifest-relative URL against the manifest's own URL. */
export function resolveRemoteUrl(manifestUrl: string, relative: string): string {
  try {
    return new URL(relative, manifestUrl).href
  } catch {
    return relative
  }
}

/** Effective route prefix: `manifest.routePrefix` or `/${mfeId}`. */
export function manifestRoutePrefix(
  manifest: Pick<MfeManifest, "mfeId" | "routePrefix">
): string {
  return manifest.routePrefix ?? `/${manifest.mfeId}`
}
