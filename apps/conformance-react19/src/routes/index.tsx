import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import {
  CommandRegistration,
  useNotifications,
  usePlatform,
  useRegisterCommand,
  usePlatformFetch,
  useRuntimeEnv,
  useTelemetry,
} from "@platform/mfe-react"
import { TEST_IDS } from "@platform-internal/conformance"

import { Button } from "@tecton/react/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tecton/react/components/card"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@tecton/react/components/dialog"

import { dashboardStorage } from "@/lib/storage"
import { useRenderCount } from "@/lib/render-count"

const ids = TEST_IDS.assetTracker

export const Route = createFileRoute("/")({
  staticData: { navigation: { title: "Dashboard", description: "Asset overview", order: 0 } },
  component: Dashboard,
})

/** Subscribed to one slice: rerenders only when the display name changes. */
function UserName() {
  const displayName = usePlatform((p) => p.user?.displayName ?? "anonymous")
  const renders = useRenderCount()
  return (
    <p className="text-sm">
      Hello <span data-testid={ids.userName}>{displayName}</span> (
      <span data-testid={ids.renderCount}>{renders}</span> renders)
    </p>
  )
}

function ThemeValue() {
  const theme = usePlatform((p) => p.resolvedTheme)
  return <span data-testid={ids.themeValue}>{theme}</span>
}

function Dashboard() {
  const [count, setCount] = React.useState(0)
  const telemetry = useTelemetry()
  const { notify } = useNotifications()
  const env = useRuntimeEnv()
  const columns = dashboardStorage.use((state) => state.columns)
  const hasBulkEdit = usePlatform((p) => Boolean(p.featureFlags["assets.bulk-edit"]))

  useRegisterCommand({
    id: "increment-counter",
    label: "Increment asset counter",
    description: "Adds one to the dashboard counter",
    group: "Asset Tracker",
    keywords: ["counter", "demo"],
    shortcut: "mod+shift+i",
    handler: () => setCount((value) => value + 1),
  })

  useRegisterCommand({
    id: "slow-sync",
    label: "Run slow sync",
    description: "Asynchronous command that can be cancelled",
    group: "Asset Tracker",
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
    <div className="flex flex-col gap-4">
      <UserName />
      <AuthenticatedCall />
      <p className="text-muted-foreground text-sm">
        Theme: <ThemeValue /> · API:{" "}
        <span data-testid={ids.envValue}>{String(env.API_BASE_URL)}</span> · page size{" "}
        {String(env.PAGE_SIZE)} · bulk edit {hasBulkEdit ? "on" : "off"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button data-testid={ids.counter} onPress={() => setCount((value) => value + 1)}>
          Counter {count}
        </Button>
        <Button
          variant="outline"
          data-testid={ids.telemetryButton}
          onPress={() => {
            const span = telemetry.span("dashboard.refresh", { source: "button" })
            telemetry.track("dashboard.clicked", { count })
            span.end()
          }}
        >
          Track event
        </Button>
        <DialogTrigger>
          <Button variant="secondary" data-testid={ids.openDialog}>
            Open dialog
          </Button>
          <Dialog data-testid={ids.dialog}>
            <DialogHeader>
              <DialogTitle>Asset dialog</DialogTitle>
              <DialogDescription>
                An ordinary Tecton dialog rendered by the MFE; it lands in the shell overlay
                root tagged for this MFE.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </Dialog>
        </DialogTrigger>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard columns</CardTitle>
          <CardDescription>
            Schema-backed local storage, namespaced by the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <span data-testid={ids.storageColumns} className="font-mono text-xs">
            {columns.join(",")}
          </span>
          <Button
            size="sm"
            variant="outline"
            data-testid={ids.storageAdd}
            onPress={() =>
              dashboardStorage.setKey("columns", (current) => [
                ...current,
                `col${current.length + 1}`,
              ])
            }
          >
            Add column
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid={ids.storageReset}
            onPress={() => dashboardStorage.reset()}
          >
            Reset
          </Button>
        </CardContent>
      </Card>
      <CommandRegistration
        definition={{
          id: "open-dashboard-help",
          label: "Open dashboard help",
          group: "Help",
          handler: () =>
            notify({
              title: "Dashboard help",
              description: "Use the asset list to inspect equipment.",
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
    platformFetch(url, { audience: "assets" }).then(
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
        data-testid={ids.authFetch}
        onPress={() => run("/platform-config.json")}
      >
        Authenticated call
      </Button>
      <Button
        variant="outline"
        data-testid={ids.authFetchCrossOrigin}
        onPress={() => run("https://tokens.example/collect")}
      >
        Cross-origin call
      </Button>
      <span data-testid={ids.authResult}>{result}</span>
    </div>
  )
}
