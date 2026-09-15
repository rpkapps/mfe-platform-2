import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { generateRuntimeConfigFile, parseArgs, runEntrypoint } from "../src/entrypoint"

const dirs: string[] = []
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "platform-entrypoint-"))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("entrypoint", () => {
  it("generates a validated document from PLATFORM_* variables, refusing sensitive names", () => {
    const dir = tmp()
    writeFileSync(
      join(dir, "base.json"),
      JSON.stringify({
        environment: "base",
        mfes: { "asset-tracker": { env: { FROM_BASE: 1 } } },
      })
    )
    const result = generateRuntimeConfigFile({
      cwd: dir,
      out: "out/platform-config.json",
      base: "base.json",
      known: ["asset-tracker"],
      env: {
        PLATFORM_ENVIRONMENT: "staging",
        PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL: "https://cdn/m.json",
        PLATFORM_MFE_ASSET_TRACKER_ENV_API_BASE_URL: "https://api",
        PLATFORM_MFE_ASSET_TRACKER_ENABLED: "false",
        PLATFORM_SHARED_REGION: "eu",
        PLATFORM_API_SECRET: "nope",
        PLATFORM_MFE_ASSET_TRACKER_ENV_TOKEN: "nope",
        HOME: "/root",
      },
      now: () => new Date("2026-01-01T00:00:00Z"),
    })
    expect(result.refused.sort()).toEqual([
      "PLATFORM_API_SECRET",
      "PLATFORM_MFE_ASSET_TRACKER_ENV_TOKEN",
    ])
    expect(result.sources).toMatchObject({
      environment: "PLATFORM_ENVIRONMENT",
      "mfes.asset-tracker.manifestUrl": "PLATFORM_MFE_ASSET_TRACKER_MANIFEST_URL",
      "shared.REGION": "PLATFORM_SHARED_REGION",
    })
    expect(result.config).toMatchObject({
      environment: "staging",
      source: "entrypoint",
      shared: { REGION: "eu" },
      mfes: {
        "asset-tracker": {
          enabled: false,
          manifestUrl: "https://cdn/m.json",
          env: { FROM_BASE: 1, API_BASE_URL: "https://api" },
        },
      },
    })
    const written = JSON.parse(readFileSync(result.outPath!, "utf8"))
    expect(written.$schema).toContain("runtime-config")
    expect(JSON.stringify(written)).not.toContain("nope")
    expect(written.generatedAt).toBe("2026-01-01T00:00:00.000Z")
  })

  it("parses CLI arguments and exits non-zero on invalid input", () => {
    expect(
      parseArgs(["--out", "x.json", "--base=b.json", "--known", "a,b", "--print"])
    ).toEqual({ out: "x.json", base: "b.json", known: ["a", "b"], print: true, help: false })
    expect(() => parseArgs(["--bogus"])).toThrowError(/Unknown argument/)
    const logs: string[] = []
    const errors: string[] = []
    const io = { log: (m: string) => logs.push(m), error: (m: string) => errors.push(m) }
    expect(runEntrypoint([], {}, io)).toBe(2)
    expect(runEntrypoint(["--help"], {}, io)).toBe(0)
    const dir = tmp()
    expect(
      runEntrypoint(
        ["--out", "config.json"],
        { PLATFORM_ENVIRONMENT: "prod", PLATFORM_DB_PASSWORD: "x" },
        io,
        dir
      )
    ).toBe(0)
    expect(errors.some((line) => line.includes("refused PLATFORM_DB_PASSWORD"))).toBe(true)
    expect(logs.some((line) => line.includes("environment ← PLATFORM_ENVIRONMENT"))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, "config.json"), "utf8")).environment).toBe("prod")
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ environment: 12 }))
    expect(runEntrypoint(["--out", "config.json", "--base", "bad.json"], {}, io, dir)).toBe(1)
    expect(runEntrypoint(["--print"], { PLATFORM_ENVIRONMENT: "x" }, io, dir)).toBe(0)
    expect(logs[logs.length - 1]).toContain('"environment": "x"')
  })
})
