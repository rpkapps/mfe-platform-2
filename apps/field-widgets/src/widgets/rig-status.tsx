import * as React from "react"
import { createPlatformStorage, useMfeInstance } from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"
import { z } from "zod"

const ids = TEST_IDS.widgets

// Instance-scoped storage: every mounted rig keeps its own tally.
const standsStorage = createPlatformStorage({
  scope: "session",
  key: "stands",
  schema: z.number(),
  defaults: 0,
  instanceScoped: true,
})

export interface RigStatusProps {
  /** Rig name, e.g. "West Elara". */
  label?: string
  /** Stands added per trip. */
  step?: number
  phase?: string
}

/**
 * A rig's tripping tally, with no design system at all: this remote proves a
 * React 18 widget library can bring its own styling and still stack, persist
 * and register like any other.
 */
export function RigStatus({ label = "Rig", step = 1, phase = "Tripping in" }: RigStatusProps) {
  const stands = standsStorage.use()
  // Bound to this widget instance: several rigs can be mounted at once.
  const store = standsStorage.useStore()
  const instance = useMfeInstance()
  return (
    <div
      data-testid={ids.rigStatus}
      data-instance={instance.instanceId}
      className="field-widgets-card flex flex-col gap-2 text-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium">{label}</p>
        <span className="field-widgets-phase">{phase}</span>
      </div>
      <p className="field-widgets-figure">
        <span data-testid={ids.rigStatusValue}>{stands}</span>{" "}
        <span className="field-widgets-unit">stands</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid={ids.rigStatusAdvance}
          className="field-widgets-button"
          onClick={() => store.set((current) => current + step)}
        >
          Trip +{step}
        </button>
        <span className="field-widgets-meta">React {React.version}</span>
      </div>
    </div>
  )
}
