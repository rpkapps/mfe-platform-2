import { describe, expect, it } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { PlatformError } from "@platform/host"
import {
  createTestHost,
  definition,
  fakeLoader,
  manifest,
  recordingFetch as fakeFetch,
  ORIGIN,
} from "@platform/host/testing"

import { PlatformProvider } from "../src/context"
import { MfeOutlet, WidgetSlot } from "../src/outlet"

const MANIFEST_URL = `${ORIGIN}/mfes/asset-tracker/platform-manifest.json`

describe("MfeOutlet", () => {
  it("mounts the remote and unmounts on removal", async () => {
    const def = definition()
    const host = createTestHost({
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": def }),
    })
    const view = render(
      <PlatformProvider host={host}>
        <MfeOutlet mfeId="asset-tracker" />
      </PlatformProvider>
    )
    const outlet = view.container.querySelector("[data-platform-outlet]")!
    expect(outlet.getAttribute("data-platform-outlet-state")).toBe("loading")
    await waitFor(() =>
      expect(outlet.getAttribute("data-platform-outlet-state")).toBe("mounted")
    )
    expect(outlet.textContent).toContain("mounted asset-tracker#")
    view.unmount()
    expect(def.disposed).toBe(1)
  })

  it("renders failures with code, hint, docs link and retry — never throwing", async () => {
    let attempts = 0
    const fetch = fakeFetch({
      [MANIFEST_URL]: () => (attempts++ === 0 ? { mfeId: "asset-tracker" } : manifest()),
    })
    const host = createTestHost({
      fetch,
      loader: fakeLoader({ "asset-tracker": definition() }),
      config: { environment: "test", retry: { attempts: 0, backoffMs: 0 } },
    })
    const view = render(
      <PlatformProvider host={host}>
        <MfeOutlet mfeId="asset-tracker" />
      </PlatformProvider>
    )
    const outlet = view.container.querySelector("[data-platform-outlet]")!
    await waitFor(() =>
      expect(outlet.getAttribute("data-platform-outlet-state")).toBe("unavailable")
    )
    expect(screen.getByText("MANIFEST_INVALID")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /documentation/i })).toHaveAttribute(
      "href",
      expect.stringContaining("/manifests#validation")
    )
    expect(
      screen.getByText(new PlatformError({ code: "MANIFEST_INVALID", message: "x" }).hint)
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() =>
      expect(outlet.getAttribute("data-platform-outlet-state")).toBe("mounted")
    )
  })

  it("maps permission, disabled and restart-required failures to their states", async () => {
    const cases: [Parameters<typeof manifest>[0], string, string][] = [
      [{ permissionGroups: ["finance"] }, "denied", "PERMISSION_DENIED"],
      [{ enabled: false }, "disabled", "REMOTE_DISABLED"],
      [
        { dev: { hmr: true, restartRequired: true, restartReason: "shared versions changed" } },
        "restart-required",
        "DEV_RESTART_REQUIRED",
      ],
    ]
    for (const [overrides, state, code] of cases) {
      const host = createTestHost({
        fetch: fakeFetch({ [MANIFEST_URL]: manifest(overrides) }),
        loader: fakeLoader({ "asset-tracker": definition() }),
      })
      const view = render(
        <PlatformProvider host={host}>
          <MfeOutlet mfeId="asset-tracker" />
        </PlatformProvider>
      )
      const outlet = view.container.querySelector("[data-platform-outlet]")!
      await waitFor(() => expect(outlet.getAttribute("data-platform-outlet-state")).toBe(state))
      expect(outlet.textContent).toContain(code)
      view.unmount()
    }
  })

  it("shows a mount error for a throwing definition while another outlet keeps working", async () => {
    const host = createTestHost({
      registry: [
        { mfeId: "asset-tracker", manifestUrl: MANIFEST_URL },
        { mfeId: "legacy-reports", manifestUrl: `${ORIGIN}/legacy.json` },
      ],
      fetch: fakeFetch({
        [MANIFEST_URL]: manifest(),
        [`${ORIGIN}/legacy.json`]: manifest({ mfeId: "legacy-reports" }),
      }),
      loader: fakeLoader({
        "asset-tracker": definition(),
        "legacy-reports": definition({ mfeId: "legacy-reports", throwOnMount: true }),
      }),
    })
    const view = render(
      <PlatformProvider host={host}>
        <MfeOutlet mfeId="asset-tracker" />
        <MfeOutlet mfeId="legacy-reports" />
      </PlatformProvider>
    )
    const [good, bad] = Array.from(view.container.querySelectorAll("[data-platform-outlet]"))
    await waitFor(() => expect(bad!.getAttribute("data-platform-outlet-state")).toBe("error"))
    await waitFor(() =>
      expect(good!.getAttribute("data-platform-outlet-state")).toBe("mounted")
    )
    expect(bad!.textContent).toContain("MOUNT_FAILED")
  })
})

describe("WidgetSlot", () => {
  it("mounts widgets, pushes prop changes and renders widget errors", async () => {
    const def = definition()
    const host = createTestHost({
      fetch: fakeFetch({ [MANIFEST_URL]: manifest() }),
      loader: fakeLoader({ "asset-tracker": def }),
    })
    const view = render(
      <PlatformProvider host={host}>
        <WidgetSlot mfeId="asset-tracker" widgetId="asset-card" props={{ assetId: "1" }} />
      </PlatformProvider>
    )
    const slot = view.container.querySelector("[data-platform-widget-slot]")!
    await waitFor(() => expect(slot.getAttribute("data-platform-widget-state")).toBe("mounted"))
    expect(slot.textContent).toContain('{"assetId":"1"}')
    view.rerender(
      <PlatformProvider host={host}>
        <WidgetSlot mfeId="asset-tracker" widgetId="asset-card" props={{ assetId: "2" }} />
      </PlatformProvider>
    )
    await waitFor(() => expect(def.lastProps).toEqual({ assetId: "2" }))
    expect(def.mounts).toBe(1)
    view.rerender(
      <PlatformProvider host={host}>
        <WidgetSlot mfeId="asset-tracker" widgetId="missing" />
      </PlatformProvider>
    )
    const missing = view.container.querySelector("[data-platform-widget-slot='missing']")!
    await waitFor(() =>
      expect(missing.getAttribute("data-platform-widget-state")).toBe("error")
    )
    expect(missing.textContent).toContain("WIDGET_UNKNOWN")
  })
})
