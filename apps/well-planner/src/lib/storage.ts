import { createPlatformStorage } from "@platform/mfe-react"
import { z } from "zod"

/** KPI columns the dashboard can show, in the order they are offered. */
export const KPI_CATALOGUE = ["npv", "irr", "capex", "firstOil", "wells", "updated"] as const

export const dashboardStorage = createPlatformStorage({
  scope: "local",
  key: "dashboard",
  schema: z.object({
    columns: z.array(z.string()),
    density: z.enum(["compact", "comfortable"]),
  }),
  defaults: { columns: ["npv", "irr"], density: "comfortable" },
  version: 2,
  // v1 stored a bare array of columns.
  migrate: (stored) =>
    Array.isArray(stored)
      ? { columns: stored as string[], density: "comfortable" as const }
      : undefined,
})

/** The next KPI not already shown, or a generated name once the catalogue runs out. */
export function nextKpi(current: readonly string[]): string {
  return KPI_CATALOGUE.find((kpi) => !current.includes(kpi)) ?? `kpi${current.length + 1}`
}

export const sessionNotes = createPlatformStorage({
  scope: "session",
  key: "notes",
  schema: z.string(),
  defaults: "",
})
