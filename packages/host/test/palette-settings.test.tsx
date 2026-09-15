import { describe, expect, it } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { PlatformProvider } from "../src/react/context"
import { CommandPalette } from "../src/react/palette"
import { SettingsHost } from "../src/react/settings"
import { createTestHost, fakeFetch, fakeLoader } from "./fixtures"

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
    expect(screen.getByText("Airy")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Advanced" }))
    await userEvent.click(screen.getByRole("button", { name: "Open Advanced" }))
    expect(host.navigation.getLocation().pathname).toBe("/asset-tracker/settings")
  })
})
