import { it } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { PlatformProvider } from "../src/react/context"
import { SettingsHost } from "../src/react/settings"
import { createTestHost, fakeFetch, fakeLoader } from "./fixtures"
it("dbg", () => {
  const host = createTestHost({ fetch: fakeFetch({}), loader: fakeLoader({}) })
  act(() => { host.registries.settings.register({ key: "display", title: "Display", fields: { compact: { defaultValue: false, label: "Compact mode" } } }, { mfeId: "asset-tracker", instanceId: "i" }) })
  render(<PlatformProvider host={host}><SettingsHost /></PlatformProvider>)
  const all = screen.queryAllByRole("switch")
  process.stdout.write("DBG count " + all.length + "\n")
  try { screen.getByRole("switch", { name: "Compact mode" }) } catch (e) { process.stdout.write("DBG ERR " + String((e as Error).message).slice(0, 1500) + "\n") }
})
