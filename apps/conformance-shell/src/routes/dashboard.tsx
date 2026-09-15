import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { PlusIcon, RefreshCwIcon } from "lucide-react"
import { WidgetSlot } from "@platform/host-react"
import { MFE_IDS, PRODUCTION, REPORTS, WELLS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"

import { useShellHost } from "@/lib/platform"

export const Route = createFileRoute("/dashboard")({
  staticData: { breadcrumb: "Dashboard" },
  component: Dashboard,
})

const RIGS = ["West Elara", "Deepsea Atlantic", "Snorre A", "Askepott"]

function Dashboard() {
  const host = useShellHost()
  const [rigs, setRigs] = React.useState(2)
  const [oil, setOil] = React.useState(PRODUCTION[PRODUCTION.length - 1]?.oil ?? 41870)
  if (!host) return <p className="text-muted-foreground text-sm">Starting platform…</p>

  const well = WELLS[0]
  const report = REPORTS[0]
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Nordsee Energy · PL 265</PageHeaderEyebrow>
          <PageHeaderTitle>Operations dashboard</PageHeaderTitle>
          <PageHeaderDescription>
            Every widget below runs in its own React root: React 19 (well-planner,
            subsurface-widgets) and React 18 (production-reports, field-widgets) coexist on one
            page.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button size="sm" variant="ghost" onPress={() => setRigs((n) => n + 1)}>
            <PlusIcon aria-hidden /> Add rig
          </Button>
          <Button size="sm" variant="outline" onPress={() => setOil((n) => n + 130)}>
            <RefreshCwIcon aria-hidden /> Refresh rates
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {well ? (
          <WidgetSlot
            mfeId={MFE_IDS.wellPlanner}
            widgetId="well-summary"
            slot="dashboard-well-summary"
            props={{
              wellId: well.id,
              name: well.name,
              field: well.field,
              status: well.status,
              type: well.type,
              td: well.td,
            }}
          />
        ) : null}
        <WidgetSlot
          mfeId={MFE_IDS.subsurfaceWidgets}
          widgetId="production-kpi"
          slot="kpi-oil"
          props={{
            label: "Oil rate",
            value: oil,
            unit: "bbl/d",
            delta: 1.3,
            help: "vs. previous month",
          }}
        />
        <WidgetSlot
          mfeId={MFE_IDS.subsurfaceWidgets}
          widgetId="production-kpi"
          slot="kpi-uptime"
          props={{ label: "Uptime", value: 99, unit: "%", delta: -0.4 }}
        />
        <WidgetSlot
          mfeId={MFE_IDS.subsurfaceWidgets}
          widgetId="fda-status"
          slot="fda-status"
          props={{
            code: "FDA 2.3",
            title: "Phased tie-back",
            status: "Nominated",
            wells: 6,
          }}
        />
        {report ? (
          <WidgetSlot
            mfeId={MFE_IDS.productionReports}
            widgetId="report-summary"
            slot="report-summary"
            props={{
              reportId: report.id,
              title: report.title,
              owner: report.owner,
              period: report.period,
              headline: `${(report.rows[0]?.value ?? 0).toLocaleString("en-GB")} ${report.rows[0]?.unit ?? ""}`,
            }}
          />
        ) : null}
        <WidgetSlot
          mfeId={MFE_IDS.productionReports}
          widgetId="stacked-modal"
          slot="export-modal"
          props={{ label: "Schedule export" }}
        />
        {Array.from({ length: rigs }, (_, index) => (
          <WidgetSlot
            key={index}
            mfeId={MFE_IDS.fieldWidgets}
            widgetId="rig-status"
            slot={`rig-${index}`}
            props={{
              label: RIGS[index % RIGS.length] ?? `Rig ${index + 1}`,
              step: index + 1,
              phase: index % 2 === 0 ? "Tripping in" : "Drilling ahead",
            }}
          />
        ))}
        {/* A widget the library does not export: the shell renders the failure in place. */}
        <WidgetSlot
          mfeId={MFE_IDS.subsurfaceWidgets}
          widgetId="does-not-exist"
          slot="unknown-widget"
          props={{}}
        />
      </div>
    </div>
  )
}
