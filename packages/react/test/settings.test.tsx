import { describe, expect, it } from "vitest"
import { act, render } from "@testing-library/react"
import { z } from "zod"
import {
  HelpRegistration,
  ReleaseNotesRegistration,
  SettingsRegistration,
  useRegisterSettingsField,
  useRegisterSettingsGroup,
} from "../src/hooks/registrations"
import { usePlatform } from "../src/hooks/context"
import { isSettingsRendererSurface } from "../src/surfaces"
import type { SettingsController, SettingsRendererSurface } from "../src/types"
import { PlatformTestProvider } from "../src/testing"
import { bridgeFor, flush } from "./helpers"

const controllerOf = (value: string): SettingsController<string> => ({
  value,
  setValue: () => {},
  reset: () => {},
  validation: { valid: true },
  loading: false,
  error: null,
  ids: { input: "i", label: "l", description: "d", error: "e" },
  dependencies: {},
})

describe("settings registration", () => {
  it("registers a group with inferred metadata and removes it on unmount", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const Group = () => {
      useRegisterSettingsGroup({
        key: "display",
        title: "Display",
        fields: {
          density: { defaultValue: "comfortable", options: [{ value: "comfortable", label: "Comfortable" }] },
          showHints: { defaultValue: true, schema: z.boolean() },
        },
      })
      return null
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <Group />
      </PlatformTestProvider>
    )
    const [group] = bridge.registries.settings.list()
    expect(group?.qualifiedKey).toBe("a:display")
    expect(group?.fields.map((field) => [field.key, field.kind, field.label])).toEqual([
      ["density", "select", "Density"],
      ["showHints", "boolean", "Show hints"],
    ])
    expect(bridge.diagnostics.events.at(-1)).toMatchObject({ type: "registration", kind: "settings", action: "added", key: "a:display" })
    view.unmount()
    expect(bridge.registries.settings.list()).toHaveLength(0)
  })

  it("converts a renderer component into a mount/update/dispose surface rendered with the MFE's providers", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const Renderer = ({ controller }: { controller: SettingsController<string> }) => {
      const user = usePlatform((platform) => platform.user?.displayName)
      return (
        <label>
          {user}: <input value={controller.value} onChange={(event) => controller.setValue(event.target.value)} />
        </label>
      )
    }
    render(
      <PlatformTestProvider bridge={bridge}>
        <SettingsRegistration definition={{ key: "theme", fields: { accent: { defaultValue: "blue", renderer: Renderer } } }} />
      </PlatformTestProvider>
    )
    const group = bridge.registries.settings.list()[0]!
    const field = group.definition.fields.accent!
    expect(group.fields[0]?.customRenderer).toBe(true)
    expect(isSettingsRendererSurface(field.renderer)).toBe(true)
    const surface = field.renderer as SettingsRendererSurface<string>

    const container = document.createElement("div")
    document.body.append(container)
    let handle!: ReturnType<typeof surface.mount>
    await act(async () => {
      handle = surface.mount(container, controllerOf("blue"))
    })
    const surfaceRoot = container.querySelector("[data-platform-surface]")!
    expect(surfaceRoot.getAttribute("data-mfe")).toBe("a")
    expect(container.querySelector("input")?.value).toBe("blue")
    expect(container.textContent).toContain("Test User")
    await act(async () => handle.update(controllerOf("red")))
    expect(container.querySelector("input")?.value).toBe("red")
    await act(async () => handle.dispose())
    expect(container.childElementCount).toBe(0)
    container.remove()
  })

  it("wraps async option providers with the typed platform and keeps the latest predicates", async () => {
    const bridge = bridgeFor({ mfeId: "a", permissionGroups: ["admin"] })
    render(
      <PlatformTestProvider bridge={bridge}>
        <SettingsRegistration
          definition={{
            key: "sources",
            fields: {
              source: {
                defaultValue: "",
                options: async ({ platform }) => [
                  { value: String((platform as { permissionGroups: string[] }).permissionGroups[0]), label: "x" },
                ],
                visibleWhen: (state) => state.enabled === true,
              },
            },
          }}
        />
      </PlatformTestProvider>
    )
    const field = bridge.registries.settings.list()[0]!.definition.fields.source!
    const options = await (field.options as (ctx: unknown) => Promise<{ value: string }[]>)({ signal: new AbortController().signal, state: {}, platform: null })
    expect(options[0]?.value).toBe("admin")
    expect(field.visibleWhen?.({ enabled: true })).toBe(true)
    expect(field.visibleWhen?.({ enabled: false })).toBe(false)
  })

  it("merges independently registered fields of a group and removes them one by one", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const FieldA = () => {
      useRegisterSettingsField({ group: { key: "display", title: "Display" }, key: "density", defaultValue: "compact" })
      return null
    }
    const FieldB = () => {
      useRegisterSettingsField({ group: "display", key: "hints", defaultValue: true })
      return null
    }
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <FieldA />
        <FieldB />
      </PlatformTestProvider>
    )
    await flush()
    let [group] = bridge.registries.settings.list()
    expect(group?.qualifiedKey).toBe("a:display")
    expect(group?.definition.title).toBe("Display")
    expect(Object.keys(group?.definition.fields ?? {})).toEqual(["density", "hints"])
    view.rerender(
      <PlatformTestProvider bridge={bridge}>
        <FieldA />
      </PlatformTestProvider>
    )
    ;[group] = bridge.registries.settings.list()
    expect(Object.keys(group?.definition.fields ?? {})).toEqual(["density"])
    view.unmount()
    expect(bridge.registries.settings.list()).toHaveLength(0)
  })

  it("rejects invalid groups with a PlatformError", () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const Bad = () => {
      useRegisterSettingsGroup({ key: "Bad Key", fields: {} })
      return null
    }
    expect(() =>
      render(
        <PlatformTestProvider bridge={bridge}>
          <Bad />
        </PlatformTestProvider>
      )
    ).toThrowError(expect.objectContaining({ code: "SETTINGS_INVALID" }))
  })
})

describe("help and release notes", () => {
  it("registers entries and converts content components into mountable surfaces", async () => {
    const bridge = bridgeFor({ mfeId: "a" })
    const Guide = () => <article>Guide body</article>
    const view = render(
      <PlatformTestProvider bridge={bridge}>
        <HelpRegistration definition={[{ id: "getting-started", title: "Getting started", content: Guide }, { id: "faq", title: "FAQ", href: "https://example.test" }]} />
        <ReleaseNotesRegistration definition={{ id: "v2", version: "2.0.0", title: "Version 2", content: Guide }} />
      </PlatformTestProvider>
    )
    const help = bridge.registries.help.list()
    expect(help.map((entry) => entry.qualifiedId)).toEqual(["a:getting-started", "a:faq"])
    const content = help[0]!.definition.content!
    const container = document.createElement("div")
    document.body.append(container)
    let handle!: { dispose(): void }
    await act(async () => {
      handle = content.mount(container)
    })
    expect(container.textContent).toContain("Guide body")
    expect(container.querySelector("[data-platform-surface]")?.getAttribute("data-platform-surface")).toBe("help")
    await act(async () => handle.dispose())
    expect(container.childElementCount).toBe(0)

    const notes = bridge.registries.releaseNotes.list()
    expect(notes[0]?.qualifiedId).toBe("a:v2")
    expect(typeof notes[0]?.definition.content?.mount).toBe("function")
    view.unmount()
    expect(bridge.registries.help.list()).toHaveLength(0)
    expect(bridge.registries.releaseNotes.list()).toHaveLength(0)
    container.remove()
  })
})
