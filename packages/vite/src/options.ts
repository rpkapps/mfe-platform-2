import type { CapabilityId, SharedOverride } from "@platform-internal/core"
import type { ModuleFederationOptions } from "@module-federation/vite"
import type { Options as ReactPluginOptions } from "@vitejs/plugin-react"

/**
 * Navigation metadata shown by the shell App Finder. Only discoverable MFEs
 * appear there; hidden MFEs may still declare it for the command palette.
 */
export interface NavigationOptions {
  /** Title in the App Finder and the shell navigation. */
  title: string
  description?: string
  /** Icon name understood by the shell (Tecton / lucide icon id). */
  icon?: string
  /** Extra search keywords for the App Finder. */
  keywords?: string[]
  /** Grouping category in the App Finder. */
  category?: string
  /** Sort order inside its category (lower first). */
  order?: number
}

export interface CapabilityOptions {
  /** Capabilities to request in addition to the inferred set. */
  add?: CapabilityId[]
  /** Inferred capabilities to drop from the request (the SDK call will then fail at runtime). */
  remove?: CapabilityId[]
}

export interface EnvKeyOptions {
  /** Fail the mount when the runtime configuration does not provide the key. */
  required?: boolean
  description?: string
  /** Value used when the runtime configuration omits the key. */
  default?: string | number | boolean
}

export interface CssOptions {
  /** Scope every generated selector under the owner attribute (default `true`). */
  scope?: boolean
  /** Attribute the MFE root carries and selectors are scoped under (default `data-mfe`). */
  ownerAttribute?: string
  /** `shell`: fonts and base styles come from the shell (font faces are dropped). `bundled`: the remote ships them. */
  foundation?: "shell" | "bundled"
}

export interface ManifestOptions {
  /** File name of the generated manifest inside `dist/` (default `platform-manifest.json`). */
  fileName?: string
}

export interface RuntimeOverrides {
  /** Override the React range reported as compatibility metadata (defaults to package.json). */
  react?: string
  reactDom?: string
  tanstackRouter?: string
  platformReact?: string
}

export interface HarnessOptions {
  /** Serve the local shell harness at `/__platform/harness/` (default `true`). */
  enabled?: boolean
  /** Directory with a built harness (defaults to `@platform/host/dist/harness`). */
  dir?: string
}

export type SharedOptions = Record<string, SharedOverride>

/**
 * Configuration accepted from `mfe.config.ts` (through `defineMfeConfig`) and,
 * with a few build-only additions, from the `platform()` plugin options.
 * Everything is optional: values are inferred from `package.json`, the route
 * files and the SDK usage, and persisted identity wins over inference.
 */
export interface MfeConfig {
  /**
   * Stable identity of the remote (kebab-case). Inferred from the package name on
   * the first run and persisted in `.platform/identity.json`; set it explicitly to
   * rename (the persisted file is updated).
   */
  mfeId?: string
  /** Route prefix the shell mounts the MFE under (default `/${mfeId}`). */
  routePrefix?: string
  /** Human-readable name (default: `navigation.title` or the mfeId). */
  displayName?: string
  /** Short description (default: package.json `description`). */
  description?: string
  /** `false` hides the MFE from the App Finder; it stays a valid, deep-linkable remote (default `true`). */
  discoverable?: boolean
  /** App Finder entry. Without it the MFE is still discoverable under its display name. */
  navigation?: NavigationOptions
  /** Permission groups required to load the MFE (merged with route-level `staticData.permissionGroups`). */
  permissionGroups?: string[]
  /** Adjust the inferred capability request. */
  capabilities?: CapabilityOptions
  /**
   * Shared dependency overrides by package name: `false` bundles the package,
   * `{ version }` pins the requested range, `{ bundle: true }` bundles it,
   * `{ singleton }` / `{ scope }` tune negotiation. Everything else is inferred
   * from `package.json`.
   */
  shared?: SharedOptions
  /** Runtime environment keys the MFE reads through `useRuntimeEnv()` (allow-list). */
  env?: Record<string, EnvKeyOptions>
  /** CSS isolation settings. */
  css?: CssOptions
  /** Tecton integration (`withTecton` in the generated entry). `"auto"` enables it when `@tecton/react` is a dependency. */
  tecton?: boolean | "auto"
  /** Directory of the TanStack file routes, relative to the project root (default `src/routes`). */
  routesDirectory?: string
  /** Bootstrap module default-exporting `createMfe(...)`, relative to the project root (default `src/mfe.tsx`). */
  entry?: string
  /** Manifest output options. */
  manifest?: ManifestOptions
  /** Escape hatch: adjust the generated Module Federation configuration before it is applied. */
  federation?: (config: ModuleFederationOptions) => ModuleFederationOptions
  /** Overrides for the compatibility metadata written to the manifest. */
  runtime?: RuntimeOverrides
  /** Local shell harness served by the dev server. */
  harness?: HarnessOptions
}

/** Options of the `platform()` Vite plugin: everything from `mfe.config.ts` plus build tooling switches. */
export interface PlatformPluginOptions extends MfeConfig {
  /**
   * Project root (default `process.cwd()`, which is also Vite's default). Set it
   * when the Vite `root` option points elsewhere.
   */
  root?: string
  /** `false` skips `@vitejs/plugin-react` (add your own); an object is passed to the plugin. */
  react?: false | ReactPluginOptions
  /** `@tailwindcss/vite` integration. `"auto"` enables it when `tailwindcss` resolves from the project root. */
  tailwind?: boolean | "auto"
  /**
   * Lightweight test integration for `vitest.config.ts`: only `@vitejs/plugin-react`
   * and the `__PLATFORM_MFE_ID__` / `__PLATFORM_ROUTE_PREFIX__` defines; no
   * federation, router generation, Tailwind, CSS scoping or dev endpoints.
   * Default: `true` when `process.env.VITEST` is set.
   */
  test?: boolean
}

export type { ReactPluginOptions, ModuleFederationOptions }
