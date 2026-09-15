import { createPlatformStorage } from "@platform/mfe-react"
import { z } from "zod"

/**
 * Platform storage: namespaced (`platform:__MFE_ID__:local:dashboard`), schema-validated,
 * versioned with an optional migration, synchronised across tabs and bound to the
 * current mount. Never read `localStorage` directly.
 */
export const dashboardStorage = createPlatformStorage({
  scope: "local",
  key: "dashboard",
  schema: z.object({
    columns: z.array(z.string()),
    density: z.enum(["compact", "comfortable"]),
  }),
  defaults: { columns: ["name", "status"], density: "comfortable" },
  version: 2,
  // v1 stored a bare array of columns; invalid data without a migration resets to defaults.
  migrate: (stored) =>
    Array.isArray(stored)
      ? { columns: stored as string[], density: "comfortable" as const }
      : undefined,
})

export const sessionNotes = createPlatformStorage({
  scope: "session",
  key: "notes",
  schema: z.string(),
  defaults: "",
})
