import type { Plugin } from "vite"

import type { PlatformContext } from "./context"
import { tectonOptimizeIncludes } from "./optimize"

export const MFE_ID_DEFINE = "__PLATFORM_MFE_ID__"
export const ROUTE_PREFIX_DEFINE = "__PLATFORM_ROUTE_PREFIX__"

/**
 * Packages that must resolve to exactly one copy inside a remote: the React
 * pair, the router and the SDK. Vite's `resolve.dedupe` forces them to the
 * project root, which matters when the SDK is linked from a workspace (its own
 * node_modules may carry a different React major than the remote).
 */
export const DEDUPED_PACKAGES = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@tanstack/react-router",
  "@tanstack/history",
  "@tanstack/react-store",
  "@platform/react",
]

/**
 * Compile-time constants the SDK reads: `createMfe()` defaults `mfeId` from
 * `__PLATFORM_MFE_ID__` and throws without it. Applied in dev, build and test
 * (`vitest.config.ts` uses the same `platform()` call).
 */
export function platformDefinePlugin(context: PlatformContext): Plugin {
  return {
    name: "platform:define",
    config(userConfig) {
      const config = context.config()
      return {
        resolve: {
          dedupe: DEDUPED_PACKAGES,
          // `@/*` style paths from tsconfig.json resolve in dev, build and the dependency
          // scanner alike; without it the scanner fails and pre-bundling is skipped, which
          // leaves CommonJS dependencies unusable in development.
          tsconfigPaths: userConfig.resolve?.tsconfigPaths ?? true,
        },
        // Tecton's sources are served as-is in development; the packages they import
        // are pre-bundled explicitly (see `tectonOptimizeIncludes`).
        optimizeDeps: config.tecton ? { include: tectonOptimizeIncludes(config.root) } : {},
        define: {
          [MFE_ID_DEFINE]: JSON.stringify(config.mfeId),
          [ROUTE_PREFIX_DEFINE]: JSON.stringify(config.routePrefix),
        },
      }
    },
  }
}
