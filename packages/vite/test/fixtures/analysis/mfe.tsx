import { createMfe, createWidget } from "@platform/react"
import { routeTree } from "./routeTree.gen"

const statusWidget = createWidget({
  id: "status",
  title: "Status",
  description: "Live status",
  component: () => null,
})

export default createMfe({
  routeTree,
  widgets: {
    "asset-count": createWidget({ title: "Asset count", component: () => null }),
    status: statusWidget,
  },
  registrations: {
    commands: [{ id: "open-assets", label: "Open assets", route: "/assets" }],
    help: [{ id: "overview", title: "Overview" }],
    releaseNotes: [{ id: "v1-0", version: "1.0.0", title: "Initial release" }],
  },
})
