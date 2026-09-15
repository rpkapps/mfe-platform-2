import { describe, expect, it } from "vitest"

import { createTestHost, definition, fakeFetch, fakeLoader, manifest, ORIGIN } from "./fixtures"

const MANIFEST_URL = `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`

function hostWith(devtools: "always" | "never" = "always") {
  return createTestHost({
    fetch: fakeFetch({
      [MANIFEST_URL]: manifest({
        capabilities: ["commands", "settings"],
        permissionGroups: ["admin"],
      }),
    }),
    loader: fakeLoader({ "asset-tracker": definition() }),
    devtools: { policy: devtools },
    context: { permissionGroups: ["admin"], user: { id: "u1", displayName: "Ada" } },
  })
}

describe("developer-tools fault injection", () => {
  it("is inert until a fault is set", async () => {
    const host = hostWith()
    expect(host.remotes.faults()).toEqual({
      unavailable: [],
      incompatibleShared: false,
      denyGroups: false,
      droppedCapabilities: [],
    })
    await expect(host.remotes.load("asset-tracker")).resolves.toMatchObject({
      mfeId: "asset-tracker",
    })
  })

  it("makes a remote unavailable, and lets it recover", async () => {
    const host = hostWith()
    host.remotes.setFault("unavailable", ["asset-tracker"])
    await expect(host.remotes.load("asset-tracker")).rejects.toMatchObject({
      code: "REMOTE_LOAD_FAILED",
      source: "devtools:faults",
    })
    host.remotes.setFault("unavailable", [])
    await expect(host.remotes.load("asset-tracker")).resolves.toMatchObject({
      mfeId: "asset-tracker",
    })
  })

  it("denies every permission group through the preflight", async () => {
    const host = hostWith()
    host.remotes.setFault("denyGroups", true)
    await expect(host.remotes.load("asset-tracker")).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      details: { missingGroups: ["admin"] },
    })
  })

  it("withholds a capability from the bridge", async () => {
    const def = definition()
    const host = createTestHost({
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest({ capabilities: ["commands", "settings"] }),
      }),
      loader: fakeLoader({ "asset-tracker": def }),
      devtools: { policy: "always" },
    })
    host.remotes.setFault("droppedCapabilities", ["settings"])
    await host.remotes.mount("asset-tracker", { container: document.createElement("div") })
    expect(def.lastBridge!.capabilities).toContain("commands")
    expect(def.lastBridge!.capabilities).not.toContain("settings")
  })

  it("pins every shared request to a range nothing satisfies", async () => {
    let seen: { name: string; requiredVersion: string }[] = []
    const host = createTestHost({
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest({
          shared: [
            {
              name: "react",
              requiredVersion: "^19.0.0",
              version: "19.3.0",
              scope: "react19",
              singleton: true,
              shared: true,
              reason: "inferred",
            },
            {
              name: "@tecton/react",
              requiredVersion: "*",
              scope: "react19",
              singleton: false,
              shared: false,
              reason: "source-package",
            },
          ],
        }),
      }),
      loader: {
        ...fakeLoader({ "asset-tracker": definition() }),
        async load(loaded) {
          seen = loaded.shared.map((request) => ({
            name: request.name,
            requiredVersion: request.requiredVersion,
          }))
          return definition()
        },
      },
      devtools: { policy: "always" },
    })
    host.remotes.setFault("incompatibleShared", true)
    await host.remotes.load("asset-tracker")
    // Only the requests that were actually being shared are pinned; a bundled
    // source package has no shared resolution to break.
    expect(seen).toEqual([
      { name: "react", requiredVersion: "^99.0.0" },
      { name: "@tecton/react", requiredVersion: "*" },
    ])
  })

  it("cannot be reached where the developer tools are not allowed", async () => {
    const host = hostWith("never")
    host.remotes.setFault("unavailable", ["asset-tracker"])
    expect(host.remotes.faults().unavailable).toEqual([])
    await expect(host.remotes.load("asset-tracker")).resolves.toMatchObject({
      mfeId: "asset-tracker",
    })
  })
})
