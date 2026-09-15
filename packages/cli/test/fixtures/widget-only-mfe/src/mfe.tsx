import { createMfe, createWidget } from "@platform/mfe-react"

import { KpiTile } from "./widgets/kpi-tile"

// A widget library: no routes, so no router — `platform validate` must not ask
// for @tanstack/react-router here.
export default createMfe({
  widgets: { "kpi-tile": createWidget({ component: KpiTile }) },
})
