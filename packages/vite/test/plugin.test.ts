import { join } from "node:path"

import { describe, expect, it } from "vitest"
import type { Plugin, PluginOption } from "vite"

import { platform } from "../src/index"

const root = join(__dirname, "fixtures", "sample-mfe")

async function flatten(options: PluginOption[]): Promise<Plugin[]> {
  const resolved = await Promise.all(
    options.map(async (entry) => (entry instanceof Promise ? await entry : entry))
  )
  const plugins: Plugin[] = []
  for (const entry of resolved) {
    if (!entry) continue
    if (Array.isArray(entry)) plugins.push(...(await flatten(entry)))
    else plugins.push(entry as Plugin)
  }
  return plugins
}

function names(plugins: Plugin[]): string[] {
  return plugins.map((plugin) => plugin.name)
}

async function defines(plugins: Plugin[]): Promise<Record<string, unknown>> {
  const define = plugins.find((plugin) => plugin.name === "platform:define")!
  const hook = define.config
  const handler = typeof hook === "function" ? hook : hook!.handler
  const result = await handler.call({} as never, {}, { command: "serve", mode: "test" })
  return (result as { define: Record<string, unknown> }).define
}

describe("platform() under Vitest", () => {
  it("returns only the React plugin and the defines (VITEST is set by the runner)", async () => {
    expect(process.env.VITEST).toBeDefined()
    const plugins = await flatten(platform({ root }))
    const list = names(plugins)
    expect(list.some((name) => name.startsWith("vite:react"))).toBe(true)
    expect(list).toContain("platform:define")
    expect(list.filter((name) => name.startsWith("platform:"))).toEqual(["platform:define"])
    expect(
      list.some((name) => /federation|module-federation|tanstack|router|tailwind/i.test(name))
    ).toBe(false)
    expect(await defines(plugins)).toEqual({
      __PLATFORM_MFE_ID__: JSON.stringify("sample-mfe"),
      __PLATFORM_ROUTE_PREFIX__: JSON.stringify("/sample"),
    })
  })

  it("skips the React plugin with react: false and honours explicit mfeId options", async () => {
    const plugins = await flatten(platform({ root, react: false, routePrefix: "/custom" }))
    expect(names(plugins).some((name) => name.startsWith("vite:react"))).toBe(false)
    expect(await defines(plugins)).toEqual({
      __PLATFORM_MFE_ID__: JSON.stringify("sample-mfe"),
      __PLATFORM_ROUTE_PREFIX__: JSON.stringify("/custom"),
    })
  })

  it("composes the full pipeline with test: false, gated out of `vite --mode test`", async () => {
    process.env.MFE_VITE_NO_TEST_ENV_CHECK = "true"
    const plugins = await flatten(platform({ root, test: false }))
    const list = names(plugins)
    expect(list).toEqual(
      expect.arrayContaining([
        "platform:define",
        "platform:css-scope",
        "platform:core",
        "platform:dev",
      ])
    )
    expect(list.some((name) => /tanstack|router/i.test(name))).toBe(true)
    expect(list.some((name) => /federation/i.test(name))).toBe(true)
    expect(list.some((name) => /tailwind/i.test(name))).toBe(true)
    const applies = (mode: string, command: "serve" | "build") =>
      plugins
        .filter((plugin) =>
          typeof plugin.apply === "function"
            ? plugin.apply({}, { command, mode })
            : plugin.apply === undefined || plugin.apply === command
        )
        .map((plugin) => plugin.name)
    const inTest = applies("test", "serve")
    expect(inTest.filter((name) => !name.startsWith("vite:react"))).toEqual(["platform:define"])
    const inDev = applies("development", "serve")
    expect(inDev).toContain("platform:dev")
    expect(inDev.some((name) => /federation/i.test(name))).toBe(true)
    expect(applies("production", "build")).not.toContain("platform:dev")
  })

  it("rejects with a formatted PlatformError for invalid configuration", async () => {
    await expect(flatten(platform({ root, mfeId: "Not Valid" }))).rejects.toThrow(
      /\[platform:MFE_ID_INVALID\]/
    )
  })
})
