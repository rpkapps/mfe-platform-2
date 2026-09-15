import { createMfe, createWidget } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { routeTree } from "./routeTree.gen"
import { WellSummary } from "./widgets/well-summary"

/**
 * The one bootstrap. `createMfe` returns the remote definition the shell mounts in an
 * isolated React root (routes) or per widget instance. `mfeId` is inferred from
 * package.json and persisted in .platform/identity.json; do not pass it here.
 */
export default createMfe({
  routeTree,
  widgets: {
    "well-summary": createWidget({
      title: "Well card",
      description: "Summary of one well with a details dialog.",
      component: WellSummary,
      propsSchema: z.object({
        wellId: z.string(),
        name: z.string().optional(),
        status: z.string().optional(),
        field: z.string().optional(),
        compact: z.boolean().optional(),
      }),
    }),
  },
  // Static registrations are available to the shell before the MFE mounts (App Finder,
  // help centre, release notes). Entries that depend on state use the useRegister* hooks.
  registrations: {
    help: [
      {
        id: "getting-started",
        title: "__DISPLAY_NAME__: getting started",
        description: "Find wells, open details and adjust display settings.",
        keywords: ["wells", "help"],
        route: "/",
      },
    ],
    releaseNotes: [
      {
        id: "v0-1-0",
        version: "0.1.0",
        title: "__DISPLAY_NAME__ 0.1.0",
        date: "__YEAR__-01-01",
        summary: "Initial release scaffolded with platform create.",
      },
    ],
  },
})
