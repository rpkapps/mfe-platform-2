import { createMfe, createWidget } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { FdaStatus } from "./widgets/fda-status"
import { ProductionKpi } from "./widgets/production-kpi"

export default createMfe({
  widgets: {
    "production-kpi": createWidget({
      title: "Production KPI",
      description: "Production readout with its period-on-period change",
      component: ProductionKpi,
      propsSchema: z.object({
        label: z.string(),
        value: z.number(),
        unit: z.string().optional(),
        delta: z.number().optional(),
        help: z.string().optional(),
      }),
    }),
    "fda-status": createWidget({
      title: "FDA status",
      description: "One development alternative, with nested review dialogs",
      component: FdaStatus,
      propsSchema: z.object({
        code: z.string().optional(),
        title: z.string().optional(),
        status: z.string().optional(),
        wells: z.number().optional(),
      }),
    }),
  },
  registrations: {
    commands: [
      {
        id: "refresh-kpis",
        label: "Refresh production KPIs",
        description: "Provided by a hidden widget library",
        group: "Widgets",
        keywords: ["kpi", "production", "metrics"],
      },
    ],
    help: [
      {
        id: "kpi-tiles",
        title: "Production KPIs",
        description: "Reading the production readouts",
        keywords: ["kpi", "production"],
      },
    ],
    releaseNotes: [
      {
        id: "v0-9-0",
        version: "0.9.0",
        title: "Subsurface Widgets 0.9",
        summary: "Hidden remote with widgets only.",
      },
    ],
  },
})
