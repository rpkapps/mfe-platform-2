import type { MfeConfig } from "./options"

export type {
  MfeConfig,
  NavigationOptions,
  CapabilityOptions,
  EnvKeyOptions,
  CssOptions,
  ManifestOptions,
  RuntimeOverrides,
  SharedOptions,
} from "./options"

/**
 * Typed helper for `mfe.config.ts`:
 *
 * ```ts
 * import { defineMfeConfig } from "@platform/vite/config"
 * export default defineMfeConfig({ routePrefix: "/assets", navigation: { title: "Assets" } })
 * ```
 *
 * The file is loaded by the `platform()` Vite plugin and by the CLI. Plugin
 * options win over it, it wins over inference from `package.json` and the
 * source tree.
 */
export function defineMfeConfig(config: MfeConfig): MfeConfig {
  return config
}
