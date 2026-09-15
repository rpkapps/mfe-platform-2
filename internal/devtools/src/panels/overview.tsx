import { Badge } from "@tecton/react/components/badge"
import { Button } from "@tecton/react/components/button"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Section, StateBadge } from "../ui"

export function OverviewPanel({ host, snapshot }: DevtoolsPanelRenderProps) {
  return (
    <>
      <Section title={`Loaded MFEs (${snapshot.remotes.length})`}>
        <DataTable
          columns={["MFE", "State", "Manifest", "Protocol", "React", "Router", "Instances", "Actions"]}
          empty="No remotes registered."
          rows={snapshot.remotes.map((remote) => [
            <span key="id">
              <strong>{remote.displayName ?? remote.mfeId}</strong>
              <br />
              <code>{remote.mfeId}</code>
              {remote.dev?.hmr ? (
                <>
                  {" "}
                  <Badge variant="info">HMR</Badge>
                </>
              ) : null}
              {remote.dev?.restartRequired ? (
                <>
                  {" "}
                  <Badge variant="warning">restart required</Badge>
                </>
              ) : null}
              {!remote.enabled ? (
                <>
                  {" "}
                  <Badge variant="secondary">disabled</Badge>
                </>
              ) : null}
              {!remote.discoverable ? (
                <>
                  {" "}
                  <Badge variant="outline">hidden</Badge>
                </>
              ) : null}
            </span>,
            <span key="state">
              <StateBadge state={remote.state} />
              <br />
              <small>attempts {remote.attempts}</small>
              {remote.error ? (
                <>
                  <br />
                  <code className="platform-devtools-error">{remote.error.code}</code> {remote.error.message}
                </>
              ) : null}
            </span>,
            <span key="manifest">
              {remote.manifestUrl ? <code>{remote.manifestUrl}</code> : "—"}
              <br />
              <small>source: {remote.manifestSource ?? "—"}</small>
            </span>,
            remote.protocolVersion ?? "—",
            remote.reactVersion ?? "—",
            remote.routerVersion ?? "—",
            <span key="instances">
              {remote.instances.length === 0 ? "—" : null}
              {remote.instances.map((instance) => (
                <span key={instance.instanceId} className="platform-devtools-instance">
                  <code>{instance.instanceId}</code> <StateBadge state={instance.state} />
                  {instance.widgetId ? <small> widget {instance.widgetId}</small> : null}
                </span>
              ))}
            </span>,
            <span key="actions">
              {host.remotes?.retry ? (
                <Button size="xs" variant="outline" onPress={() => void host.remotes?.retry?.(remote.mfeId).catch(() => undefined)}>
                  Retry
                </Button>
              ) : null}
            </span>,
          ])}
        />
      </Section>
      <Section title="Host">
        <p>
          {snapshot.host.kind} · environment <code>{snapshot.host.environment}</code> · protocol {snapshot.host.protocolVersion} · runtime config source <code>{snapshot.runtimeConfig.source ?? "static"}</code>
        </p>
      </Section>
    </>
  )
}
