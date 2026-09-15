import { createPlatformStorage } from "@platform/react"
import { z } from "zod"

export const dashboardStorage = createPlatformStorage({
  scope: "local",
  key: "dashboard",
  schema: z.object({
    columns: z.array(z.string()),
    density: z.enum(["compact", "comfortable"]),
  }),
  defaults: { columns: ["name", "status"], density: "comfortable" },
  version: 2,
  // v1 stored a bare array of columns.
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
