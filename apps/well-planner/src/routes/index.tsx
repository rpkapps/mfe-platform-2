import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { RefreshCwIcon, ShareIcon, PlusIcon } from "lucide-react"
import {
  CommandRegistration,
  useNotifications,
  usePlatform,
  usePlatformFetch,
  useRegisterCommand,
  useRuntimeEnv,
  useTelemetry,
} from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

import { Badge } from "@tecton/react/components/badge"
import { Button } from "@tecton/react/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tecton/react/components/dialog"
import { Separator } from "@tecton/react/components/separator"
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from "@tecton/react/tecton/page-header"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@tecton/react/tecton/panel"

import { FdaCard } from "@/components/fda-card"
import { listFdas } from "@/lib/data"
import { dashboardStorage, nextKpi } from "@/lib/storage"
import { useRenderCount } from "@/lib/render-count"

const ids = TEST_IDS.wellPlanner

export const Route = createFileRoute("/")({
  staticData: {
    navigation: { title: "Concept select", description: "Compare alternatives", order: 0 },
  },
  component: Dashboard,
})

/** Subscribed to one slice: rerenders only when the display name changes. */
function UserName() {
  const displayName = usePlatform((p) => p.user?.displayName ?? "anonymous")
  const renders = useRenderCount()
  return (
    <span className="text-muted-foreground text-xs">
      Prepared for <span data-testid={ids.userName}>{displayName}</span> ·{" "}
      <span data-testid={ids.renderCount}>{renders}</span> renders
    </span>
  )
}

function ThemeValue() {
  const theme = usePlatform((p) => p.resolvedTheme)
  return <span data-testid={ids.themeValue}>{theme}</span>
}

function Dashboard() {
  const [compared, setCompared] = React.useState(0)
  const telemetry = useTelemetry()
  const { notify } = useNotifications()
  const env = useRuntimeEnv()
  const columns = dashboardStorage.use((state) => state.columns)
  const hasBulkEdit = usePlatform((p) => Boolean(p.featureFlags["wells.bulk-edit"]))
  const fdas = listFdas()

  useRegisterCommand({
    id: "increment-counter",
    label: "Add alternative to comparison",
    description: "Adds one alternative to the comparison set",
    group: "Well Planner",
    keywords: ["compare", "fda"],
    shortcut: "mod+shift+i",
    handler: () => setCompared((value) => value + 1),
  })

  useRegisterCommand({
    id: "slow-sync",
    label: "Run slow sync",
    description: "Asynchronous command that can be cancelled",
    group: "Well Planner",
    handler: async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 800)
        signal.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(new Error("cancelled"))
        })
      })
      notify({ title: "Sync finished", kind: "success" })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>North Sea · PL 265</PageHeaderEyebrow>
          <PageHeaderTitle>
            Johan Sverdrup Phase 3 <Badge appearance="outline">Concept select</Badge>
          </PageHeaderTitle>
          <PageHeaderDescription>
            Concept select — comparing tie-back, satellite and platform alternatives against the
            reference case.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="ghost" size="sm">
            <ShareIcon aria-hidden /> Share
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid={ids.telemetryButton}
            onPress={() => {
              const span = telemetry.span("dashboard.refresh", { source: "button" })
              telemetry.track("dashboard.clicked", { compared })
              span.end()
            }}
          >
            <RefreshCwIcon aria-hidden /> Refresh economics
          </Button>
          <Button size="sm" data-testid={ids.counter} onPress={() => setCompared((v) => v + 1)}>
            <PlusIcon aria-hidden /> Comparing {compared}
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UserName />
        <Separator orientation="vertical" className="h-3" />
        <span className="text-muted-foreground text-xs">
          Theme <ThemeValue /> · API{" "}
          <span data-testid={ids.envValue}>{String(env.API_BASE_URL)}</span> · page size{" "}
          {String(env.PAGE_SIZE)} · bulk edit {hasBulkEdit ? "on" : "off"}
        </span>
      </div>

      <AuthenticatedCall />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {fdas.map((fda) => (
          <FdaCard
            key={fda.id}
            fda={fda}
            columns={columns}
            onCompare={() => setCompared((value) => value + 1)}
          >
            <DialogTrigger>
              <Button size="sm" variant="secondary" data-testid={ids.openDialog}>
                Open
              </Button>
              <Dialog data-testid={ids.dialog}>
                <DialogHeader>
                  <DialogTitle>{fda.title}</DialogTitle>
                  <DialogDescription>
                    An ordinary Tecton dialog rendered by the MFE; it lands in the shell overlay
                    root tagged for this MFE.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter showCloseButton />
              </Dialog>
            </DialogTrigger>
          </FdaCard>
        ))}
      </div>

      <Panel>
        <PanelHeader>
          <PanelTitle>Visible economics</PanelTitle>
        </PanelHeader>
        <PanelContent className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">
            Which KPIs the cards show. Schema-backed local storage, namespaced by the platform.
          </span>
          <span data-testid={ids.storageColumns} className="font-mono text-xs">
            {columns.join(",")}
          </span>
          <Button
            size="sm"
            variant="outline"
            data-testid={ids.storageAdd}
            onPress={() =>
              dashboardStorage.setKey("columns", (current) => [...current, nextKpi(current)])
            }
          >
            Add KPI
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid={ids.storageReset}
            onPress={() => dashboardStorage.reset()}
          >
            Reset
          </Button>
        </PanelContent>
      </Panel>

      <CommandRegistration
        definition={{
          id: "open-dashboard-help",
          label: "Open dashboard help",
          group: "Help",
          handler: () =>
            notify({
              title: "Concept select help",
              description: "Compare alternatives, then open a well from the inventory.",
              kind: "info",
            }),
        }}
      />
      <p data-testid={ids.hmrLabel} className="text-muted-foreground text-xs">
        HMR_LABEL_V1
      </p>
    </div>
  )
}

/**
 * Conformance for the credential port: one call the shell allows (its own
 * origin) and one it must refuse before anything leaves the browser. The
 * response body does not matter — only that the token was attached, and that
 * a cross-origin URL never receives one.
 */
function AuthenticatedCall() {
  const platformFetch = usePlatformFetch()
  const [result, setResult] = React.useState("idle")
  const run = (url: string) => {
    setResult("pending")
    platformFetch(url, { audience: "wells" }).then(
      (response) => setResult(`ok ${response.status}`),
      (error: unknown) =>
        setResult(
          `refused ${(error as { code?: string }).code ?? (error as Error).message ?? "unknown"}`
        )
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        data-testid={ids.authFetch}
        onPress={() => run("/platform-config.json")}
      >
        Authenticated call
      </Button>
      <Button
        variant="outline"
        size="sm"
        data-testid={ids.authFetchCrossOrigin}
        onPress={() => run("https://tokens.example/collect")}
      >
        Cross-origin call
      </Button>
      <span data-testid={ids.authResult} className="text-muted-foreground text-sm">
        {result}
      </span>
    </div>
  )
}
