import { createMfe, createWidget } from "@platform/react"
import { z } from "zod"

import "./styles.css"
import { KpiTile } from "./widgets/kpi-tile"
import { ModalWidget } from "./widgets/modal-widget"

export default createMfe({
  widgets: {
    "kpi-tile": createWidget({
      title: "KPI tile",
      description: "Metric readout",
      component: KpiTile,
      propsSchema: z.object({
        label: z.string(),
        value: z.number(),
        unit: z.string().optional(),
      }),
    }),
    "modal-widget": createWidget({
      title: "Modal widget",
      description: "Opens nested Tecton dialogs",
      component: ModalWidget,
      propsSchema: z.object({ label: z.string().optional() }),
    }),
  },
  registrations: {
    commands: [
      {
        id: "refresh-kpis",
        label: "Refresh KPIs",
        description: "Provided by a hidden widget library",
        group: "Widgets",
        keywords: ["kpi", "metrics"],
      },
    ],
    help: [
      {
        id: "kpi-tiles",
        title: "KPI tiles",
        description: "Reading KPI tiles",
        keywords: ["kpi"],
      },
    ],
    releaseNotes: [
      {
        id: "v0-9-0",
        version: "0.9.0",
        title: "Widget Library A 0.9",
        summary: "Hidden remote with widgets only.",
      },
    ],
  },
})
