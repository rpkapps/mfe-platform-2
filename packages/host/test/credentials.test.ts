import { describe, expect, it } from "vitest"
import type { CapabilityId } from "@platform-internal/core"

import { createTestHost, definition, fakeFetch, fakeLoader, manifest, ORIGIN } from "./fixtures"

const MANIFEST_URL = `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`

async function mountWith(
  overrides: Parameters<typeof createTestHost>[0] & { capabilities?: CapabilityId[] } = {}
) {
  const { capabilities, ...hostOptions } = overrides
  const def = definition()
  const host = createTestHost({
    fetch: fakeFetch({
      [MANIFEST_URL]: manifest({ capabilities: capabilities ?? ["commands"] }),
    }),
    loader: fakeLoader({ "asset-tracker": def }),
    ...hostOptions,
  })
  const container = document.createElement("div")
  await host.remotes.mount("asset-tracker", { container })
  return { host, bridge: def.lastBridge! }
}

describe("the credential port", () => {
  it("issues tokens when the capability is approved and the shell supplied an adapter", async () => {
    const requests: unknown[] = []
    const { bridge } = await mountWith({
      capabilities: ["auth"],
      credentials: {
        getToken: (request) => {
          requests.push(request)
          return Promise.resolve("token-1")
        },
        subscribe: () => () => {},
      },
      policy: { credentialOrigins: ["https://api.test"] },
    })
    await expect(bridge.credentials.getToken({ audience: "assets" })).resolves.toBe("token-1")
    expect(requests).toEqual([{ audience: "assets" }])
    // The shell's own origin is always allowed and is never listed here.
    expect(bridge.credentials.allowedOrigins).toEqual(["https://api.test"])
  })

  it("denies a remote that was not granted the auth capability, and says which it is", async () => {
    const { bridge } = await mountWith({
      capabilities: ["commands"],
      credentials: { getToken: () => Promise.resolve("token-1"), subscribe: () => () => {} },
    })
    expect(bridge.capabilities).not.toContain("auth")
    await expect(bridge.credentials.getToken()).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
      override: "mfe.config.ts → capabilities",
    })
  })

  it("denies an approved remote when the shell supplied no adapter", async () => {
    const { bridge } = await mountWith({ capabilities: ["auth"] })
    expect(bridge.capabilities).toContain("auth")
    await expect(bridge.credentials.getToken()).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
      override: "createPlatformHost → credentials",
    })
  })

  it("never hands a denied remote an origin it could send a token to", async () => {
    const { bridge } = await mountWith({
      capabilities: ["commands"],
      policy: { credentialOrigins: ["https://api.test"] },
    })
    expect(bridge.credentials.allowedOrigins).toEqual([])
  })
})
