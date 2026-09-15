import { describe, expect, it } from "vitest"

import definition from "../mfe"

describe("field-widgets", () => {
  it("exposes React 18 widgets only", () => {
    expect(definition.hasRoutes).toBe(false)
    expect(definition.widgets.map((widget) => widget.id)).toEqual(["rig-status"])
  })
})
