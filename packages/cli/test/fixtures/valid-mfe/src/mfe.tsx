import { createMfe, createWidget } from "@platform/react"

import { routeTree } from "./routeTree.gen"

function Card({ id }: { id: string }) {
  return <p>{id}</p>
}

export default createMfe({
  routeTree,
  widgets: { "asset-card": createWidget({ component: Card }) },
  registrations: { help: [{ id: "getting-started", title: "Start", route: "/" }] },
})
