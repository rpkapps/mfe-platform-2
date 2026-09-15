import { afterEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"

import { useCredentials, usePlatformFetch } from "../src/hooks/credentials"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor } from "./helpers"

function wrapperFor(bridge: ReturnType<typeof bridgeFor>) {
  return ({ children }: { children: ReactNode }) => (
    <PlatformTestProvider bridge={bridge}>{children}</PlatformTestProvider>
  )
}

/** A `fetch` that answers with the given statuses in order and records its calls. */
function stubFetch(...statuses: number[]) {
  const calls: { url: string; authorization: string | null }[] = []
  let index = 0
  const impl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({ url: String(input), authorization: headers.get("Authorization") })
    const status = statuses[Math.min(index++, statuses.length - 1)] ?? 200
    return Promise.resolve(new Response("{}", { status }))
  })
  vi.stubGlobal("fetch", impl)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useCredentials", () => {
  it("rejects with AUTH_UNAVAILABLE when the MFE has no auth capability", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const { result } = renderHook(() => useCredentials(), { wrapper: wrapperFor(bridge) })
    await expect(result.current.getToken()).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    })
  })

  it("hands out the shell's token when the capability is granted", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    const { result } = renderHook(() => useCredentials(), { wrapper: wrapperFor(bridge) })
    await expect(result.current.getToken({ audience: "assets" })).resolves.toBe("abc")
    expect(bridge.credentials.requests).toEqual([{ audience: "assets" }])
  })
})

describe("usePlatformFetch", () => {
  it("attaches the bearer token to a same-origin request", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    const calls = stubFetch(200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    const response = await result.current("/api/assets")
    expect(response.status).toBe(200)
    expect(calls).toEqual([{ url: "/api/assets", authorization: "Bearer abc" }])
  })

  it("retries a 401 exactly once, with forceRefresh, and returns a second 401", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    const calls = stubFetch(401, 401)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    const response = await result.current("/api/assets")
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(2)
    expect(bridge.credentials.requests).toEqual([
      { audience: undefined, scopes: undefined, signal: undefined },
      { audience: undefined, scopes: undefined, forceRefresh: true, signal: undefined },
    ])
  })

  it("stops after one refresh when the retry succeeds", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    const calls = stubFetch(401, 200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    const response = await result.current("/api/assets")
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it("returns a non-ok response rather than throwing: the caller decides", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    stubFetch(500)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    const response = await result.current("/api/assets")
    expect(response.status).toBe(500)
    expect(response.ok).toBe(false)
  })

  it("refuses a cross-origin URL before sending it, and records the refusal", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    const calls = stubFetch(200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    await expect(result.current("https://evil.example/collect")).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    })
    expect(calls).toEqual([])
    expect(
      bridge.diagnostics.events.some(
        (event) =>
          event.type === "log" && String(event.message).includes("Refused to attach an access")
      )
    ).toBe(true)
  })

  it("allows an origin the shell allow-listed", async () => {
    const bridge = bridgeFor({
      mfeId: "a",
      capabilities: ["auth"],
      token: "abc",
      credentialOrigins: ["https://api.example"],
    })
    const calls = stubFetch(200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    await result.current("https://api.example/assets")
    expect(calls).toEqual([{ url: "https://api.example/assets", authorization: "Bearer abc" }])
  })

  it("fails with AUTH_FAILED when the shell's adapter cannot issue a token", async () => {
    const bridge = bridgeFor({ mfeId: "a", capabilities: ["auth"], token: "abc" })
    bridge.credentials.getToken = () => Promise.reject(new Error("session expired"))
    const calls = stubFetch(200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    await expect(result.current("/api/assets")).rejects.toMatchObject({ code: "AUTH_FAILED" })
    expect(calls).toEqual([])
  })

  it("surfaces AUTH_UNAVAILABLE when the MFE was never granted the capability", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    stubFetch(200)
    const { result } = renderHook(() => usePlatformFetch(), { wrapper: wrapperFor(bridge) })
    await expect(result.current("/api/assets")).rejects.toMatchObject({
      code: "AUTH_UNAVAILABLE",
    })
  })
})
