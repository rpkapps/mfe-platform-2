import "@platform/mfe-react"
import type { MfeRouter } from "@platform/mfe-react"

import type { routeTree } from "./routeTree.gen"

/**
 * Types for `useRuntimeEnv()` and `usePlatform((p) => p.featureFlags)`.
 * Keep `env` in step with `mfe.config.ts → env`.
 */
declare module "@platform/mfe-react" {
  interface Register {
    env: {
      API_BASE_URL: string
    }
    featureFlags: {
      "assets.bulk-edit": boolean
    }
  }
}

/** Registers the MFE router so route hooks, links and search params are typed. */
declare module "@tanstack/react-router" {
  interface Register {
    router: MfeRouter<typeof routeTree>
  }
}
