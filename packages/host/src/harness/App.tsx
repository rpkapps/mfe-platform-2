import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  CAPABILITY_IDS,
  parseRuntimeConfig,
  type CapabilityId,
  type RuntimeConfig,
} from "@platform-internal/core"

import { Alert, AlertDescription, AlertTitle } from "@tecton/react/components/alert"
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
import { Input } from "@tecton/react/components/input"
import { Switch } from "@tecton/react/components/switch"
import {
  AppShell,
  AppShellBody,
  AppShellBrand,
  AppShellHeader,
  AppShellHeaderActions,
  AppShellMain,
  AppShellNav,
  AppShellSidebar,
} from "@tecton/react/tecton/app-shell"
import { Panel, PanelContent, PanelHeader, PanelTitle } from "@tecton/react/tecton/panel"
import { Tooltip, TooltipTrigger } from "@tecton/react/components/tooltip"
import {
  BookOpenIcon,
  BugIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react"

import type { FailureLab } from "../harness-entry"
import { connectManifest, HARNESS_PREFIX } from "../harness-entry"
import { AppFinder } from "../react/app-finder"
import { Breadcrumbs } from "../react/breadcrumbs"
import {
  PlatformProvider,
  useHostSelector,
  usePlatformHost,
  useShellLocation,
  useSubscription,
} from "../react/context"
import { PlatformDevtools } from "../react/devtools"
import { NotificationHost } from "../react/notifications"
import { MfeOutlet, WidgetSlot } from "../react/outlet"
import { ShellOverlayProvider } from "../react/overlay"
import { CommandPalette } from "../react/palette"
import { SettingsHost } from "../react/settings"
import { HelpSlot, ReleaseNotesSlot } from "../react/surfaces"
import type { PlatformHost } from "../types"

export interface HarnessAppProps {
  host: PlatformHost
  lab: FailureLab
  manifestUrls: string[]
  basePath: string
  setRuntimeConfig: (config: RuntimeConfig) => Promise<RuntimeConfig>
}

const PAGES = [
  { path: `${HARNESS_PREFIX}`, label: "Remotes" },
  { path: `${HARNESS_PREFIX}/widgets`, label: "Widgets playground" },
  { path: `${HARNESS_PREFIX}/settings`, label: "Settings" },
  { path: `${HARNESS_PREFIX}/help`, label: "Help" },
  { path: `${HARNESS_PREFIX}/release-notes`, label: "Release notes" },
  { path: `${HARNESS_PREFIX}/failure-lab`, label: "Failure lab" },
]

export function HarnessApp(props: HarnessAppProps) {
  return (
    <PlatformProvider host={props.host}>
      <ShellOverlayProvider>
        <HarnessShell {...props} />
        <NotificationHost />
        <PlatformDevtools force defaultOpen={false} />
      </ShellOverlayProvider>
    </PlatformProvider>
  )
}

function HarnessShell({ lab, manifestUrls, setRuntimeConfig }: HarnessAppProps) {
  const host = usePlatformHost()
  const location = useShellLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const theme = useSubscription(
    (listener) => host.context.subscribe(listener),
    () => host.context.getState().resolvedTheme,
    Object.is
  )
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])
  const pathname = location.pathname
  const page = pathname === "/" ? PAGES[0]!.path : pathname
  return (
    <AppShell data-platform-shell-chrome="">
      <AppShellHeader>
        <AppShellBrand>
          <SparklesIcon />
          Platform harness
        </AppShellBrand>
        <AppFinder
          shellName="Harness"
          extra={PAGES.map((entry) => ({
            id: entry.path,
            name: entry.label,
            href: entry.path,
            category: "Harness",
          }))}
        />
        <AppShellNav>
          <Breadcrumbs maxItems={5} />
        </AppShellNav>
        <AppShellHeaderActions>
          <ConnectedRemotesSummary />
          <Button
            variant="outline"
            size="sm"
            onPress={() => setPaletteOpen(true)}
            aria-label="Search"
            data-testid="harness-palette-trigger"
          >
            <SearchIcon /> Search <kbd className="text-muted-foreground text-xs">⌘K</kbd>
          </Button>
          <HeaderAction
            label="Settings"
            onPress={() => host.navigation.push(`${HARNESS_PREFIX}/settings`)}
          >
            <SettingsIcon />
          </HeaderAction>
          <HeaderAction
            label="Help"
            onPress={() => host.navigation.push(`${HARNESS_PREFIX}/help`)}
          >
            <BookOpenIcon />
          </HeaderAction>
          <HeaderAction
            label="Failure lab"
            onPress={() => host.navigation.push(`${HARNESS_PREFIX}/failure-lab`)}
          >
            <BugIcon />
          </HeaderAction>
        </AppShellHeaderActions>
      </AppShellHeader>
      <AppShellBody>
        <AppShellSidebar className="p-3">
          <nav aria-label="Harness pages" className="flex flex-col gap-1">
            {PAGES.map((entry) => (
              <Button
                key={entry.path}
                variant={page === entry.path ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onPress={() => host.navigation.push(entry.path)}
              >
                {entry.label}
              </Button>
            ))}
          </nav>
          <RemoteRoutesNav />
        </AppShellSidebar>
        <AppShellMain className="p-4">
          <HarnessRoute
            pathname={page}
            lab={lab}
            manifestUrls={manifestUrls}
            setRuntimeConfig={setRuntimeConfig}
          />
        </AppShellMain>
      </AppShellBody>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        settingsPath={`${HARNESS_PREFIX}/settings`}
        helpPath={`${HARNESS_PREFIX}/help`}
        releaseNotesPath={`${HARNESS_PREFIX}/release-notes`}
      />
    </AppShell>
  )
}

function HeaderAction({
  label,
  onPress,
  children,
}: {
  label: string
  onPress: () => void
  children: ReactNode
}) {
  return (
    <TooltipTrigger>
      <Button variant="ghost" size="icon-sm" aria-label={label} onPress={onPress}>
        {children}
      </Button>
      <Tooltip placement="bottom">{label}</Tooltip>
    </TooltipTrigger>
  )
}

function useRemotes() {
  return useHostSelector(
    (host) => host.remotes.list(),
    (a, b) => a.length === b.length && a.every((record, index) => record === b[index])
  )
}

function ConnectedRemotesSummary() {
  const remotes = useRemotes()
  const connected = remotes.filter((record) => record.manifest)
  return (
    <span className="text-muted-foreground text-xs" data-testid="harness-connected">
      {connected.length} remote{connected.length === 1 ? "" : "s"} connected
    </span>
  )
}

function RemoteRoutesNav() {
  const host = usePlatformHost()
  const remotes = useRemotes()
  const routed = remotes.filter((record) => record.manifest && record.manifest.kind === "mfe")
  if (routed.length === 0) return null
  return (
    <nav aria-label="Remote routes" className="mt-4 flex flex-col gap-1">
      <span className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
        Remotes
      </span>
      {routed.map((record) => (
        <Button
          key={record.mfeId}
          variant="ghost"
          size="sm"
          className="justify-start"
          onPress={() => host.navigation.push(host.routePrefixOf(record.mfeId))}
        >
          {record.displayName ?? record.mfeId}
          {!record.discoverable ? <Badge variant="outline">hidden</Badge> : null}
        </Button>
      ))}
    </nav>
  )
}

function HarnessRoute({
  pathname,
  lab,
  manifestUrls,
  setRuntimeConfig,
}: {
  pathname: string
  lab: FailureLab
  manifestUrls: string[]
  setRuntimeConfig: HarnessAppProps["setRuntimeConfig"]
}) {
  const host = usePlatformHost()
  if (pathname === HARNESS_PREFIX || pathname === `${HARNESS_PREFIX}/`)
    return <RemotesPage manifestUrls={manifestUrls} setRuntimeConfig={setRuntimeConfig} />
  if (pathname === `${HARNESS_PREFIX}/widgets`) return <WidgetsPlayground />
  if (pathname === `${HARNESS_PREFIX}/settings`)
    return (
      <Page title="Settings">
        <SettingsHost />
      </Page>
    )
  if (pathname === `${HARNESS_PREFIX}/help`)
    return (
      <Page title="Help">
        <HelpSlot />
      </Page>
    )
  if (pathname === `${HARNESS_PREFIX}/release-notes`)
    return (
      <Page title="Release notes">
        <ReleaseNotesSlot />
      </Page>
    )
  if (pathname === `${HARNESS_PREFIX}/failure-lab`) return <FailureLabPage lab={lab} />
  const match = host.remotes.matchRoute(pathname)
  if (match)
    return <MfeOutlet key={match.mfeId} mfeId={match.mfeId} routePrefix={match.routePrefix} />
  return (
    <Page title="No remote owns this route">
      <p className="text-muted-foreground">
        Nothing is registered for <code>{pathname}</code>. Connect a manifest or open one of the
        harness pages.
      </p>
    </Page>
  )
}

function Page({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-medium">{title}</h1>
        {actions}
      </div>
      {children}
    </div>
  )
}

function RemotesPage({
  manifestUrls,
  setRuntimeConfig,
}: {
  manifestUrls: string[]
  setRuntimeConfig: HarnessAppProps["setRuntimeConfig"]
}) {
  const host = usePlatformHost()
  const remotes = useRemotes()
  const [extraUrl, setExtraUrl] = useState("")
  return (
    <Page
      title="Connected remotes"
      actions={
        <Button
          size="sm"
          variant="outline"
          onPress={() => manifestUrls.forEach((url) => void connectManifest(host, url))}
        >
          <RefreshCwIcon /> Reload manifests
        </Button>
      }
    >
      <div className="harness-panel">
        {remotes.length === 0 ? (
          <p className="text-muted-foreground">Waiting for {manifestUrls.join(", ")}…</p>
        ) : null}
        {remotes.map((record) => (
          <div
            key={record.mfeId}
            className="harness-remote"
            data-testid={`harness-remote-${record.mfeId}`}
          >
            <div className="harness-remote-row">
              <strong>{record.displayName ?? record.mfeId}</strong>
              <code className="text-xs">{record.mfeId}</code>
              {record.dev?.hmr ? (
                <Badge variant="info">HMR</Badge>
              ) : record.manifest ? (
                <Badge variant="secondary">production artifact</Badge>
              ) : (
                <Badge variant="outline">connecting</Badge>
              )}
              {record.dev?.restartRequired ? (
                <Badge variant="warning">restart required</Badge>
              ) : null}
              <Badge
                variant={
                  record.state === "failed" || record.state === "unavailable"
                    ? "destructive"
                    : record.state === "mounted"
                      ? "success"
                      : "outline"
                }
              >
                {record.state}
              </Badge>
              {!record.enabled ? <Badge variant="secondary">disabled</Badge> : null}
              <Button
                size="xs"
                variant="outline"
                onPress={() => void host.remotes.retry(record.mfeId).catch(() => undefined)}
              >
                Reload remote
              </Button>
              {record.manifest?.kind === "mfe" ? (
                <Button
                  size="xs"
                  onPress={() => host.navigation.push(host.routePrefixOf(record.mfeId))}
                >
                  Open
                </Button>
              ) : null}
            </div>
            <div className="text-muted-foreground text-xs">
              manifest {record.manifestUrl ?? "—"} ({record.manifestSource ?? "—"}) · protocol{" "}
              {record.protocolVersion ?? "—"} · React{" "}
              {record.reactVersion ?? record.manifest?.runtime.react.requiredVersion ?? "—"} ·
              widgets {record.manifest?.widgets.map((widget) => widget.id).join(", ") || "none"}
            </div>
            {record.dev?.restartRequired ? (
              <Alert variant="warning">
                <AlertTitle>Restart the development server</AlertTitle>
                <AlertDescription>
                  {record.dev.restartReason ?? "A restart-requiring input changed."}
                </AlertDescription>
              </Alert>
            ) : null}
            {record.error ? (
              <Alert variant="destructive">
                <AlertTitle>
                  <code>{record.error.code}</code> {record.error.message}
                </AlertTitle>
                <AlertDescription>{record.error.hint}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ))}
        <div className="harness-remote-row">
          <Input
            aria-label="Manifest URL"
            placeholder="http://localhost:5174/platform-manifest.json"
            value={extraUrl}
            onChange={(event) => setExtraUrl(event.target.value)}
            className="max-w-md"
          />
          <Button
            size="sm"
            variant="outline"
            isDisabled={!extraUrl}
            onPress={() => void connectManifest(host, extraUrl).then(() => setExtraUrl(""))}
          >
            Connect manifest
          </Button>
        </div>
      </div>
      <ContextEditor setRuntimeConfig={setRuntimeConfig} />
    </Page>
  )
}

function ContextEditor({
  setRuntimeConfig,
}: {
  setRuntimeConfig: HarnessAppProps["setRuntimeConfig"]
}) {
  const host = usePlatformHost()
  const context = useSubscription(
    (listener) => host.context.subscribe(listener),
    () => host.context.getState(),
    Object.is
  )
  const remotes = useRemotes()
  const [groups, setGroups] = useState(context.permissionGroups.join(", "))
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({})
  const [envError, setEnvError] = useState<string | null>(null)
  const config = useSubscription(
    (listener) => host.config.subscribe(listener),
    () => host.config.get(),
    Object.is
  )
  const text = (label: string, value: string, onCommit: (value: string) => void) => (
    <label className="harness-form-row">
      <span>{label}</span>
      <Input defaultValue={value} onBlur={(event) => onCommit(event.target.value)} />
    </label>
  )
  const applyEnv = (mfeId: string) => {
    try {
      const env = JSON.parse(envDrafts[mfeId] ?? "{}") as Record<
        string,
        string | number | boolean
      >
      const next = parseRuntimeConfig(
        {
          ...config,
          mfes: { ...config.mfes, [mfeId]: { ...(config.mfes[mfeId] ?? { env: {} }), env } },
        },
        "harness"
      )
      setEnvError(null)
      void setRuntimeConfig(next)
    } catch (error) {
      setEnvError(error instanceof Error ? error.message : String(error))
    }
  }
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Platform context</PanelTitle>
      </PanelHeader>
      <PanelContent>
        <div className="harness-form">
          {text("User display name", context.user?.displayName ?? "", (value) =>
            host.context.patch({
              user: { ...(context.user ?? { id: "u-local" }), displayName: value },
            })
          )}
          <label className="harness-form-row">
            <span>Permission groups (comma separated)</span>
            <Input
              value={groups}
              onChange={(event) => setGroups(event.target.value)}
              onBlur={() =>
                host.context.patch({
                  permissionGroups: groups
                    .split(",")
                    .map((group) => group.trim())
                    .filter(Boolean),
                })
              }
              data-testid="harness-groups"
            />
          </label>
          {text("Tenant id", context.tenant?.id ?? "", (value) =>
            host.context.patch({ tenant: value ? { id: value, name: value } : null })
          )}
          {text("Project id", context.project?.id ?? "", (value) =>
            host.context.patch({ project: value ? { id: value, name: value } : null })
          )}
          {text("Job id", context.job?.id ?? "", (value) =>
            host.context.patch({ job: value ? { id: value, name: value } : null })
          )}
          {text("Locale", context.locale, (value) =>
            host.context.patch({ locale: value || "en-US" })
          )}
          {text("Timezone", context.timezone, (value) =>
            host.context.patch({ timezone: value || "UTC" })
          )}
          <label className="harness-form-row">
            <span>Theme</span>
            <select
              className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
              value={context.theme}
              onChange={(event) => {
                const theme = event.target.value as "light" | "dark" | "system"
                const prefersDark =
                  typeof window !== "undefined" &&
                  window.matchMedia?.("(prefers-color-scheme: dark)").matches
                host.context.patch({
                  theme,
                  resolvedTheme: theme === "system" ? (prefersDark ? "dark" : "light") : theme,
                })
              }}
            >
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <div className="harness-form-row">
            <span>Feature flags</span>
            <div className="harness-flags">
              {Object.entries(context.featureFlags).map(([flag, value]) => (
                <Switch
                  key={flag}
                  isSelected={Boolean(value)}
                  onChange={(next) =>
                    host.context.patch({
                      featureFlags: { ...context.featureFlags, [flag]: next },
                    })
                  }
                >
                  {flag}
                </Switch>
              ))}
              <Input
                placeholder="new-flag"
                className="max-w-40"
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  const name = (event.target as HTMLInputElement).value.trim()
                  if (name)
                    host.context.patch({
                      featureFlags: { ...context.featureFlags, [name]: true },
                    })
                  ;(event.target as HTMLInputElement).value = ""
                }}
              />
            </div>
          </div>
          {remotes.map((record) => (
            <div key={record.mfeId} className="harness-form-row">
              <span>
                Runtime env for {record.mfeId} (JSON, allow-listed keys:{" "}
                {Object.keys(record.manifest?.env.keys ?? {}).join(", ") || "none declared"})
              </span>
              <textarea
                className="harness-textarea border-input rounded-md border bg-transparent p-2"
                value={
                  envDrafts[record.mfeId] ??
                  JSON.stringify(config.mfes[record.mfeId]?.env ?? {}, null, 2)
                }
                onChange={(event) =>
                  setEnvDrafts((drafts) => ({ ...drafts, [record.mfeId]: event.target.value }))
                }
              />
              <div>
                <Button size="xs" variant="outline" onPress={() => applyEnv(record.mfeId)}>
                  Apply env
                </Button>
              </div>
            </div>
          ))}
          {envError ? <p className="text-destructive text-sm">{envError}</p> : null}
        </div>
      </PanelContent>
    </Panel>
  )
}

function WidgetsPlayground() {
  const remotes = useRemotes()
  const widgets = remotes.flatMap((record) =>
    (record.manifest?.widgets ?? []).map((widget) => ({
      mfeId: record.mfeId,
      widgetId: widget.id,
      title: widget.title ?? widget.id,
    }))
  )
  const [selected, setSelected] = useState<string>("")
  const [count, setCount] = useState(2)
  const [propsText, setPropsText] = useState("{}")
  const [propsError, setPropsError] = useState<string | null>(null)
  const parsedProps = useMemo(() => {
    try {
      const value = JSON.parse(propsText) as Record<string, unknown>
      setPropsError(null)
      return value
    } catch (error) {
      setPropsError(error instanceof Error ? error.message : String(error))
      return {}
    }
  }, [propsText])
  const choice =
    widgets.find((widget) => `${widget.mfeId}/${widget.widgetId}` === selected) ?? widgets[0]
  return (
    <Page title="Widgets playground">
      <div className="harness-form">
        <label className="harness-form-row">
          <span>Widget</span>
          <select
            className="border-input rounded-md border bg-transparent px-2 py-1 text-sm"
            value={choice ? `${choice.mfeId}/${choice.widgetId}` : ""}
            onChange={(event) => setSelected(event.target.value)}
          >
            {widgets.length === 0 ? (
              <option value="">No widgets declared by connected remotes</option>
            ) : null}
            {widgets.map((widget) => (
              <option
                key={`${widget.mfeId}/${widget.widgetId}`}
                value={`${widget.mfeId}/${widget.widgetId}`}
              >
                {widget.title} ({widget.mfeId})
              </option>
            ))}
          </select>
        </label>
        <label className="harness-form-row">
          <span>Instances</span>
          <Input
            type="number"
            min={1}
            max={12}
            value={String(count)}
            onChange={(event) =>
              setCount(Math.max(1, Math.min(12, Number(event.target.value) || 1)))
            }
            className="max-w-24"
          />
        </label>
        <label className="harness-form-row">
          <span>Props (JSON, pushed to every instance through setProps)</span>
          <textarea
            className="harness-textarea border-input rounded-md border bg-transparent p-2"
            value={propsText}
            onChange={(event) => setPropsText(event.target.value)}
          />
          {propsError ? <span className="text-destructive">{propsError}</span> : null}
        </label>
        <OverlappingModals />
      </div>
      {choice ? (
        <div className="harness-widgets-grid">
          {Array.from({ length: count }, (_, index) => (
            <div
              key={`${choice.mfeId}/${choice.widgetId}/${index}`}
              className="harness-widget-card"
            >
              <div className="text-muted-foreground mb-2 text-xs">
                {choice.title} · instance {index + 1}
              </div>
              <WidgetSlot
                mfeId={choice.mfeId}
                widgetId={choice.widgetId}
                slot={`playground-${index + 1}`}
                props={{ ...parsedProps, instance: index + 1 }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </Page>
  )
}

function OverlappingModals() {
  return (
    <DialogTrigger>
      <Button variant="outline" size="sm">
        Open shell modal (overlapping)
      </Button>
      <Dialog>
        <DialogHeader>
          <DialogTitle>Shell dialog</DialogTitle>
          <DialogDescription>
            Open a widget dialog on top of this one to check global modal ordering.
          </DialogDescription>
        </DialogHeader>
        <DialogTrigger>
          <Button variant="outline" size="sm">
            Open a second shell dialog
          </Button>
          <Dialog>
            <DialogHeader>
              <DialogTitle>Second shell dialog</DialogTitle>
              <DialogDescription>
                The overlay manager allocated a higher layer for this one.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter showCloseButton />
          </Dialog>
        </DialogTrigger>
        <DialogFooter showCloseButton />
      </Dialog>
    </DialogTrigger>
  )
}

function FailureLabPage({ lab }: { lab: FailureLab }) {
  const host = usePlatformHost()
  const remotes = useRemotes()
  const version = useSubscription(
    lab.subscribe,
    () =>
      JSON.stringify({
        ...lab.state,
        manifest404: [...lab.state.manifest404],
        droppedCapabilities: [...lab.state.droppedCapabilities],
        unavailable: [...lab.state.unavailable],
      }),
    Object.is
  )
  const [savedGroups, setSavedGroups] = useState<string[] | null>(null)
  const toggle = (
    mutate: () => void,
    mfeIds: string[] = remotes.map((record) => record.mfeId)
  ) => {
    mutate()
    lab.notify()
    for (const mfeId of mfeIds) void host.remotes.retry(mfeId).catch(() => undefined)
  }
  return (
    <Page title="Failure lab">
      <p className="text-muted-foreground text-sm">
        Each switch changes the host policy and reloads the affected remotes; outcomes are
        visible below, in the outlets and in the developer tools.
      </p>
      <div className="harness-lab" data-lab-version={version}>
        {remotes.map((record) => (
          <div key={record.mfeId} className="harness-lab-row">
            <strong className="min-w-40">{record.displayName ?? record.mfeId}</strong>
            <Switch
              isSelected={lab.state.manifest404.has(record.mfeId)}
              onChange={(on) =>
                toggle(() => {
                  if (on) {
                    lab.state.manifest404.add(record.mfeId)
                    host.remotes.setLocalOverride(
                      record.mfeId,
                      `${record.manifestUrl ?? "/platform-manifest.json"}?lab=missing&path=/does-not-exist.json`.replace(
                        /platform-manifest\.json\?/,
                        "missing-manifest.json?"
                      )
                    )
                  } else {
                    lab.state.manifest404.delete(record.mfeId)
                    host.remotes.setLocalOverride(record.mfeId, null)
                  }
                }, [record.mfeId])
              }
            >
              Manifest 404
            </Switch>
            <Switch
              isSelected={lab.state.unavailable.has(record.mfeId)}
              onChange={(on) =>
                toggle(
                  () =>
                    on
                      ? lab.state.unavailable.add(record.mfeId)
                      : lab.state.unavailable.delete(record.mfeId),
                  [record.mfeId]
                )
              }
            >
              Unavailable remote
            </Switch>
            <Badge
              variant={
                record.state === "failed" || record.state === "unavailable"
                  ? "destructive"
                  : record.state === "mounted"
                    ? "success"
                    : "outline"
              }
            >
              {record.state}
            </Badge>
            {record.error ? (
              <code className="text-destructive text-xs">{record.error.code}</code>
            ) : null}
          </div>
        ))}
        <div className="harness-lab-row">
          <Switch
            isSelected={lab.state.denyGroups}
            onChange={(on) => {
              if (on) {
                setSavedGroups(host.context.getState().permissionGroups)
                host.context.patch({ permissionGroups: [] })
              } else host.context.patch({ permissionGroups: savedGroups ?? ["admin"] })
              toggle(() => {
                lab.state.denyGroups = on
              })
            }}
          >
            Deny every permission group (preflight → PERMISSION_DENIED)
          </Switch>
        </div>
        <div className="harness-lab-row">
          <Switch
            isSelected={lab.state.incompatibleShared}
            onChange={(on) =>
              toggle(() => {
                lab.state.incompatibleShared = on
              })
            }
          >
            Mark shared dependencies incompatible (requires ^99.0.0 → bundled fallbacks
            reported)
          </Switch>
        </div>
        <div className="harness-lab-row">
          <span className="min-w-40">Drop capabilities</span>
          {CAPABILITY_IDS.map((capability: CapabilityId) => (
            <Switch
              key={capability}
              size="sm"
              isSelected={lab.state.droppedCapabilities.has(capability)}
              onChange={(on) =>
                toggle(() =>
                  on
                    ? lab.state.droppedCapabilities.add(capability)
                    : lab.state.droppedCapabilities.delete(capability)
                )
              }
            >
              {capability}
            </Switch>
          ))}
        </div>
      </div>
      <SharedOutcomes />
    </Page>
  )
}

function SharedOutcomes() {
  const host = usePlatformHost()
  const remotes = useRemotes()
  const loaded = remotes.filter((record) => record.loaded)
  if (loaded.length === 0) return null
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Shared dependency outcomes</PanelTitle>
      </PanelHeader>
      <PanelContent>
        {loaded.map((record) => (
          <div key={record.mfeId} className="mb-2">
            <strong>{record.mfeId}</strong>
            <ul className="text-xs">
              {host.remotes.sharedReport(record.mfeId).map((row) => (
                <li key={row.name}>
                  {row.name} · {row.scope} ·{" "}
                  <Badge variant={row.outcome === "shared" ? "success" : "warning"}>
                    {row.outcome}
                  </Badge>{" "}
                  {row.version ?? ""} {row.from ? `from ${row.from}` : ""} — {row.reason}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </PanelContent>
    </Panel>
  )
}
