import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { createServerFn } from "@tanstack/react-start"
import { generateRuntimeConfig, parseRuntimeConfig } from "@platform-internal/core"

/**
 * SSR-inline runtime configuration. In a container the entrypoint writes
 * `platform-config.json` at start-up and `PLATFORM_CONFIG_PATH` points at it;
 * in development the same PLATFORM_* variables are turned into the document
 * on every request. Either way the browser receives a validated document
 * without rebuilding any asset.
 */
export const getRuntimeConfig = createServerFn({ method: "GET" }).handler(async () => {
  const candidates = [process.env.PLATFORM_CONFIG_PATH, join(process.cwd(), ".output", "public", "platform-config.json"), join(process.cwd(), "public", "platform-config.json")].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8")
      return { config: parseRuntimeConfig(JSON.parse(raw), `file:${candidate}`), source: candidate }
    } catch {
      // try the next candidate
    }
  }
  const generated = generateRuntimeConfig({ env: process.env, knownMfeIds: ["asset-tracker", "legacy-reports", "widget-a", "widget-b", "unavailable-remote", "disabled-remote", "restricted-remote", "broken-remote", "incompatible-remote"] })
  return { config: { ...generated.config, source: "inline:env" }, source: "env" }
})
