import { describe, expect, it } from "vitest"

import definition from "../mfe"

describe("widget-a", () => {
  it("is a widget library without routes", () => {
    expect(definition.hasRoutes).toBe(false)
    expect(definition.widgets.map((widget) => widget.id)).toEqual(["kpi-tile", "modal-widget"])
    expect(definition.registrations?.commands?.[0]?.id).toBe("refresh-kpis")
  })
})
