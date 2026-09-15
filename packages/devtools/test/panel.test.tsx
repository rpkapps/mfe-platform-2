import { describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { parseRuntimeConfig } from "@platform-internal/core"
import { createDiagnosticsBus, createSnapshot } from "@platform-internal/diagnostics"

vi.mock("@xyflow/react", () => ({
  ReactFlow: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow">{children}</div>
  ),
  Background: () => null,
  Controls: () => null,
  MiniMap: () => null,
}))

import { DevtoolsPanel } from "../src/panel"
import { registerDevtoolsPanel } from "../src/registry"

function fakeHost() {
  const diagnostics = createDiagnosticsBus()
  diagnostics.emit({
    type: "manifest.resolved",
    url: "http://x/m.json",
    urlSource: "registry",
    cacheBusted: false,
    mfeId: "asset-tracker",
  })
  return {
    diagnostics,
    subscribe: () => () => {},
    snapshot: () =>
      createSnapshot({
        runtimeConfig: parseRuntimeConfig({ environment: "local" }),
        remotes: [
          {
            mfeId: "asset-tracker",
            displayName: "Asset tracker",
            state: "mounted",
            attempts: 1,
            discoverable: true,
            enabled: true,
            loaded: true,
            manifestUrl: "http://x/m.json",
            manifestSource: "registry",
            protocolVersion: "1.0",
            reactVersion: "19.3.0",
            dev: { hmr: true },
            instances: [],
          },
        ],
        diagnostics: diagnostics.list(),
        host: { kind: "shell", environment: "local", protocolVersion: "1.0" },
      }),
  }
}

describe("DevtoolsPanel", () => {
  it("renders the standard tabs and the overview", async () => {
    const view = render(<DevtoolsPanel host={fakeHost()} />)
    for (const title of [
      "Overview",
      "Dependencies",
      "Routes",
      "Commands",
      "Settings",
      "Breadcrumbs",
      "Help",
      "Session",
      "Runtime",
      "Telemetry",
      "Diagnostics",
      "Overlays",
    ]) {
      expect(screen.getByRole("tab", { name: title })).toBeInTheDocument()
    }
    expect(screen.getByTestId("platform-devtools-panel")).toBeInTheDocument()
    expect(screen.getByText("Asset tracker")).toBeInTheDocument()
    expect(screen.getByText("HMR")).toBeInTheDocument()
    expect(screen.getByText("http://x/m.json")).toBeInTheDocument()
    // The panel coalesces host and diagnostics events into a timer; unmount
    // inside `act` so a pending refresh cannot land after the test.
    await act(async () => {
      view.unmount()
    })
  })

  it("shows registered custom panels", async () => {
    const dispose = registerDevtoolsPanel({
      id: "acme",
      title: "Acme",
      render: () => <p>acme panel</p>,
    })
    const view = render(<DevtoolsPanel host={fakeHost()} defaultTab="acme" />)
    expect(screen.getByRole("tab", { name: "Acme" })).toBeInTheDocument()
    expect(screen.getByText("acme panel")).toBeInTheDocument()
    await act(async () => {
      view.unmount()
    })
    dispose()
  })
})
