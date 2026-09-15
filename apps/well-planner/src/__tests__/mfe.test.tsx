import { within } from "@testing-library/dom"
import { describe, expect, it } from "vitest"
import { createTestBridge, renderMfe } from "@platform/mfe-react/testing"
import { TEST_IDS, USERS } from "@platform-internal/conformance"

import definition from "../mfe"

describe("well-planner", () => {
  it("mounts the dashboard in an isolated root and registers its commands", async () => {
    const bridge = createTestBridge({
      mfeId: "well-planner",
      routePrefix: "/well-planner",
      user: { id: USERS.admin.id, displayName: USERS.admin.displayName },
      permissionGroups: USERS.admin.groups,
      env: { API_BASE_URL: "https://api", PAGE_SIZE: 10 },
    })
    const mounted = renderMfe(definition, { bridge, path: "/well-planner" })
    await within(mounted.container).findByTestId(TEST_IDS.wellPlanner.userName)
    expect(mounted.container.querySelector('[data-mfe="well-planner"]')).not.toBeNull()
    expect(bridge.registries.commands.list().map((command) => command.definition.id)).toEqual(
      expect.arrayContaining(["increment-counter", "slow-sync", "open-dashboard-help"])
    )
    mounted.dispose()
    expect(bridge.registries.commands.list()).toEqual([])
  })
})
