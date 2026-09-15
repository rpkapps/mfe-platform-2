import { createMfe, createWidget } from "@platform/react"
import { z } from "zod"

import "./styles.css"
import { CounterWidget } from "./widgets/counter-widget"

export default createMfe({
  widgets: {
    "counter-widget": createWidget({ title: "Counter (React 18)", component: CounterWidget, propsSchema: z.object({ label: z.string().optional(), step: z.number().int().positive().optional() }) }),
  },
  registrations: {
    help: [{ id: "counters", title: "Counter widgets", keywords: ["counter"] }],
  },
})
