import { Badge } from "@tecton/react/components/badge"

import type { DevtoolsPanelRenderProps } from "../registry"
import { DataTable, Section, formatTime } from "../ui"

export function RoutesPanel({ snapshot }: DevtoolsPanelRenderProps) {
  return (
    <>
      <Section title="Route prefixes">
        <DataTable
          columns={["MFE", "Route prefix", "Discoverable", "State"]}
          rows={snapshot.remotes.map((remote) => [
            remote.mfeId,
            <code key="p">{remote.routePrefix ?? "—"}</code>,
            remote.discoverable ? "yes" : "hidden",
            remote.state,
          ])}
        />
      </Section>
      <Section title="Route matches and guards">
        <DataTable
          columns={[
            "Time",
            "MFE / instance",
            "Path",
            "Route",
            "Guarded",
            "Guard outcome",
            "Error",
          ]}
          empty="No route matches reported by remotes yet."
          rows={snapshot.routes.map((match) => [
            formatTime(match.at),
            <span key="o">
              {match.mfeId ?? "—"}
              <br />
              <small>{match.instanceId ?? ""}</small>
            </span>,
            <code key="p">{match.pathname}</code>,
            <code key="r">{match.routeId}</code>,
            match.guarded ? "yes" : "no",
            match.guard ? (
              <Badge
                key="g"
                variant={
                  match.guard.outcome === "allowed"
                    ? "success"
                    : match.guard.outcome === "redirected"
                      ? "info"
                      : "destructive"
                }
              >
                {match.guard.outcome}
                {match.guard.detail ? ` · ${match.guard.detail}` : ""}
              </Badge>
            ) : (
              "—"
            ),
            match.error ?? "—",
          ])}
        />
      </Section>
    </>
  )
}
