import { createMfe, createWidget, type MfeRouter } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { routeTree } from "./routeTree.gen"
import { AssetCard } from "./widgets/asset-card"

// Canonical bootstrap: one createMfe call, routes from the generated tree,
// widgets as ordinary components, static registrations for surfaces that are
// available before the MFE mounts.
export default createMfe({
  routeTree,
  widgets: {
    "asset-card": createWidget({
      title: "Asset card",
      description: "Summary card for one asset with a details dialog.",
      component: AssetCard,
      propsSchema: z.object({ assetId: z.string(), compact: z.boolean().optional() }),
    }),
  },
  registrations: {
    commands: [
      {
        id: "go-to-assets",
        label: "Go to assets",
        description: "Open the asset list",
        group: "Navigate",
        keywords: ["equipment", "list"],
        route: "/assets",
      },
    ],
    help: [
      {
        id: "getting-started",
        title: "Asset Tracker: getting started",
        description: "How to find and inspect assets",
        keywords: ["assets", "help"],
        route: "/",
      },
    ],
    releaseNotes: [
      {
        id: "v1-0-0",
        version: "1.0.0",
        title: "Asset Tracker 1.0",
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
