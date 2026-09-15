import { createFileRoute } from "@tanstack/react-router"
import { useRegisterCommand, useRegisterSettingsGroup, useTelemetry } from "@platform/react"
import { helper } from "@acme/mfe-other"

export const Route = createFileRoute("/invalid-mfe/")({
  component: Dashboard,
})

useRegisterCommand({ id: "invalid-mfe:open", label: "", shortcut: "ctrl+ctrl+k" })

function Dashboard() {
  const telemetry = useTelemetry()
  const config = window.__PLATFORM_CONFIG__
  const name = localStorage.getItem("name")
  useRegisterSettingsGroup({
    key: "Display",
    managedBy: "mfe",
    fields: {
      density: {
        value: "compact",
        schema: { type: "string" },
        options: [{ value: "compact" }],
      },
    },
  })
  try {
    telemetry.track(`dashboard.${name}`)
  } catch (error) {
    telemetry.error(error)
  }
  return (
    <p>
      {String(config)} {helper()}
    </p>
  )
}
