import { createMfe, createWidget } from "@platform/mfe-react"
import { z } from "zod"

import "./styles.css"
import { RigStatus } from "./widgets/rig-status"

export default createMfe({
  widgets: {
    "rig-status": createWidget({
      title: "Rig status (React 18)",
      description: "A rig's tripping tally, kept per widget instance",
      component: RigStatus,
      propsSchema: z.object({
        label: z.string().optional(),
        step: z.number().int().positive().optional(),
        phase: z.string().optional(),
      }),
    }),
  },
  registrations: {
    help: [{ id: "counters", title: "Rig status widgets", keywords: ["rig", "tripping"] }],
  },
})
