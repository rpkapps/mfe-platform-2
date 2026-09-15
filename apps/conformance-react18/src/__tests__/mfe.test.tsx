import { within } from "@testing-library/dom"
import { describe, expect, it } from "vitest"
import { createTestBridge, renderMfe } from "@platform/react/testing"
import { TEST_IDS, USERS } from "@platform-internal/conformance"

import definition from "../mfe"

describe("legacy-reports", () => {
  it("mounts under its legacy prefix and exposes React 18 widgets", async () => {
    const bridge = createTestBridge({ mfeId: "legacy-reports", routePrefix: "/legacy/reports", user: { id: USERS.viewer.id, displayName: USERS.viewer.displayName }, permissionGroups: USERS.viewer.groups, env: { API_BASE_URL: "https://api", EXPORT_FORMATS: "csv" } })
    const mounted = renderMfe(definition, { bridge, path: "/legacy/reports" })
    await within(mounted.container).findByTestId(TEST_IDS.legacyReports.root)
    expect(definition.widgets.map((widget) => widget.id)).toEqual(["report-summary", "stacked-modal"])
    mounted.dispose()
  })
})
