import { describe, expect, it } from "vitest"

import definition from "../mfe"

describe("widget-b", () => {
  it("exposes React 18 widgets only", () => {
    expect(definition.hasRoutes).toBe(false)
    expect(definition.widgets.map((widget) => widget.id)).toEqual(["counter-widget"])
  })
})
