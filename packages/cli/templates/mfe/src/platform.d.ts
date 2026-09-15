import "@platform/react"

/**
 * Types for `useRuntimeEnv()` and `usePlatform((p) => p.featureFlags)`.
 * Keep `env` in step with `mfe.config.ts → env`.
 */
declare module "@platform/react" {
  interface Register {
    env: {
      API_BASE_URL: string
    }
    featureFlags: {
      "assets.bulk-edit": boolean
    }
  }
}
