import { createPlatformStorage } from "@platform/react"
import { z } from "zod"

export const reportPrefs = createPlatformStorage({
  scope: "local",
  key: "prefs",
  schema: z.object({ format: z.enum(["csv", "xlsx"]), lastReport: z.string().nullable() }),
  defaults: { format: "csv", lastReport: null },
  version: 3,
  migrate: (stored, version) => {
    if (version === 2 && stored && typeof stored === "object" && "fmt" in stored) {
      return { format: (stored as { fmt: "csv" | "xlsx" }).fmt, lastReport: null }
    }
    return undefined
  },
})
