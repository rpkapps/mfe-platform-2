import {
  FDAS,
  HORIZONS,
  PRODUCTION,
  WELLS,
  type Fda,
  type Well,
  type WellStatus,
  type WellType,
} from "@platform-internal/conformance"

export type { Fda, Well, WellStatus, WellType }

export interface WellFilter {
  query: string
  field: string
  type: WellType | "all"
  statuses: WellStatus[]
}

export const emptyFilter: WellFilter = { query: "", field: "all", type: "all", statuses: [] }

export function isFiltered(filter: WellFilter): boolean {
  return (
    filter.query.trim() !== "" ||
    filter.field !== "all" ||
    filter.type !== "all" ||
    filter.statuses.length > 0
  )
}

export function listWells(): Well[] {
  return WELLS
}

/** Client-side filtering — the platform surface under test is routing, not search. */
export function filterWells(wells: Well[], filter: WellFilter): Well[] {
  const query = filter.query.trim().toLowerCase()
  return wells.filter((well) => {
    if (filter.field !== "all" && well.field !== filter.field) return false
    if (filter.type !== "all" && well.type !== filter.type) return false
    if (filter.statuses.length > 0 && !filter.statuses.includes(well.status)) return false
    if (!query) return true
    return [well.name, well.rig, well.operator, well.field].some((value) =>
      value.toLowerCase().includes(query)
    )
  })
}

export async function loadWell(wellId: string, signal?: AbortSignal): Promise<Well> {
  await new Promise((resolve) => setTimeout(resolve, 30))
  if (signal?.aborted) throw new Error("aborted")
  const well = WELLS.find((candidate) => candidate.id === wellId || candidate.name === wellId)
  if (!well) throw new Error(`Unknown well ${wellId}`)
  return well
}

export function listFdas(): Fda[] {
  return FDAS
}

export function listHorizons() {
  return HORIZONS
}

export function latestProduction() {
  return PRODUCTION[PRODUCTION.length - 1]
}

export function productionDelta(): number {
  const series = PRODUCTION
  const last = series[series.length - 1]
  const previous = series[series.length - 2]
  if (!last || !previous) return 0
  return Math.round(((last.oil - previous.oil) / previous.oil) * 1000) / 10
}
