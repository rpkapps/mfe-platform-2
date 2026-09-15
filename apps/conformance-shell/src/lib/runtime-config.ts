import { createServerFn } from "@tanstack/react-start"

/**
 * SSR-inline runtime configuration: the root route loader calls this server
 * function, so the browser receives a validated document in the initial HTML
 * without rebuilding any asset. The file-system logic lives in a `.server.ts`
 * module that never reaches the client bundle.
 */
export const getRuntimeConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { readRuntimeConfig } = await import("./runtime-config.server")
  return readRuntimeConfig()
})
