import { createMfe, createWidget, type MfeRouter } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { routeTree } from "./routeTree.gen"
import { ReportSummary } from "./widgets/report-summary"
import { StackedModal } from "./widgets/stacked-modal"

export default createMfe({
  routeTree,
  widgets: {
    "report-summary": createWidget({
      title: "Report summary",
      component: ReportSummary,
      propsSchema: z.object({ reportId: z.string() }),
    }),
    "stacked-modal": createWidget({
      title: "Stacked modal (React 18)",
      component: StackedModal,
      propsSchema: z.object({ label: z.string().optional() }),
    }),
  },
  registrations: {
    commands: [
      {
        id: "go-to-reports",
        label: "Go to reports",
        group: "Navigate",
        keywords: ["legacy"],
        route: "/",
      },
    ],
    help: [
      {
        id: "exports",
        title: "Exporting reports",
        description: "CSV and XLSX exports",
        keywords: ["export", "csv"],
      },
    ],
    releaseNotes: [
      {
        id: "v3-2-0",
        version: "3.2.0",
        title: "Legacy Reports 3.2",
        date: "2026-08-15",
        summary: "Migrated to the platform without changing URLs.",
      },
    ],
  },
})

// Registers the MFE router so route hooks, links and search params are typed.
declare module "@tanstack/react-router" {
  interface Register {
    router: MfeRouter<typeof routeTree>
  }
}
