import { describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createTestHost, fakeLoader, recordingFetch as fakeFetch } from "@platform/host/testing"
import { PlatformProvider } from "@platform/host-react"

import { Breadcrumbs } from "@/components/breadcrumbs"
import { PlatformDevtools } from "@/components/devtools"
import { CommandPalette } from "@/components/palette"
import { SettingsHost } from "@/components/settings"
import { HelpSlot } from "@/components/surfaces"

const owner = {
  mfeId: "asset-tracker",
  instanceId: "asset-tracker#1",
  displayName: "Asset tracker",
}

describe("CommandPalette", () => {
  it("exposes the input, lists grouped results as options and runs commands", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    let ran = 0
    act(() => {
      host.registries.commands.register(
        {
          id: "export",
          label: "Export assets",
          keywords: ["csv"],
          handler: () => {
            ran += 1
          },
        },
        owner
      )
      host.registries.help.register({ id: "faq", title: "Export FAQ" }, owner)
    })
    render(
      <PlatformProvider host={host}>
        <CommandPalette open hotkey={null} />
      </PlatformProvider>
    )
    const input = await screen.findByTestId("shell-palette-input")
    expect(input).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByRole("menuitem").length).toBeGreaterThanOrEqual(2)
    )
    await userEvent.type(input, "csv")
    await waitFor(() => expect(screen.getAllByRole("menuitem")).toHaveLength(1))
    expect(screen.getByRole("menuitem", { name: /Export assets/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("menuitem", { name: /Export assets/ }))
    await waitFor(() => expect(ran).toBe(1))
  })
})

describe("SettingsHost", () => {
  it("infers controls, persists through the controller and links MFE-managed groups", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    act(() => {
      host.registries.settings.register(
        {
          key: "display",
          title: "Display",
          fields: {
            compact: { defaultValue: false, label: "Compact mode" },
            title: { defaultValue: "Hello", label: "Title" },
            density: {
              defaultValue: "a",
              label: "Density",
              options: [
                { value: "a", label: "Airy" },
                { value: "b", label: "Busy" },
              ],
            },
          },
        },
        owner
      )
      host.registries.settings.register(
        {
          key: "advanced",
          title: "Advanced",
          managedBy: "mfe",
          route: "/settings",
          fields: {},
        },
        owner
      )
    })
    render(
      <PlatformProvider host={host}>
        <SettingsHost />
      </PlatformProvider>
    )
    expect(screen.getByRole("navigation", { name: "Settings groups" })).toBeInTheDocument()
    // Groups are listed alphabetically per owner; "Advanced" (MFE-managed) comes first.
    expect(screen.getByRole("button", { name: "Open Advanced" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Display" }))
    const toggle = screen.getByRole("switch", { name: "Compact mode" })
    expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await waitFor(() =>
      expect(host.storage.keys("local")).toContain(
        "platform:asset-tracker:settings:asset-tracker:display.compact"
      )
    )
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeInTheDocument()
    const title = screen.getByRole("textbox", { name: "Title" })
    await userEvent.clear(title)
    await userEvent.type(title, "World")
    await userEvent.tab()
    await waitFor(() =>
      expect(
        JSON.parse(
          host.storage.get(
            "local",
            "platform:asset-tracker:settings:asset-tracker:display.title"
          )!
        )
      ).toMatchObject({ value: "World" })
    )
    expect(screen.getAllByText("Airy").length).toBeGreaterThanOrEqual(1)
    await userEvent.click(screen.getByRole("button", { name: /^Advanced/ }))
    await userEvent.click(screen.getByRole("button", { name: "Open Advanced" }))
    expect(host.navigation.getLocation().pathname).toBe("/asset-tracker/settings")
  })
})

describe("Breadcrumbs, HelpSlot, PlatformDevtools", () => {
  it("renders the shell trail with truncation and announcement; custom renderer flips the store", () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    host.breadcrumbs.setShell([
      { key: "home", label: "Home", href: "/", state: "ready", kind: "shell" },
    ])
    host.breadcrumbs.publish({
      owner: { mfeId: "asset-tracker", instanceId: "i1" },
      updatedAt: 1,
      entries: [
        {
          key: "root",
          label: "Assets",
          href: "/asset-tracker",
          state: "ready",
          kind: "mfe-root",
        },
        { key: "a", label: "A", href: "/asset-tracker/a", state: "ready", kind: "route" },
        { key: "b", label: "B", href: "/asset-tracker/b", state: "ready", kind: "route" },
        { key: "c", label: "Pump 42", state: "loading", kind: "route" },
      ],
    })
    host.breadcrumbs.setActive("i1")
    const view = render(
      <PlatformProvider host={host}>
        <Breadcrumbs maxItems={3} />
      </PlatformProvider>
    )
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeInTheDocument()
    expect(view.container.textContent).toContain("Home")
    expect(view.container.textContent).toContain("Pump 42")
    const items = Array.from(
      view.container.querySelectorAll("[data-slot='breadcrumb-item']")
    ).map((item) => item.textContent)
    expect(items.some((text) => text?.includes("Assets"))).toBe(false)
    expect(items).toHaveLength(4)
    expect(view.container.querySelector("[aria-live]")?.textContent).toContain(
      "Home, Assets, A, B, Pump 42 (loading)"
    )
    view.rerender(
      <PlatformProvider host={host}>
        <Breadcrumbs
          renderer={(entries) => (
            <ol data-custom>
              {entries.map((entry) => (
                <li key={entry.key}>{entry.label}</li>
              ))}
            </ol>
          )}
        />
      </PlatformProvider>
    )
    expect(view.container.querySelector("[data-custom]")).toBeInTheDocument()
    expect(host.breadcrumbs.getState().renderer).toBe("custom")
    view.unmount()
    expect(host.breadcrumbs.getState().renderer).toBe("shell")
  })

  it("lists help entries and mounts their content surfaces", async () => {
    const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
    const dispose = vi.fn()
    act(() => {
      host.registries.help.register(
        {
          id: "faq",
          title: "FAQ",
          description: "Answers",
          content: {
            mount: (container) => {
              container.textContent = "surface content"
              return { dispose }
            },
          },
        },
        { mfeId: "asset-tracker", instanceId: "i1", displayName: "Asset tracker" }
      )
    })
    const view = render(
      <PlatformProvider host={host}>
        <HelpSlot />
      </PlatformProvider>
    )
    expect(screen.getByText("FAQ")).toBeInTheDocument()
    await waitFor(() => expect(view.container.textContent).toContain("surface content"))
    view.unmount()
    expect(dispose).toHaveBeenCalled()
  })

  it("renders nothing when devtools are not allowed and a toggle when they are", async () => {
    const denied = createTestHost({
      fetch: fakeFetch({}),
      loader: fakeLoader({}),
      devtools: { policy: "never" },
    })
    const view = render(
      <PlatformProvider host={denied}>
        <PlatformDevtools />
      </PlatformProvider>
    )
    await act(async () => {})
    expect(view.container.querySelector("[data-testid='platform-devtools-toggle']")).toBeNull()
    const allowed = createTestHost({
      fetch: fakeFetch({}),
      loader: fakeLoader({}),
      devtools: { policy: "always" },
    })
    view.rerender(
      <PlatformProvider host={allowed}>
        <PlatformDevtools />
      </PlatformProvider>
    )
    await waitFor(() =>
      expect(screen.getByTestId("platform-devtools-toggle")).toBeInTheDocument()
    )
  })
})
