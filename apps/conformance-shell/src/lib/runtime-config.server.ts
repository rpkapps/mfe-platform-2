import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { generateRuntimeConfig, parseRuntimeConfig, type RuntimeConfig } from "@platform-internal/core"

const KNOWN_MFES = ["asset-tracker", "legacy-reports", "widget-a", "widget-b", "unavailable-remote", "disabled-remote", "restricted-remote", "broken-remote", "incompatible-remote"]

/**
 * Server-only: reads the runtime configuration document written by the host
 * entrypoint at container start (`PLATFORM_CONFIG_PATH`), or, in development,
 * derives it from the same PLATFORM_* variables on every request.
 */
export async function readRuntimeConfig(): Promise<{ config: RuntimeConfig; source: string }> {
  const candidates = [process.env.PLATFORM_CONFIG_PATH, join(process.cwd(), "dist", "client", "platform-config.json"), join(process.cwd(), "public", "platform-config.json")].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8")
      return { config: parseRuntimeConfig(JSON.parse(raw), `file:${candidate}`), source: candidate }
    } catch {
      // try the next candidate
    }
  }
  const generated = generateRuntimeConfig({ env: process.env, knownMfeIds: KNOWN_MFES })
  return { config: { ...generated.config, source: "inline:env" }, source: "env" }
}
