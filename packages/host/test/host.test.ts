import { describe, expect, it, vi } from "vitest"
import { createMemoryStorageBackend, PlatformError } from "@platform-internal/core"

import { settingsStorageKey } from "../src/bridge"
import { createTestHost, definition, fakeFetch, fakeLoader, manifest, ORIGIN } from "./fixtures"

const MANIFEST_URL = `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`

describe("createPlatformHost — loading", () => {
  it("resolves, fetches, validates and loads a remote, recording state and diagnostics", async () => {
    const def = definition()
    const host = createTestHost({
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": def }),
    })
    expect(host.remotes.resolveManifestUrl("asset-tracker")).toEqual({
      url: MANIFEST_URL,
      source: "registry",
    })
    const loaded = await host.remotes.load("asset-tracker")
    expect(loaded).toBe(def)
    const record = host.remotes.get("asset-tracker")!
    expect(record).toMatchObject({
      loaded: true,
      state: "idle",
      manifestSource: "registry",
      routePrefix: "/asset-tracker",
      version: "1.2.3",
      reactVersion: "19.3.0",
      routerVersion: "1.170.36",
    })
    expect(host.diagnostics.list({ type: "manifest.loaded" })).toHaveLength(1)
    expect(host.diagnostics.list({ type: "shared.resolved" })).toHaveLength(1)
    // Static registrations are live without mounting.
    expect(host.registries.commands.get("asset-tracker:go-assets")?.definition.route).toBe(
      "/assets"
    )
    expect(host.registries.help.list().map((entry) => entry.qualifiedId)).toEqual([
      "asset-tracker:intro",
    ])
    // Second load is cached.
    await host.remotes.load("asset-tracker")
    expect((host.loader as ReturnType<typeof fakeLoader>).loads).toBe(1)
  })

  it("shares one in-flight load; a caller's abort detaches only that caller", async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const fetchSignals: (AbortSignal | undefined)[] = []
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      fetchSignals.push(init?.signal ?? undefined)
      await gate
      return new Response(JSON.stringify(manifest()), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })
    const host = createTestHost({
      fetch: fetch as unknown as typeof globalThis.fetch,
      loader: fakeLoader({ "asset-tracker": definition() }),
    })
    const first = new AbortController()
    const second = new AbortController()
    const a = host.remotes.load("asset-tracker", { signal: first.signal })
    const b = host.remotes.load("asset-tracker", { signal: second.signal })
    a.catch(() => undefined)
    first.abort()
    await expect(a).rejects.toMatchObject({ code: "REMOTE_LOAD_FAILED" })
    // The shared fetch keeps running for the second caller.
    expect(fetchSignals[0]?.aborted).toBe(false)
    expect(host.remotes.get("asset-tracker")?.error).toBeUndefined()
    release()
    await expect(b).resolves.toBeDefined()
    expect(host.remotes.get("asset-tracker")).toMatchObject({ loaded: true, state: "idle" })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("aborts the shared load once every caller has aborted", async () => {
    const fetchSignals: (AbortSignal | undefined)[] = []
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        fetchSignals.push(init?.signal ?? undefined)
        await new Promise<void>((resolve) =>
          init?.signal?.addEventListener("abort", () => resolve())
        )
        throw new PlatformError({ code: "MANIFEST_FETCH_FAILED", message: "aborted" })
      }
    )
    const host = createTestHost({
      fetch: fetch as unknown as typeof globalThis.fetch,
      loader: fakeLoader({ "asset-tracker": definition() }),
    })
    const first = new AbortController()
    const second = new AbortController()
    const a = host.remotes.load("asset-tracker", { signal: first.signal })
    const b = host.remotes.load("asset-tracker", { signal: second.signal })
    first.abort()
    await expect(a).rejects.toBeDefined()
    expect(fetchSignals[0]?.aborted).toBe(false)
    second.abort()
    await expect(b).rejects.toBeDefined()
    expect(fetchSignals[0]?.aborted).toBe(true)
    // Nothing failed from the host's point of view; the next caller starts afresh.
    expect(host.remotes.get("asset-tracker")?.error).toBeUndefined()
    expect(host.diagnostics.list({ type: "manifest.failed" })).toHaveLength(0)
    fetch.mockImplementation(
      async () =>
        new Response(JSON.stringify(manifest()), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    )
    await expect(host.remotes.load("asset-tracker")).resolves.toBeDefined()
    expect(host.remotes.get("asset-tracker")).toMatchObject({ loaded: true, state: "idle" })
  })

  it("fails with the right codes: unknown, origin denied, invalid, protocol, disabled, preflight, restart required", async () => {
    const codes = async (opts: Parameters<typeof createTestHost>[0]) => {
      const host = createTestHost(opts)
      try {
        await host.remotes.load("asset-tracker")
        return "ok"
      } catch (error) {
        return (error as PlatformError).code
      }
    }
    expect(await codes({ fetch: fakeFetch({}), loader: fakeLoader({}) })).toBe(
      "MANIFEST_FETCH_FAILED"
    )
    expect(
      await codes({
        fetch: fakeFetch({}),
        loader: fakeLoader({}),
        config: {
          mfes: { "asset-tracker": { manifestUrl: "https://evil.example.com/m.json" } },
          allowedOrigins: ["https://cdn.example.com"],
        },
      })
    ).toBe("MANIFEST_ORIGIN_DENIED")
    // A registry entry's own origin is trusted.
    expect(
      await codes({
        fetch: fakeFetch({ "https://reg.example.com/m.json": manifest() }),
        loader: fakeLoader({ "asset-tracker": definition() }),
        registry: [{ mfeId: "asset-tracker", manifestUrl: "https://reg.example.com/m.json" }],
      })
    ).toBe("ok")
    expect(
      await codes({
        fetch: fakeFetch({ [MANIFEST_URL]: { mfeId: "asset-tracker" } }),
        loader: fakeLoader({}),
      })
    ).toBe("MANIFEST_INVALID")
    expect(
      await codes({
        fetch: fakeFetch({ [MANIFEST_URL]: manifest({ protocolVersion: "2.0" }) }),
        loader: fakeLoader({}),
      })
    ).toBe("PROTOCOL_INCOMPATIBLE")
    expect(
      await codes({
        fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
        loader: fakeLoader({}),
        config: { mfes: { "asset-tracker": { enabled: false } } },
      })
    ).toBe("REMOTE_DISABLED")
    expect(
      await codes({
        fetch: fakeFetch({ [MANIFEST_URL]: manifest({ enabled: false }) }),
        loader: fakeLoader({}),
      })
    ).toBe("REMOTE_DISABLED")
    expect(
      await codes({
        fetch: fakeFetch({
          [MANIFEST_URL]: manifest({ permissionGroups: ["admin", "finance"] }),
        }),
        loader: fakeLoader({}),
      })
    ).toBe("PERMISSION_DENIED")
    expect(
      await codes({
        fetch: fakeFetch({
          [MANIFEST_URL]: manifest({ permissionGroups: ["admin", "finance"] }),
        }),
        loader: fakeLoader({}),
        policy: { preflight: false },
      })
    ).toBe("REMOTE_LOAD_FAILED")
    expect(
      await codes({
        fetch: fakeFetch({
          [MANIFEST_URL]: manifest({
            dev: { hmr: true, restartRequired: true, restartReason: "manifest changed" },
          }),
        }),
        loader: fakeLoader({}),
      })
    ).toBe("DEV_RESTART_REQUIRED")
    expect(
      await codes({
        fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
        loader: fakeLoader({
          "asset-tracker": definition({ protocolVersion: "3.0" }) as never,
        }),
      })
    ).toBe("ok")
  })

  it("records the missing groups of a preflight failure", async () => {
    const host = createTestHost({
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest({ permissionGroups: ["admin", "finance"] }),
      }),
      loader: fakeLoader({}),
    })
    await expect(host.remotes.load("asset-tracker")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      details: { missingGroups: ["finance"] },
    })
    expect(host.diagnostics.list({ type: "preflight.denied" })[0]).toMatchObject({
      missingGroups: ["finance"],
      mfeId: "asset-tracker",
    })
    expect(host.remotes.get("asset-tracker")?.state).toBe("unavailable")
  })

  it("applies runtime config refreshes (enable/disable and manifest URL)", async () => {
    let next = { environment: "test", mfes: { "asset-tracker": { enabled: false } } }
    const host = createTestHost({
      fetch: fakeFetch({ [MANIFEST_URL]: manifest(), [`${ORIGIN}/other.json`]: manifest() }),
      loader: fakeLoader({ "asset-tracker": definition() }),
      refreshRuntimeConfig: async () =>
        (await import("@platform-internal/core")).parseRuntimeConfig(next, "refresh"),
    })
    await host.remotes.load("asset-tracker")
    const events: string[][] = []
    host.events.on("config.changed", (payload) => events.push(payload.changes))
    await host.config.refresh()
    expect(events[0]).toEqual(["mfes.asset-tracker.enabled"])
    expect(host.remotes.get("asset-tracker")?.enabled).toBe(false)
    await expect(host.remotes.load("asset-tracker")).rejects.toMatchObject({
      code: "REMOTE_DISABLED",
    })
    next = {
      environment: "test",
      mfes: {
        "asset-tracker": { enabled: true, manifestUrl: `${ORIGIN}/other.json` } as never,
      },
    }
    await host.config.refresh()
    expect(host.remotes.get("asset-tracker")?.loaded).toBe(false)
    await host.remotes.load("asset-tracker")
    expect(host.remotes.get("asset-tracker")).toMatchObject({
      manifestUrl: `${ORIGIN}/other.json`,
      manifestSource: "runtime-config",
    })
  })

  it("setLocalOverride persists and takes precedence; retry invalidates and reloads", async () => {
    const storage = createMemoryStorageBackend()
    const loader = fakeLoader({ "asset-tracker": definition() })
    const host = createTestHost({
      storage,
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest(),
        "http://localhost:5173/platform-manifest.json": manifest({
          dev: { hmr: true, origin: "http://localhost:5173" },
        }),
      }),
      loader,
      policy: { allowedOrigins: ["http://localhost:5173"] },
    })
    await host.remotes.load("asset-tracker")
    host.remotes.setLocalOverride(
      "asset-tracker",
      "http://localhost:5173/platform-manifest.json"
    )
    expect(host.remotes.resolveManifestUrl("asset-tracker")).toEqual({
      url: "http://localhost:5173/platform-manifest.json",
      source: "override",
    })
    expect(host.remotes.localOverrides()).toEqual({
      "asset-tracker": "http://localhost:5173/platform-manifest.json",
    })
    await host.remotes.retry("asset-tracker")
    expect(loader.invalidated).toEqual(["asset-tracker", "asset-tracker"])
    expect(host.remotes.get("asset-tracker")).toMatchObject({
      manifestSource: "override",
      dev: { hmr: true },
    })
    expect(loader.loads).toBe(2)
  })
})

describe("createPlatformHost — mounting", () => {
  it("builds a bridge with namespaced settings port, approved capabilities and instance context", async () => {
    const def = definition()
    const storage = createMemoryStorageBackend()
    const host = createTestHost({
      storage,
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": def }),
      config: {
        environment: "test",
        mfes: {
          "asset-tracker": {
            env: { API_BASE_URL: "https://api.test", SECRET_NOT_DECLARED: "x" },
          },
        },
        shared: { REGION: "eu" },
      },
      policy: { permissionGroups: ["admin"] },
      context: {
        permissionGroups: ["admin", "hidden-group"],
        user: { id: "u1", displayName: "Ada" },
      },
    })
    const container = document.createElement("div")
    const mounted = await host.remotes.mount("asset-tracker", { container, slot: "main" })
    expect(container.textContent).toBe(`mounted ${mounted.instanceId}`)
    expect(container.getAttribute("data-mfe")).toBe("asset-tracker")
    expect(mounted.state).toBe("mounted")
    const bridge = def.lastBridge!
    expect(bridge.mfeId).toBe("asset-tracker")
    expect(bridge.routePrefix).toBe("/asset-tracker")
    expect(bridge.capabilities).toEqual(
      expect.arrayContaining([
        "context",
        "navigation",
        "telemetry",
        "overlays",
        "commands",
        "settings",
      ])
    )
    expect(bridge.host).toEqual({
      dev: false,
      environment: "test",
      headless: undefined,
    })
    const state = bridge.context.getState()
    expect(state.permissionGroups).toEqual(["admin"])
    expect(state.runtime.env).toEqual({ API_BASE_URL: "https://api.test", FEATURE_X: false })
    expect(state.runtime.shared).toEqual({ REGION: "eu" })
    expect(state.remoteRelease?.version).toBe("1.2.3")
    bridge.settingsValues.write("asset-tracker:display.density", { v: 1, value: "compact" })
    expect(
      JSON.parse(
        storage.get(
          "local",
          settingsStorageKey("asset-tracker", "asset-tracker:display.density")
        )!
      )
    ).toMatchObject({ v: 1, value: "compact" })
    expect(bridge.settingsValues.read("asset-tracker:display.density")).toEqual({
      v: 1,
      value: "compact",
    })
    expect(storage.keys("local")).toEqual([
      "platform:asset-tracker:settings:asset-tracker:display.density",
    ])
    expect(host.breadcrumbs.getState().activeInstanceId).toBe(mounted.instanceId)
    mounted.dispose()
    expect(def.disposed).toBe(1)
    expect(
      host.remotes.instances().find((instance) => instance.instanceId === mounted.instanceId)
        ?.state
    ).toBe("disposed")
    expect(host.diagnostics.list({ type: "unmount" })).toHaveLength(1)
  })

  it("isolates instances: a throwing mount does not affect another instance, widgets mount with props", async () => {
    const bad = definition({ mfeId: "legacy-reports", throwOnMount: true })
    const good = definition()
    const host = createTestHost({
      registry: [
        { mfeId: "asset-tracker", manifestUrl: MANIFEST_URL },
        { mfeId: "legacy-reports", manifestUrl: `${ORIGIN}/legacy.json` },
      ],
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest(),
        [`${ORIGIN}/legacy.json`]: manifest({
          mfeId: "legacy-reports",
          entry: { loader: "module-federation", name: "mfe_legacy", file: "remoteEntry.js" },
        }),
      }),
      loader: fakeLoader({ "asset-tracker": good, "legacy-reports": bad }),
    })
    const first = host.remotes.mount("asset-tracker", {
      container: document.createElement("div"),
    })
    const second = host.remotes.mount("legacy-reports", {
      container: document.createElement("div"),
    })
    await expect(second).rejects.toMatchObject({
      code: "MOUNT_FAILED",
      owner: { mfeId: "legacy-reports" },
    })
    const mounted = await first
    expect(mounted.state).toBe("mounted")
    expect(host.remotes.get("legacy-reports")?.state).toBe("mounting")
    expect(
      host.remotes
        .instances()
        .map((instance) => instance.state)
        .sort()
    ).toEqual(["failed", "mounted"])
    expect(host.diagnostics.list({ type: "mount.failed" })).toHaveLength(1)
    const widgetContainer = document.createElement("div")
    const widget = await host.remotes.mountWidget("asset-tracker", "asset-card", {
      container: widgetContainer,
      props: { assetId: "1" },
    })
    expect(widgetContainer.textContent).toBe('widget asset-card {"assetId":"1"}')
    expect(widget.bridge.widgetId).toBe("asset-card")
    widget.setProps({ assetId: "2" })
    expect(good.lastProps).toEqual({ assetId: "2" })
    await expect(
      host.remotes.mountWidget("asset-tracker", "nope", {
        container: document.createElement("div"),
      })
    ).rejects.toMatchObject({ code: "WIDGET_UNKNOWN" })
    widget.dispose()
    expect(host.diagnostics.list({ type: "widget.unmounted" })).toHaveLength(1)
  })

  it("reports a failure to telemetry once, with the error that was thrown", async () => {
    const reported: { error: unknown; attributes: Record<string, unknown> }[] = []
    const telemetry = {
      track: () => {},
      error: (error: unknown, attributes: Record<string, unknown>) =>
        reported.push({ error, attributes }),
    }
    // A dev remote that needs a restart fails in `assertLoadable`, so one error
    // instance travels three channels: the load path emits it, the mount path
    // emits it again, and the mount call site reports it with its boundary.
    const host = createTestHost({
      telemetry,
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest({
          dev: { hmr: true, restartRequired: true, restartReason: "mfe.config.ts changed" },
        }),
      }),
      loader: fakeLoader({}),
    })
    await expect(
      host.remotes.mount("asset-tracker", { container: document.createElement("div") })
    ).rejects.toMatchObject({ code: "DEV_RESTART_REQUIRED" })
    expect(reported).toHaveLength(1)
    expect(reported[0]!.error).toBeInstanceOf(PlatformError)
    expect(reported[0]!.error).toMatchObject({ code: "DEV_RESTART_REQUIRED" })
    // The stack is the one from the throw site, not from the forwarding helper.
    expect((reported[0]!.error as Error).stack).toContain("assertLoadable")
    // The diagnostics the devtools read are unchanged: both events are still there.
    expect(host.diagnostics.list({ minLevel: "error" }).map((event) => event.type)).toEqual([
      "error",
      "mount.failed",
    ])
  })

  it("reports an unknown widget once, from the boundary that owns it", async () => {
    const reported: { error: unknown; attributes: Record<string, unknown> }[] = []
    const host = createTestHost({
      telemetry: {
        track: () => {},
        error: (error: unknown, attributes: Record<string, unknown>) =>
          reported.push({ error, attributes }),
      },
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": definition() }),
    })
    await expect(
      host.remotes.mountWidget("asset-tracker", "does-not-exist", {
        container: document.createElement("div"),
      })
    ).rejects.toMatchObject({ code: "WIDGET_UNKNOWN" })
    expect(reported).toHaveLength(1)
    expect(reported[0]!.error).toMatchObject({ code: "WIDGET_UNKNOWN" })
    expect(reported[0]!.attributes).toMatchObject({
      boundary: "widget",
      mfeId: "asset-tracker",
      widgetId: "does-not-exist",
    })
  })

  it("matches routes by longest prefix (hidden MFEs still own routes) and builds a snapshot", async () => {
    const host = createTestHost({
      registry: [
        { mfeId: "asset-tracker", manifestUrl: MANIFEST_URL },
        {
          mfeId: "asset-tracker-admin",
          routePrefix: "/asset-tracker/admin",
          discoverable: false,
        },
        { mfeId: "widget-lib" },
      ],
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": definition() }),
    })
    expect(host.remotes.matchRoute("/asset-tracker/assets/1")).toEqual({
      mfeId: "asset-tracker",
      routePrefix: "/asset-tracker",
    })
    expect(host.remotes.matchRoute("/asset-tracker/admin/x")).toEqual({
      mfeId: "asset-tracker-admin",
      routePrefix: "/asset-tracker/admin",
    })
    expect(host.remotes.matchRoute("/asset-trackers")).toBeNull()
    expect(host.remotes.matchRoute("/widget-lib")).toEqual({
      mfeId: "widget-lib",
      routePrefix: "/widget-lib",
    })
    await host.remotes.load("asset-tracker")
    const snapshot = host.snapshot()
    expect(snapshot.remotes.map((remote) => remote.mfeId).sort()).toEqual([
      "asset-tracker",
      "asset-tracker-admin",
      "widget-lib",
    ])
    expect(snapshot.shared["asset-tracker"]?.[0]).toMatchObject({
      name: "react",
      outcome: "shared",
    })
    expect(snapshot.commands.registered.map((command) => command.qualifiedId)).toEqual([
      "asset-tracker:go-assets",
    ])
    expect(snapshot.runtimeEnv["asset-tracker"]).toEqual({
      API_BASE_URL: "https://api.default",
      FEATURE_X: false,
    })
    expect(() => JSON.stringify(snapshot)).not.toThrow()
  })
})
