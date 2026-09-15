import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { WidgetSlot } from "@platform/host/react"
import { MFE_IDS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/dashboard")({
  staticData: { breadcrumb: "Dashboard" },
  component: Dashboard,
})

function Dashboard() {
  const host = useShellHost()
  const [counters, setCounters] = React.useState(2)
  const [kpi, setKpi] = React.useState(42)
  if (!host) return <p className="text-sm text-muted-foreground">Starting platform…</p>
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Widgets dashboard</h1>
      <p className="text-sm text-muted-foreground">Every widget below runs in its own React root: React 19 (asset-tracker, widget-a) and React 18 (legacy-reports, widget-b) coexist.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onPress={() => setCounters((n) => n + 1)}>
          Add React 18 counter
        </Button>
        <Button size="sm" variant="outline" onPress={() => setKpi((n) => n + 1)}>
          Bump KPI prop
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WidgetSlot mfeId={MFE_IDS.assetTracker} widgetId="asset-card" slot="dashboard-asset-card" props={{ assetId: "pump-42" }} />
        <WidgetSlot mfeId={MFE_IDS.widgetA} widgetId="kpi-tile" slot="kpi-1" props={{ label: "Production", value: kpi, unit: "bbl/d" }} />
        <WidgetSlot mfeId={MFE_IDS.widgetA} widgetId="kpi-tile" slot="kpi-2" props={{ label: "Uptime", value: 99, unit: "%" }} />
        <WidgetSlot mfeId={MFE_IDS.widgetA} widgetId="modal-widget" slot="modal-a" props={{ label: "Open React 19 dialog" }} />
        <WidgetSlot mfeId={MFE_IDS.legacyReports} widgetId="report-summary" slot="report-summary" props={{ reportId: "daily-production" }} />
        <WidgetSlot mfeId={MFE_IDS.legacyReports} widgetId="stacked-modal" slot="modal-18" props={{ label: "Open React 18 modal" }} />
        {Array.from({ length: counters }, (_, index) => (
          <WidgetSlot key={index} mfeId={MFE_IDS.widgetB} widgetId="counter-widget" slot={`counter-${index}`} props={{ label: `Counter ${index + 1}`, step: index + 1 }} />
        ))}
        <WidgetSlot mfeId={MFE_IDS.widgetA} widgetId="does-not-exist" slot="unknown-widget" props={{}} />
      </div>
    </div>
  )
}
