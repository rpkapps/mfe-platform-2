import { createTestBridge, renderMfe } from "@platform/mfe-react/testing"
import { within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import definition from "../mfe"

/**
 * Unit test through the SDK testing helpers: a test bridge stands in for the shell, the
 * MFE mounts in an isolated root, registrations are inspectable and disposed on unmount.
 */
describe("__MFE_ID__", () => {
  it("renders the dashboard and registers its command", async () => {
    const bridge = createTestBridge({
      mfeId: "__MFE_ID__",
      user: { id: "u1", displayName: "Ada" },
      permissionGroups: ["assets:read"],
      env: { API_BASE_URL: "https://api.example.test" },
    })
    const mounted = renderMfe(definition, { bridge, path: "__ROUTE_PREFIX__" })
    await within(mounted.container).findByText("Hello Ada")
    expect(bridge.registries.commands.list().map((command) => command.definition.id)).toContain(
      "say-hello"
    )
    mounted.dispose()
    expect(bridge.registries.commands.list()).toEqual([])
  })
})
