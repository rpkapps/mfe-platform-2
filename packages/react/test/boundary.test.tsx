import { describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"
import { useState } from "react"
import { PlatformError } from "@platform-internal/core"
import { MfeErrorBoundary, MfeLoading } from "../src/boundary"
import { createMfe } from "../src/mfe"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor, disposeAsync, mountMfe, routeTreeOf } from "./helpers"

describe("MfeErrorBoundary", () => {
  it("isolates a rendering failure, reports it and retries", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const bridge = bridgeFor({ mfeId: "a" })
    let fail = true
    const Boom = () => {
      if (fail) {
        throw new PlatformError({ code: "CAPABILITY_UNAVAILABLE", message: "no storage" })
      }
      return <p>recovered</p>
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <p>sibling</p>
        <MfeErrorBoundary>
          <Boom />
        </MfeErrorBoundary>
      </PlatformTestProvider>
    )
    const fallback = view.container.querySelector("[data-platform-error-fallback]")!
    expect(fallback.getAttribute("role")).toBe("alert")
    expect(fallback.textContent).toContain("[CAPABILITY_UNAVAILABLE] no storage")
    expect(fallback.textContent).toContain("feature-detect")
    expect(fallback.querySelector("a")?.getAttribute("href")).toContain("/platform-context#capabilities")
    expect(view.container.textContent).toContain("sibling")
    expect(bridge.telemetryEvents.some((event) => event.kind === "error" && event.attributes.boundary === "mfe")).toBe(true)
    expect(bridge.diagnostics.events.find((event) => event.type === "error")).toMatchObject({ code: "CAPABILITY_UNAVAILABLE", mfeId: "a" })

    fail = false
    act(() => view.getByText("Retry").click())
    expect(view.container.textContent).toContain("recovered")
    consoleError.mockRestore()
  })

  it("supports custom fallbacks and reset keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const bridge = bridgeFor({ mfeId: "a" })
    const Boom = () => {
      throw new Error("plain")
    }
    const Wrapper = () => {
      const [key, setKey] = useState(0)
      return (
        <MfeErrorBoundary resetKey={key} fallback={({ error }) => <i>custom: {(error as Error).message}</i>}>
          {key === 0 ? <Boom /> : <p>fine</p>}
          <button onClick={() => setKey(1)}>reset</button>
        </MfeErrorBoundary>
      )
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <Wrapper />
        <button onClick={() => {}}>noop</button>
      </PlatformTestProvider>
    )
    expect(view.container.querySelector("i")?.textContent).toBe("custom: plain")
    consoleError.mockRestore()
  })

  it("renders an accessible loading state", () => {
    const view = render(<MfeLoading label="Fetching" />)
    expect(view.getByRole("status").textContent).toBe("Fetching")
  })

  it("keeps a route render error inside the MFE root through the default route error component", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const { routeTree } = routeTreeOf([
      {
        path: "/",
        component: () => {
          throw new Error("route exploded")
        },
      },
    ])
    const definition = createMfe({ mfeId: "a", routeTree })
    const bridge = bridgeFor({ mfeId: "a" })
    const { handle, container } = await mountMfe(definition, bridge)
    const fallback = container.querySelector("[data-platform-error-fallback]")
    expect(fallback?.textContent).toContain("route exploded")
    expect(container.querySelector("[data-platform-root]")).not.toBeNull()
    await disposeAsync(handle)
    container.remove()
    consoleError.mockRestore()
  })
})
