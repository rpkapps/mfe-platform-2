import { createFileRoute, redirect } from "@tanstack/react-router"

import { Badge } from "@tecton/react/components/badge"
import { Separator } from "@tecton/react/components/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@tecton/react/components/tabs"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@tecton/react/tecton/panel"
import { Stat, StatGroup, StatLabel, StatValue } from "@tecton/react/tecton/stat"
import { TEST_IDS, WELL_STATUS_META, WELL_TYPE_META } from "@platform-internal/conformance"

import { listHorizons, loadWell } from "@/lib/data"

const ids = TEST_IDS.wellPlanner

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})

// Native TanStack guard: the platform context is ordinary route context.
export const Route = createFileRoute("/wells/$wellId")({
  staticData: { breadcrumb: { fromLoader: "breadcrumb" }, permissionGroups: ["wells:read"] },
  beforeLoad: ({ context, params }) => {
    if (!context.platform.permissions.hasGroup("wells:read")) {
      throw redirect({ to: "/", search: { denied: params.wellId } })
    }
    if (params.wellId === "restricted" && !context.platform.permissions.hasGroup("admin")) {
      throw new Error(
        "Only admins may open the restricted well (guard error stays inside the MFE)."
      )
    }
  },
  loader: async ({ params, context, abortController }) => {
    const span = context.platform.telemetry.span("well.load", { wellId: params.wellId })
    try {
      const well = await loadWell(params.wellId, abortController.signal)
      span.end()
      return { well, breadcrumb: well.name }
    } catch (error) {
      span.fail(error)
      throw error
    }
  },
  pendingComponent: () => <p className="text-muted-foreground text-sm">Loading well…</p>,
  errorComponent: ({ error }: { error: unknown }) => (
    <p role="alert" data-testid={ids.guardMessage} className="text-destructive text-sm">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ),
  component: WellDetail,
})

function WellDetail() {
  const { well } = Route.useLoaderData()
  const status = WELL_STATUS_META[well.status]
  const horizons = listHorizons()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>
            {well.field} · {WELL_TYPE_META[well.type]}
          </PageHeaderEyebrow>
          <PageHeaderTitle className="font-mono">
            <span data-testid={ids.wellTitle}>{well.name}</span>{" "}
            <Badge variant={status.tone} appearance="outline">
              {status.label}
            </Badge>
          </PageHeaderTitle>
          <PageHeaderDescription>
            Operated by {well.operator}, drilled from {well.rig}.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <StatGroup>
        <Stat>
          <StatLabel>Total depth</StatLabel>
          <StatValue unit="m MD">{well.td.toLocaleString("en-GB")}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>Spud</StatLabel>
          <StatValue>{dateFormat.format(new Date(well.spud))}</StatValue>
        </Stat>
        <Stat>
          <StatLabel>Rig</StatLabel>
          <StatValue>{well.rig}</StatValue>
        </Stat>
      </StatGroup>

      <Separator />

      <Tabs defaultSelectedKey="horizons">
        <TabsList variant="line" aria-label="Well sections">
          <TabsTrigger id="horizons">Horizons</TabsTrigger>
          <TabsTrigger id="programme">Programme</TabsTrigger>
        </TabsList>
        <TabsContent id="horizons">
          <Panel>
            <PanelHeader>
              <PanelTitle>Prognosed horizons</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <ul className="flex flex-col gap-2 text-sm">
                {horizons.map((horizon) => (
                  <li key={horizon.id} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-sm"
                      style={{ background: horizon.colour }}
                    />
                    <span className="font-mono font-medium">{horizon.name}</span>
                    <span className="text-muted-foreground">{horizon.formation}</span>
                    <span className="text-muted-foreground ml-auto font-mono tabular-nums">
                      {horizon.tvdss.toLocaleString("en-GB")} m TVDSS
                    </span>
                  </li>
                ))}
              </ul>
            </PanelContent>
          </Panel>
        </TabsContent>
        <TabsContent id="programme">
          <Panel>
            <PanelHeader>
              <PanelTitle>Drilling programme</PanelTitle>
            </PanelHeader>
            <PanelContent>
              <p className="text-muted-foreground text-sm">
                The programme for {well.name} is planned on {well.rig} and reviewed at the next
                gate.
              </p>
            </PanelContent>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
