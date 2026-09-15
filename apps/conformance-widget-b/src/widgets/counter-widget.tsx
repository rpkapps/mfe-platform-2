import * as React from "react"
import { createPlatformStorage, useMfeInstance } from "@platform/react"
import { TEST_IDS } from "@platform-internal/conformance"
import { z } from "zod"

const ids = TEST_IDS.widgets

// Instance-scoped storage: every mounted counter keeps its own value.
const counterStorage = createPlatformStorage({ scope: "session", key: "counter", schema: z.number(), defaults: 0, instanceScoped: true })

export function CounterWidget({ label = "Counter", step = 1 }: { label?: string; step?: number }) {
  const value = counterStorage.use()
  // Bound to this widget instance: several counters can be mounted at once.
  const store = counterStorage.useStore()
  const instance = useMfeInstance()
  return (
    <div data-testid={ids.counterWidget} data-instance={instance.instanceId} className="widget-b-card text-sm">
      <p>
        {label} · React {React.version}
      </p>
      <button type="button" data-testid={ids.counterWidgetIncrement} className="rounded border px-2" onClick={() => store.set((current) => current + step)}>
        +{step}
      </button>{" "}
      <span data-testid={ids.counterWidgetValue}>{value}</span>
    </div>
  )
}
