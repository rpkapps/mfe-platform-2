import { describe, expect, it } from "vitest"
import { act } from "@testing-library/react"
import { createPortal } from "react-dom"
import { Dialog, DialogTitle } from "@tecton/react/components/dialog"
import { createMfe, createWidget } from "../src/mfe"
import { useOverlayContainer } from "../src/hooks/context"
import { withTecton } from "../src/tecton"
import { bridgeFor, disposeAsync, flush, mountMfe, mountWidget, routeTreeOf } from "./helpers"

function Page() {
  return (
    <div>
      <p>page</p>
      <Dialog isOpen showCloseButton={false}>
        <DialogTitle>Tecton dialog</DialogTitle>
      </Dialog>
    </div>
  )
}

describe("withTecton", () => {
  it("creates one owner-tagged overlay root per mount, portals Tecton dialogs into it, syncs the theme and disposes it", async () => {
    const { routeTree } = routeTreeOf([{ path: "/", component: Page }])
    const definition = withTecton(createMfe({ mfeId: "asset-tracker", routeTree }))
    expect(definition.enhancers.map((enhancer) => enhancer.name)).toEqual(["tecton"])
    expect(withTecton(definition)).toBe(definition)
    expect(definition.enhancers).toHaveLength(1)

    const bridge = bridgeFor({ mfeId: "asset-tracker", context: { resolvedTheme: "dark", theme: "dark" } })
    const { handle, container } = await mountMfe(definition, bridge)
    await flush()
    const roots = document.querySelectorAll("[data-platform-overlay-root]")
    expect(roots).toHaveLength(1)
    const overlayRoot = roots[0]!
    expect(overlayRoot.getAttribute("data-mfe")).toBe("asset-tracker")
    expect(overlayRoot.getAttribute("data-platform-instance")).toBe(bridge.instanceId)
    expect(overlayRoot.parentElement).toBe(document.body)
    expect(overlayRoot.classList.contains("dark")).toBe(true)
    expect(container.querySelector("[data-platform-root]")!.classList.contains("dark")).toBe(true)
    expect(bridge.overlays.getState().roots).toHaveLength(1)

    // the dialog rendered inside the MFE landed in the overlay root, not in the MFE container
    expect(overlayRoot.textContent).toContain("Tecton dialog")
    expect(container.textContent).not.toContain("Tecton dialog")
    expect(overlayRoot.querySelector("[data-slot=dialog-overlay]")).not.toBeNull()

    await act(async () => bridge.setContext({ resolvedTheme: "light", theme: "light" }))
    expect(overlayRoot.classList.contains("dark")).toBe(false)
    expect(container.querySelector("[data-platform-root]")!.classList.contains("dark")).toBe(false)

    await disposeAsync(handle)
    expect(document.querySelectorAll("[data-platform-overlay-root]")).toHaveLength(0)
    expect(bridge.overlays.getState().roots).toHaveLength(0)
    container.remove()
  })
})

describe("useOverlayContainer", () => {
  it("lets non-Tecton MFEs portal into the shell-managed overlay root", async () => {
    const Modal = () => createPortal(<div role="dialog">plain modal</div>, useOverlayContainer())
    const definition = createMfe({ mfeId: "legacy", widgets: { modal: createWidget({ component: Modal }) } })
    const bridge = bridgeFor({ mfeId: "legacy", widgetId: "modal", routePrefix: null })
    const { handle, container } = await mountWidget(definition, bridge, "modal", {})
    const root = document.querySelector("[data-platform-overlay-root]")!
    expect(root.getAttribute("data-mfe")).toBe("legacy")
    expect(root.getAttribute("data-platform-widget")).toBe("modal")
    expect(root.querySelector("[role=dialog]")?.textContent).toBe("plain modal")
    expect(container.querySelector("[role=dialog]")).toBeNull()
    await flush()
    expect(bridge.overlays.getState().layers).toHaveLength(1)
    await disposeAsync(handle)
    expect(document.querySelector("[data-platform-overlay-root]")).toBeNull()
    container.remove()
  })
})
