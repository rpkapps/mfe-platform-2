import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useNotifications, usePlatform, useRegisterCommand, useTelemetry } from "@platform/react"
// {{#tecton}}
import { Button } from "@tecton/react/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tecton/react/components/card"
// {{/tecton}}

import { dashboardStorage } from "@/lib/storage"

export const Route = createFileRoute("/")({
  staticData: { navigation: { title: "Dashboard", description: "__DISPLAY_NAME__ overview", order: 0 } },
  component: Dashboard,
})

/** Slice subscription: this component rerenders only when the display name changes. */
function Greeting() {
  const displayName = usePlatform((p) => p.user?.displayName ?? "there")
  return <h2 className="text-lg font-medium">Hello {displayName}</h2>
}

function Dashboard() {
  const [greetings, setGreetings] = React.useState(0)
  const telemetry = useTelemetry()
  const { notify } = useNotifications()
  const columns = dashboardStorage.use((state) => state.columns)
  const bulkEdit = usePlatform((p) => Boolean(p.featureFlags["assets.bulk-edit"]))

  // Command palette entry with a shortcut. The id is local; the platform namespaces it as
  // `__MFE_ID__:say-hello`. Registration is removed when this component unmounts.
  useRegisterCommand({
    id: "say-hello",
    label: "Say hello",
    description: "Shows a notification from __DISPLAY_NAME__",
    group: "__DISPLAY_NAME__",
    keywords: ["greeting", "demo"],
    shortcut: "mod+shift+h",
    handler: () => {
      setGreetings((count) => count + 1)
      notify({ title: "Hello from __DISPLAY_NAME__", kind: "info" })
      telemetry.track("dashboard.hello", { source: "command" })
    },
  })

  const addColumn = () => {
    dashboardStorage.setKey("columns", (current) => [...current, `column-${current.length + 1}`])
    telemetry.track("dashboard.column.added", { count: columns.length + 1 })
  }

  return (
    <div className="flex flex-col gap-4">
      <Greeting />
      <p className="text-sm text-muted-foreground">
        Greeted {greetings} time{greetings === 1 ? "" : "s"} · bulk edit {bulkEdit ? "on" : "off"}
      </p>
      {/* {{#tecton}} */}
      <Card>
        <CardHeader>
          <CardTitle>Dashboard columns</CardTitle>
          <CardDescription>Schema-backed local storage, namespaced by the platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{columns.join(", ")}</span>
          <Button size="sm" variant="outline" onPress={addColumn}>
            Add column
          </Button>
          <Button size="sm" variant="ghost" onPress={() => dashboardStorage.reset()}>
            Reset
          </Button>
        </CardContent>
      </Card>
      {/* {{/tecton}} */}
      {/* {{^tecton}} */}
      <section className="rounded-md border border-border p-4">
        <h3 className="font-medium">Dashboard columns</h3>
        <p className="text-sm text-muted-foreground">Schema-backed local storage, namespaced by the platform.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs">{columns.join(", ")}</span>
          <button type="button" className="rounded border border-border px-2 py-1 text-sm" onClick={addColumn}>
            Add column
          </button>
          <button type="button" className="rounded px-2 py-1 text-sm" onClick={() => dashboardStorage.reset()}>
            Reset
          </button>
        </div>
      </section>
      {/* {{/tecton}} */}
    </div>
  )
}
