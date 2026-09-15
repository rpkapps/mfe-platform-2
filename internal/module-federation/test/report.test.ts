import { describe, expect, it } from "vitest"

import { buildSharedReport } from "../src/report"
import { manifest } from "./fixtures"

describe("buildSharedReport", () => {
  it("reports a development server as running on its own copies", () => {
    const dev = manifest({
      dev: {
        hmr: true,
        origin: "http://localhost:4301",
        refreshPreamble: "/@platform/refresh-preamble",
      },
    })
    const rows = buildSharedReport({ manifest: dev, federationName: dev.entry.name })
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.outcome).toBe("bundled")
      expect(row.reason).toMatch(/development server: own copy/)
    }
    expect(rows.map((row) => row.name)).toEqual(
      dev.shared
        .filter((request) => request.shared)
        .map((request) => request.name)
        .sort()
    )
  })
})
