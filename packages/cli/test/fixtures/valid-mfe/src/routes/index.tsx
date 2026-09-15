import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  createPlatformStorage,
  useCapability,
  usePlatform,
  useRegisterCommand,
  useRegisterSettingsGroup,
  useTelemetry,
} from "@platform/mfe-react"

export const Route = createFileRoute("/")({
  staticData: { navigation: { title: "Dashboard" } },
  component: Dashboard,
})

export const storage = createPlatformStorage({
  scope: "local",
  key: "dashboard",
  defaults: { columns: ["name"] },
})

function Dashboard() {
  const name = usePlatform((p) => p.user?.displayName ?? "there")
  const telemetry = useTelemetry()
  const canStore = useCapability("storage.local")
  const [count, setCount] = React.useState(0)
  useRegisterCommand({
    id: "say-hello",
    label: "Say hello",
    shortcut: "mod+shift+h",
    keywords: ["hi"],
    handler: () => setCount((value) => value + 1),
  })
  useRegisterSettingsGroup({
    key: "display",
    title: "Display",
    fields: {
      density: {
        defaultValue: "comfortable",
        options: [{ value: "comfortable", label: "Comfortable" }],
      },
      showOffline: { defaultValue: true },
      region: {
        defaultValue: "eu",
        options: async ({ signal }) => (await fetch("/api/regions", { signal })).json(),
      },
    },
  })
  const onTrack = () => {
    try {
      telemetry.track("dashboard.clicked", { count })
    } catch (error) {
      telemetry.error(error, { boundary: "dashboard.track" })
    }
  }
  return (
    <div>
      <h1>Hello {name}</h1>
      <button type="button" onClick={onTrack}>
        Track {canStore ? "(storage)" : ""}
      </button>
    </div>
  )
}
