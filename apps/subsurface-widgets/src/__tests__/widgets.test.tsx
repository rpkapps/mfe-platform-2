import { describe, expect, it } from "vitest"

import definition from "../mfe"

describe("subsurface-widgets", () => {
  it("is a widget library without routes", () => {
    expect(definition.hasRoutes).toBe(false)
    expect(definition.widgets.map((widget) => widget.id)).toEqual([
      "production-kpi",
      "fda-status",
    ])
    expect(definition.registrations?.commands?.[0]?.id).toBe("refresh-kpis")
  })
})
