import { describe, expect, it, vi } from "vitest"
import { createMemoryStorageBackend } from "@platform-internal/core"
import { z } from "zod"

import { settingsStorageKey } from "../src/bridge"
import { settingsController } from "../src/settings-controller"
import { createTestHost, fakeFetch, fakeLoader } from "./fixtures"

const owner = { mfeId: "asset-tracker", instanceId: "asset-tracker#1" }

function setup(fields: Record<string, unknown>, storage = createMemoryStorageBackend()) {
  const host = createTestHost({ storage, fetch: fakeFetch({}), loader: fakeLoader({}) })
  host.registries.settings.register(
    { key: "display", title: "Display", fields: fields as never },
    owner
  )
  const group = host.registries.settings.get("asset-tracker:display")!
  return { host, group, storage }
}

describe("settingsController", () => {
  it("resolves stored values, validates commits, resets and reports invalid stored data", () => {
    const storage = createMemoryStorageBackend()
    storage.set(
      "local",
      settingsStorageKey("asset-tracker", "asset-tracker:display.density"),
      JSON.stringify({ v: 1, value: "compact" })
    )
    storage.set(
      "local",
      settingsStorageKey("asset-tracker", "asset-tracker:display.pageSize"),
      JSON.stringify({ v: 1, value: "not a number" })
    )
    const { host, group } = setup(
      {
        density: {
          defaultValue: "comfortable",
          schema: z.enum(["comfortable", "compact"]),
          version: 1,
        },
        pageSize: { defaultValue: 25, schema: z.number().int().min(1).max(100), version: 1 },
      },
      storage
    )
    const density = settingsController(host, group, "density")
    expect(density.getState()).toMatchObject({
      value: "compact",
      origin: "stored",
      isDefault: false,
      validation: { valid: true },
    })
    expect(density.setValue("wide")).toMatchObject({ ok: false })
    expect(density.getState().validation).toMatchObject({ valid: false, recovered: "none" })
    expect(density.setValue("comfortable")).toEqual({ ok: true })
    expect(
      JSON.parse(
        storage.get(
          "local",
          settingsStorageKey("asset-tracker", "asset-tracker:display.density")
        )!
      )
    ).toMatchObject({ v: 1, value: "comfortable" })
    density.reset()
    expect(density.getState()).toMatchObject({
      value: "comfortable",
      origin: "default",
      isDefault: true,
    })
    const pageSize = settingsController(host, group, "pageSize")
    expect(pageSize.getState()).toMatchObject({
      value: 25,
      origin: "default",
      validation: { valid: false, recovered: "default" },
    })
    expect(
      host.diagnostics
        .list({ type: "settings.invalid" })
        .filter((event) => (event as { key: string }).key === "asset-tracker:display.pageSize")
    ).toHaveLength(1)
    expect(pageSize.controller()).toMatchObject({
      qualifiedKey: "asset-tracker:display.pageSize",
      value: 25,
      defaultValue: 25,
      ids: { input: expect.stringContaining("input") },
    })
    density.dispose()
    pageSize.dispose()
  })

  it("evaluates visibility/disabled/readOnly predicates against the group values and follows storage changes", () => {
    const { host, group, storage } = setup({
      enabled: { defaultValue: false },
      level: {
        defaultValue: 1,
        visibleWhen: (state: { enabled: boolean }) => state.enabled,
        disabledWhen: (state: { enabled: boolean }) => !state.enabled,
      },
      locked: { defaultValue: "x", readOnlyWhen: () => true },
    })
    const level = settingsController(host, group, "level")
    expect(level.getState()).toMatchObject({
      visible: false,
      disabled: true,
      groupValues: { enabled: false, level: 1, locked: "x" },
    })
    const enabled = settingsController(host, group, "enabled")
    enabled.setValue(true)
    expect(level.getState()).toMatchObject({ visible: true, disabled: false })
    storage.emitExternal(
      "local",
      settingsStorageKey("asset-tracker", "asset-tracker:display.enabled"),
      JSON.stringify({ v: undefined, value: false })
    )
    expect(level.getState().visible).toBe(false)
    const locked = settingsController(host, group, "locked")
    expect(locked.setValue("y")).toMatchObject({
      ok: false,
      message: expect.stringContaining("read-only"),
    })
    level.dispose()
    enabled.dispose()
    locked.dispose()
  })

  it("loads async options with abort, caching, retry and stale-selection detection", async () => {
    const calls: AbortSignal[] = []
    let fail = false
    const provider = vi.fn(
      async ({ signal, state }: { signal: AbortSignal; state: Record<string, unknown> }) => {
        calls.push(signal)
        if (fail) throw new Error("backend down")
        await new Promise((resolve) => setTimeout(resolve, 5))
        return state.region === "eu"
          ? [
              { value: "de", label: "Germany" },
              { value: "fr", label: "France" },
            ]
          : [{ value: "us", label: "United States" }]
      }
    )
    const { host, group } = setup({
      region: { defaultValue: "eu" },
      country: { defaultValue: "us", options: provider, optionsCacheMs: 10_000 },
    })
    const country = settingsController(host, group, "country")
    expect(country.getState().optionsStatus).toBe("idle")
    const first = country.loadOptions()
    const second = country.loadOptions()
    expect(calls[0]?.aborted).toBe(true)
    await Promise.all([first, second])
    expect(country.getState()).toMatchObject({ optionsStatus: "ready", stale: true })
    expect(country.getState().options?.map((option) => option.value)).toEqual(["de", "fr"])
    expect(provider).toHaveBeenCalledTimes(2)
    await country.loadOptions()
    expect(provider).toHaveBeenCalledTimes(2)
    country.setValue("de")
    expect(country.getState().stale).toBe(false)
    const region = settingsController(host, group, "region")
    region.setValue("us")
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(provider).toHaveBeenCalledTimes(3)
    expect(country.getState()).toMatchObject({ stale: true })
    expect(country.getState().options?.map((option) => option.value)).toEqual(["us"])
    fail = true
    await country.retryOptions()
    expect(country.getState()).toMatchObject({
      optionsStatus: "error",
      optionsError: "backend down",
    })
    fail = false
    await country.retryOptions()
    expect(country.getState().optionsStatus).toBe("ready")
    country.dispose()
    region.dispose()
    expect(calls[calls.length - 1]?.aborted).toBe(false)
  })
})
