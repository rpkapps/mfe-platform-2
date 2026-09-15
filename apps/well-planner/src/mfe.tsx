import { createMfe, createWidget, type MfeRouter } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { routeTree } from "./routeTree.gen"
import { WellSummary } from "./widgets/well-summary"

// Canonical bootstrap: one createMfe call, routes from the generated tree,
// widgets as ordinary components, static registrations for surfaces that are
// available before the MFE mounts.
export default createMfe({
  routeTree,
  widgets: {
    "well-summary": createWidget({
      title: "Well summary",
      description: "Summary card for one well with a details dialog.",
      component: WellSummary,
      propsSchema: z.object({
        wellId: z.string(),
        name: z.string(),
        field: z.string(),
        status: z.enum(["producing", "drilling", "planned", "suspended", "abandoned"]),
        type: z.enum(["producer", "injector", "exploration", "observation"]),
        td: z.number(),
        compact: z.boolean().optional(),
      }),
    }),
  },
  registrations: {
    commands: [
      {
        id: "go-to-wells",
        label: "Go to wells",
        description: "Open the well inventory",
        group: "Navigate",
        keywords: ["wells", "inventory", "drilling"],
        route: "/wells",
      },
    ],
    help: [
      {
        id: "getting-started",
        title: "Well Planner: getting started",
        description: "How to find wells and compare development alternatives",
        keywords: ["wells", "fda", "help"],
        route: "/",
      },
    ],
    releaseNotes: [
      {
        id: "v1-0-0",
        version: "1.0.0",
        title: "Well Planner 1.0",
        date: "2026-09-01",
        summary: "First conformance release.",
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
